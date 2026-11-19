-- Κατηγορία εξόδου (π.χ. food → pizza) + «Σημείο» στα μηνύματα/ειδοποιήσεις.
-- Οι επιτρεπτές τιμές ανά δραστηριότητα ελέγχονται στην εφαρμογή/API (packages/shared/src/categories.ts)·
-- εδώ μόνο η μορφή, ώστε μια νέα κατηγορία να μη χρειάζεται migration.

alter table public.outings
  add column if not exists category text
  check (category is null or category ~ '^[a-z_]{1,32}$');

-- Το «Σημείο» δεν έχει κατηγορίες
alter table public.outings
  add constraint outings_spot_no_category check (activity <> 'spot' or category is null);

-- ---------- create_outing: νέα παράμετρος p_category (στο τέλος — οι παλιές κλήσεις δουλεύουν) ----------
drop function if exists public.create_outing(public.activity_kind, public.city_id, timestamptz, text, jsonb, uuid[], jsonb);

create or replace function public.create_outing(
  p_activity public.activity_kind,
  p_city     public.city_id,
  p_meet_at  timestamptz default null,
  p_title    text default null,
  p_me       jsonb default null,
  p_invitees uuid[] default '{}',
  p_guests   jsonb default '[]',
  p_category text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_outing uuid;
  v_part uuid;
  g jsonb;
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

  insert into public.outings (organizer_id, title, activity, category, city, meet_at)
  values (me, nullif(trim(p_title), ''), p_activity, nullif(p_category, ''), p_city, p_meet_at)
  returning id into v_outing;

  insert into public.outing_participants (outing_id, user_id, rsvp)
  values (v_outing, me, 'going')
  returning id into v_part;
  if p_me is not null then
    perform public._set_origin(v_part, v_outing, p_me);
  end if;

  for g in select value from jsonb_array_elements(coalesce(p_guests, '[]'::jsonb)) loop
    insert into public.outing_participants (outing_id, guest_name, rsvp)
    values (v_outing, trim(g->>'name'), 'going')
    returning id into v_part;
    perform public._set_origin(v_part, v_outing, g);
  end loop;

  perform public._add_invitees(v_outing, me, p_invitees);

  if (select count(*) from public.outing_participants where outing_id = v_outing) < 2 then
    raise exception 'need at least 2 participants' using errcode = '22023';
  end if;

  perform public._outing_system_message(
    v_outing,
    'Νέα έξοδος! Δήλωσε από πού ξεκινάς και με τι μέσο.',
    jsonb_build_object('event', 'outing_created')
  );
  return v_outing;
end $$;

revoke all on function public.create_outing from public, anon;
grant execute on function public.create_outing to authenticated;

-- ---------- my_outings: επιστρέφει και την κατηγορία (αλλάζει ο τύπος επιστροφής → drop) ----------
drop function if exists public.my_outings();

create or replace function public.my_outings()
returns table (
  id                uuid,
  title             text,
  activity          public.activity_kind,
  category          text,
  city              public.city_id,
  meet_at           timestamptz,
  status            public.outing_status,
  is_organizer      boolean,
  my_participant_id uuid,
  my_rsvp           public.rsvp_status,
  my_declared       boolean,
  declared_count    int,
  total_count       int,
  created_at        timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    o.id, o.title, o.activity, o.category, o.city, o.meet_at, o.status,
    o.organizer_id = auth.uid(),
    mp.id, mp.rsvp, mp.declared_at is not null,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined' and x.declared_at is not null)::int,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined')::int,
    o.created_at
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  where o.status not in ('cancelled', 'done')
  order by o.created_at desc
  limit 50;
$$;

revoke all on function public.my_outings from public, anon;
grant execute on function public.my_outings to authenticated;

-- ---------- Κείμενο δραστηριότητας για ειδοποιήσεις ----------
create or replace function public._activity_label(a public.activity_kind)
returns text language sql immutable set search_path = '' as $$
  select case a
    when 'spot' then 'συνάντηση'
    when 'coffee' then 'καφέ' when 'food' then 'φαγητό' when 'drinks' then 'ποτό'
    when 'cinema' then 'σινεμά' when 'dessert' then 'γλυκό' when 'brunch' then 'brunch'
  end;
$$;
revoke all on function public._activity_label from public, anon, authenticated;
