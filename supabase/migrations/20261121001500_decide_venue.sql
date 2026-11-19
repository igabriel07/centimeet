-- 📨 Ο διοργανωτής διαλέγει μαγαζί από τις προτάσεις και το στέλνει στην παρέα ΜΕΣΑ στην εφαρμογή:
-- η έξοδος γίνεται «decided», κάθε συμμετέχων κρατά τη δική του διαδρομή (plan), μήνυμα στη συνομιλία + push.
alter table public.outing_participants add column if not exists plan jsonb;

create or replace function public.decide_venue(p_outing uuid, p_venue jsonb, p_plans jsonb default '[]')
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  o record;
  v_lat double precision;
  v_lng double precision;
  v_venue jsonb;
  pl jsonb;
  v_url text;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select id, organizer_id, status, activity into o from public.outings where id = p_outing for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if o.organizer_id <> me then raise exception 'not allowed' using errcode = '42501'; end if;
  if o.status in ('cancelled', 'done') then raise exception 'outing closed' using errcode = '55000'; end if;

  -- Μαγαζί: ίδιος καθαρισμός με το create_outing
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

  update public.outings set chosen_venue = v_venue, status = 'decided' where id = p_outing;

  -- Διαδρομή ανά άτομο (μόνο για συμμετέχοντες αυτής της εξόδου· καθαρισμένα πεδία)
  update public.outing_participants set plan = null where outing_id = p_outing;
  if jsonb_typeof(coalesce(p_plans, '[]'::jsonb)) <> 'array' then
    raise exception 'plans must be an array' using errcode = '22023';
  end if;
  for pl in select value from jsonb_array_elements(coalesce(p_plans, '[]'::jsonb)) loop
    v_url := pl->>'navigationUrl';
    if v_url is not null and (v_url !~ '^https://' or char_length(v_url) > 2000) then v_url := null; end if;
    update public.outing_participants
       set plan = jsonb_strip_nulls(jsonb_build_object(
         'mode', left(pl->>'mode', 20),
         'durationMin', case when jsonb_typeof(pl->'durationMin') = 'number' then pl->'durationMin' end,
         'distanceKm', case when jsonb_typeof(pl->'distanceKm') = 'number' then pl->'distanceKm' end,
         'costEur', case when jsonb_typeof(pl->'costEur') = 'number' then pl->'costEur' end,
         'navigationUrl', v_url,
         -- Βήματα συγκοινωνίας: 🚶 → 🚌 31 (στάση–στάση) → Ⓜ … (καθαρισμένα, έως 15)
         'steps', (
           select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                    'kind', case when st.value->>'kind' in ('walk', 'bus', 'metro', 'tram', 'train', 'trolley', 'other') then st.value->>'kind' else 'other' end,
                    'line', left(st.value->>'line', 20),
                    'from', left(st.value->>'from', 80),
                    'to', left(st.value->>'to', 80),
                    'durationMin', case when jsonb_typeof(st.value->'durationMin') = 'number' then st.value->'durationMin' end
                  )) order by st.ord)
           from jsonb_array_elements(case when jsonb_typeof(pl->'steps') = 'array' then pl->'steps' else '[]'::jsonb end)
                with ordinality as st(value, ord)
           where st.ord <= 15
         )
       ))
     where outing_id = p_outing and id::text = pl->>'participantId';
  end loop;

  perform public._outing_system_message(
    p_outing,
    format('📍 Αποφασίστηκε: πάμε στο «%s»!', v_venue->>'name'),
    jsonb_build_object('event', 'venue_decided', 'venue', v_venue->>'name')
  );
  perform public._send_push(
    array(select p.user_id from public.outing_participants p
          where p.outing_id = p_outing and p.user_id is not null and p.user_id <> me and p.rsvp <> 'declined'),
    'Πάμε! 📍',
    format('%s διάλεξε «%s» για %s. Δες πώς θα πας.',
           (select display_name from public.profiles where id = me), v_venue->>'name', public._activity_label(o.activity)),
    jsonb_build_object('url', '/outing/' || p_outing)
  );
end $$;
revoke all on function public.decide_venue from public, anon;
grant execute on function public.decide_venue to authenticated;

-- ---------- get_outing_participants: + plan (η δική σου — ή όλων για τον διοργανωτή) ----------
drop function if exists public.get_outing_participants(uuid);

create function public.get_outing_participants(p_outing uuid)
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
  preference   public.place_preference,
  skipped      boolean,
  plan         jsonb
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
    p.preference,
    p.skipped_at is not null,
    case when v_org = me or p.user_id = me then p.plan end
  from public.outing_participants p
  left join public.profiles pr on pr.id = p.user_id
  left join public.outing_origins oo on oo.participant_id = p.id
  where p.outing_id = p_outing
    and (not v_hidden or v_org = me or p.user_id = me or p.user_id = v_org)
  order by p.created_at, p.id;
end $$;
revoke all on function public.get_outing_participants from public, anon;
grant execute on function public.get_outing_participants to authenticated;
