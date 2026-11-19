-- 🌙 «Απόψε» χωρίς ώρα: μέρα συνάντησης (meet_day) + μέρος της μέρας (meet_part = 'evening').
alter table public.outings add column if not exists meet_part text;
alter table public.outings add constraint outings_meet_part check (meet_part is null or (meet_part = 'evening' and meet_day is not null));

-- ---------- create_outing: νέα παράμετρος p_meet_part (στο τέλος) ----------
drop function if exists public.create_outing(public.activity_kind, public.city_id, timestamptz, text, jsonb, uuid[], jsonb, text, timestamptz, jsonb, boolean, boolean, date, text, int, timestamptz);

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
  p_hide_participants boolean default false,
  p_no_place          boolean default false,
  p_meet_day          date default null,
  p_description       text default null,
  p_duration_minutes  int default null,
  p_ends_at           timestamptz default null,
  p_meet_part         text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_outing uuid;
  v_part uuid;
  g jsonb;
  v_fixed boolean := p_venue is not null;
  -- «Χωρίς μέρος»: απλώς συνάντηση — ούτε μαγαζί ούτε αφετηρίες
  v_none boolean := coalesce(p_no_place, false) and p_venue is null;
  v_venue jsonb;
  v_lat double precision;
  v_lng double precision;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_title is not null and char_length(p_title) > 80 then
    raise exception 'title too long' using errcode = '22023';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'description too long' using errcode = '22023';
  end if;
  -- 🌙 «Απόψε»: μόνο μαζί με μέρα (χωρίς συγκεκριμένη ώρα)
  if p_meet_part is not null and (p_meet_part <> 'evening' or p_meet_day is null) then
    raise exception 'invalid meet_part' using errcode = '22023';
  end if;
  -- ⏱ Διάρκεια: ώρες/μέρες (λεπτά) Ή ακριβής λήξη — όχι και τα δύο
  if p_duration_minutes is not null and p_ends_at is not null then
    raise exception 'duration with ends_at' using errcode = '22023';
  end if;
  if p_duration_minutes is not null and p_duration_minutes not between 15 and 259200 then
    raise exception 'duration out of range' using errcode = '22023';
  end if;
  if p_ends_at is not null then
    if p_ends_at <= now() or p_ends_at > now() + interval '186 days' then
      raise exception 'ends_at out of range' using errcode = '22023';
    end if;
    if p_meet_at is not null and p_ends_at <= p_meet_at then
      raise exception 'ends_at before meet_at' using errcode = '22023';
    end if;
    if p_meet_day is not null and (p_ends_at at time zone 'Europe/Athens')::date < p_meet_day then
      raise exception 'ends_at before meet_day' using errcode = '22023';
    end if;
  end if;
  if p_category is not null and p_activity = 'spot' then
    raise exception 'spot has no categories' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_guests, '[]'::jsonb)) <> 'array' then
    raise exception 'guests must be an array' using errcode = '22023';
  end if;
  -- «Σήμερα» (χωρίς ώρα): μόνο μέρα, όχι μαζί με συγκεκριμένη ώρα
  if p_meet_day is not null then
    if p_meet_at is not null then
      raise exception 'meet_day with meet_at' using errcode = '22023';
    end if;
    if p_meet_day < (now() at time zone 'Europe/Athens')::date
       or p_meet_day > (now() at time zone 'Europe/Athens')::date + 89 then
      raise exception 'meet_day out of range' using errcode = '22023';
    end if;
  end if;
  if p_respond_by is not null then
    -- Χρονόμετρο έως 6 μήνες (λεπτά · ώρες · μέρες · εβδομάδες · μήνες)
    if p_respond_by <= now() or p_respond_by > now() + interval '186 days' then
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

  insert into public.outings (organizer_id, title, description, duration_minutes, ends_at, activity, category, city, meet_at, meet_day, meet_part, respond_by, place_mode, chosen_venue, hide_participants)
  values (me, nullif(trim(p_title), ''), nullif(trim(p_description), ''), p_duration_minutes, p_ends_at, p_activity, nullif(p_category, ''), p_city, p_meet_at, p_meet_day, p_meet_part,
          case when coalesce(cardinality(p_invitees), 0) > 0 then p_respond_by end,
          case when v_fixed then 'fixed' when v_none then 'none' else 'fair' end,
          v_venue,
          coalesce(p_hide_participants, false))
  returning id into v_outing;

  insert into public.outing_participants (outing_id, user_id, rsvp)
  values (v_outing, me, 'going')
  returning id into v_part;
  if p_me is not null and not v_fixed and not v_none then
    perform public._set_origin(v_part, v_outing, p_me);
  end if;

  for g in select value from jsonb_array_elements(coalesce(p_guests, '[]'::jsonb)) loop
    if char_length(coalesce(trim(g->>'name'), '')) = 0 then
      raise exception 'guest name required' using errcode = '22023';
    end if;
    insert into public.outing_participants (outing_id, guest_name, rsvp)
    values (v_outing, trim(g->>'name'), 'going')
    returning id into v_part;
    if not v_fixed and not v_none then
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
      when v_none then 'Νέα έξοδος! Πες αν έρχεσαι.'
      else 'Νέα έξοδος! Δήλωσε από πού ξεκινάς και με τι μέσο.' end,
    jsonb_build_object('event', 'outing_created')
  );
  return v_outing;
