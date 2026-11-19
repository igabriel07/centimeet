-- «Κρυφή λίστα καλεσμένων»: οι καλεσμένοι δεν βλέπουν ποιοι άλλοι είναι καλεσμένοι
-- (μόνο τον διοργανωτή και τον εαυτό τους). Ο διοργανωτής βλέπει όλους. Προεπιλογή: όλοι βλέπουν όλους.
-- Εφαρμόζεται ΣΤΗ ΒΑΣΗ: RLS του outing_participants, get_outing_participants και ομαδική συνομιλία.

alter table public.outings add column if not exists hide_participants boolean not null default false;

-- Μπορεί ο u να δει τη συμμετοχή του (participant) p_user στην έξοδο o;
create or replace function public.can_see_participant(o uuid, p_user uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.outings x
    where x.id = o
      and (not x.hide_participants or x.organizer_id = u or p_user = u or p_user = x.organizer_id)
  );
$$;
revoke all on function public.can_see_participant from public, anon;
grant execute on function public.can_see_participant to authenticated;

drop policy if exists "participants read" on public.outing_participants;
create policy "participants read" on public.outing_participants for select to authenticated
  using (public.is_outing_member(outing_id, auth.uid()) and public.can_see_participant(outing_id, user_id, auth.uid()));

-- ---------- get_outing_participants: φιλτράρει τους κρυφούς ----------
create or replace function public.get_outing_participants(p_outing uuid)
returns table (
  id           uuid,
  user_id      uuid,
  name         text,
  mode         public.transport_mode,
  rsvp         public.rsvp_status,
  declared     boolean,
  is_organizer boolean,
  lat          double precision,
  lng          double precision,
  origin_label text,
  preference   public.place_preference
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  v_org uuid;
  v_hidden boolean;
begin
  if me is null or not public.is_outing_member(p_outing, me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.organizer_id, o.hide_participants into v_org, v_hidden from public.outings o where o.id = p_outing;

  return query
  select
    p.id,
    p.user_id,
    coalesce(pr.display_name, p.guest_name, '?'),
    p.mode,
    p.rsvp,
    p.declared_at is not null,
    coalesce(p.user_id = v_org, false),
    case when v_org = me or p.user_id = me then extensions.st_y(oo.origin::extensions.geometry) end,
    case when v_org = me or p.user_id = me then extensions.st_x(oo.origin::extensions.geometry) end,
    case when v_org = me or p.user_id = me then oo.label end,
    p.preference
  from public.outing_participants p
  left join public.profiles pr on pr.id = p.user_id
  left join public.outing_origins oo on oo.participant_id = p.id
  where p.outing_id = p_outing
    and (not v_hidden or v_org = me or p.user_id = me or p.user_id = v_org)
  order by p.created_at, p.id;
end $$;

-- ---------- Ομαδική συνομιλία: με κρυφή λίστα οι καλεσμένοι ΔΕΝ μπαίνουν (θα έβλεπαν ποιοι γράφουν) ----------
create or replace function public.handle_new_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null
     and not exists (select 1 from public.outings o
                     where o.id = new.outing_id and o.hide_participants and o.organizer_id <> new.user_id) then
    insert into public.conversation_members (conversation_id, user_id)
    select id, new.user_id from public.conversations where outing_id = new.outing_id
    on conflict do nothing;
  end if;
  return new;
end $$;

-- ---------- create_outing: νέα παράμετρος p_hide_participants (στο τέλος) ----------
drop function if exists public.create_outing(public.activity_kind, public.city_id, timestamptz, text, jsonb, uuid[], jsonb, text, timestamptz, jsonb);

create or replace function public.create_outing(
  p_activity          public.activity_kind,
  p_city              public.city_id,
  p_meet_at           timestamptz default null,
  p_title             text default null,
  p_me                jsonb default null,
  p_invitees          uuid[] default '{}',
  p_guests            jsonb default '[]',
  p_category          text default null,
  p_respond_by        timestamptz default null,
  p_venue             jsonb default null,
  p_hide_participants boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_outing uuid;
  v_part uuid;
  g jsonb;
  v_fixed boolean := p_venue is not null;
  v_venue jsonb;
  v_lat double precision;
  v_lng double precision;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_title is not null and char_length(p_title) > 80 then
    raise exception 'title too long' using errcode = '22023';
  end if;
  if p_category is not null and p_activity = 'spot' then
    raise exception 'spot has no categories' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_guests, '[]'::jsonb)) <> 'array' then
    raise exception 'guests must be an array' using errcode = '22023';
  end if;
  if p_respond_by is not null then
    if p_respond_by <= now() or p_respond_by > now() + interval '7 days' then
      raise exception 'respond_by out of range' using errcode = '22023';
    end if;
    if p_meet_at is not null and p_respond_by > p_meet_at then
      raise exception 'respond_by after meet_at' using errcode = '22023';
    end if;
  end if;

  if v_fixed then
    begin
      v_lat := (p_venue->'location'->>'lat')::double precision;
      v_lng := (p_venue->'location'->>'lng')::double precision;
    exception when others then
      raise exception 'invalid venue location' using errcode = '22023';
    end;
    if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      raise exception 'invalid venue location' using errcode = '22023';
    end if;
    if char_length(coalesce(trim(p_venue->>'name'), '')) not between 1 and 200 then
      raise exception 'invalid venue name' using errcode = '22023';
    end if;
    v_venue := jsonb_strip_nulls(jsonb_build_object(
      'id', left(p_venue->>'id', 300),
      'name', trim(p_venue->>'name'),
      'address', left(p_venue->>'address', 300),
      'location', jsonb_build_object('lat', v_lat, 'lng', v_lng),
      'rating', case when jsonb_typeof(p_venue->'rating') = 'number' then p_venue->'rating' end,
      'ratingCount', case when jsonb_typeof(p_venue->'ratingCount') = 'number' then p_venue->'ratingCount' end
    ));
  end if;

  insert into public.outings (organizer_id, title, activity, category, city, meet_at, respond_by, place_mode, chosen_venue, hide_participants)
  values (me, nullif(trim(p_title), ''), p_activity, nullif(p_category, ''), p_city, p_meet_at,
          case when coalesce(cardinality(p_invitees), 0) > 0 then p_respond_by end,
          case when v_fixed then 'fixed' else 'fair' end,
          v_venue,
          coalesce(p_hide_participants, false))
  returning id into v_outing;

  insert into public.outing_participants (outing_id, user_id, rsvp)
  values (v_outing, me, 'going')
  returning id into v_part;
  if p_me is not null and not v_fixed then
    perform public._set_origin(v_part, v_outing, p_me);
  end if;

  for g in select value from jsonb_array_elements(coalesce(p_guests, '[]'::jsonb)) loop
    if char_length(coalesce(trim(g->>'name'), '')) = 0 then
      raise exception 'guest name required' using errcode = '22023';
    end if;
    insert into public.outing_participants (outing_id, guest_name, rsvp)
    values (v_outing, trim(g->>'name'), 'going')
    returning id into v_part;
    if not v_fixed then
      perform public._set_origin(v_part, v_outing, g);
    end if;
  end loop;

  perform public._add_invitees(v_outing, me, p_invitees);

  if (select count(*) from public.outing_participants where outing_id = v_outing) < 2 then
    raise exception 'need at least 2 participants' using errcode = '22023';
  end if;

  perform public._outing_system_message(
    v_outing,
    case when v_fixed
      then format('Νέα έξοδος στο «%s»! Πες αν έρχεσαι.', v_venue->>'name')
      else 'Νέα έξοδος! Δήλωσε από πού ξεκινάς και με τι μέσο.' end,
    jsonb_build_object('event', 'outing_created')
  );
  return v_outing;
end $$;

revoke all on function public.create_outing from public, anon;
grant execute on function public.create_outing to authenticated;