end $$;

revoke all on function public.create_outing from public, anon;
grant execute on function public.create_outing to authenticated;

-- ---------- Push πρόσκλησης: «… για καφέ απόψε» ----------
create or replace function public._push_on_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o record;
begin
  select ou.id, ou.activity, ou.meet_at, ou.meet_day, ou.meet_part, ou.respond_by, ou.organizer_id, ou.place_mode, ou.chosen_venue,
         pr.display_name as organizer
    into o
  from public.outings ou join public.profiles pr on pr.id = ou.organizer_id
  where ou.id = new.outing_id;
  if new.user_id is null or new.user_id = o.organizer_id then return new; end if;
  perform public._send_push(
    array[new.user_id],
    'Πρόσκληση 📍',
    format('%s σε προσκαλεί για %s%s%s. Θα έρθεις;%s', o.organizer, public._activity_label(o.activity),
           case when o.place_mode = 'fixed' and o.chosen_venue->>'name' is not null
             then format(' στο «%s»', o.chosen_venue->>'name') else '' end,
           case when o.meet_at is not null then public._when_label(o.meet_at)
                when o.meet_part = 'evening' and o.meet_day = (now() at time zone 'Europe/Athens')::date then ' απόψε'
                when o.meet_part = 'evening' then public._day_label(o.meet_day) || ' το βράδυ'
                else public._day_label(o.meet_day) end,
           public._deadline_label(o.respond_by)),
    jsonb_build_object('url', '/outing/' || o.id)
  );
  return new;
end $$;

-- ---------- my_outings: + meet_part ----------
drop function if exists public.my_outings();

create function public.my_outings()
returns table (
  id                uuid,
  title             text,
  activity          public.activity_kind,
  category          text,
  city              public.city_id,
  meet_at           timestamptz,
  status            public.outing_status,
  is_organizer      boolean,
  organizer_name    text,
  my_participant_id uuid,
  my_rsvp           public.rsvp_status,
  my_declared       boolean,
  declared_count    int,
  total_count       int,
  created_at        timestamptz,
  respond_by        timestamptz,
  unanswered_count  int,
  place_mode        text,
  venue_name        text,
  going_count       int,
  meet_day          date,
  saved             boolean,
  meet_part         text
)
language sql stable security definer set search_path = '' as $$
  select
    o.id, o.title, o.activity, o.category, o.city, o.meet_at, o.status,
    o.organizer_id = auth.uid(),
    coalesce(pr.display_name, '?'),
    mp.id, mp.rsvp, mp.declared_at is not null,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined' and x.declared_at is not null)::int,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined')::int,
    o.created_at,
    o.respond_by,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp = 'invited')::int,
    o.place_mode,
    nullif(o.chosen_venue->>'name', ''),
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp = 'going')::int,
    o.meet_day,
    exists (select 1 from public.saved_outings s where s.user_id = auth.uid() and s.outing_id = o.id),
    o.meet_part
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  left join public.profiles pr on pr.id = o.organizer_id
  where o.status not in ('cancelled', 'done')
  order by o.created_at desc
  limit 50;
$$;

revoke all on function public.my_outings from public, anon;
grant execute on function public.my_outings to authenticated;

-- ---------- my_saved_outings: οι αποθηκευμένες (όλες οι καταστάσεις), νεότερη αποθήκευση πρώτα ----------
drop function if exists public.my_saved_outings();

create function public.my_saved_outings()
returns table (
  id                uuid,
  title             text,
  activity          public.activity_kind,
  category          text,
  city              public.city_id,
  meet_at           timestamptz,
  status            public.outing_status,
  is_organizer      boolean,
  organizer_name    text,
  my_participant_id uuid,
  my_rsvp           public.rsvp_status,
  my_declared       boolean,
  declared_count    int,
  total_count       int,
  created_at        timestamptz,
  respond_by        timestamptz,
  unanswered_count  int,
  place_mode        text,
  venue_name        text,
  going_count       int,
  meet_day          date,
  saved             boolean,
  meet_part         text
)
language sql stable security definer set search_path = '' as $$
  select
    o.id, o.title, o.activity, o.category, o.city, o.meet_at, o.status,
    o.organizer_id = auth.uid(),
    coalesce(pr.display_name, '?'),
    mp.id, mp.rsvp, mp.declared_at is not null,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined' and x.declared_at is not null)::int,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined')::int,
    o.created_at,
    o.respond_by,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp = 'invited')::int,
    o.place_mode,
    nullif(o.chosen_venue->>'name', ''),
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp = 'going')::int,
    o.meet_day,
    exists (select 1 from public.saved_outings s where s.user_id = auth.uid() and s.outing_id = o.id),
    o.meet_part
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  join public.saved_outings sv on sv.outing_id = o.id and sv.user_id = auth.uid()
  left join public.profiles pr on pr.id = o.organizer_id
  order by sv.created_at desc
  limit 100;
$$;

revoke all on function public.my_saved_outings from public, anon;
grant execute on function public.my_saved_outings to authenticated;
