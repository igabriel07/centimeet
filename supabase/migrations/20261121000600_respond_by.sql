-- «Χρονόμετρο» απάντησης: ο διοργανωτής ορίζει προθεσμία (respond_by). Αν μέχρι τότε δεν έχουν απαντήσει
-- ΟΛΟΙ οι καλεσμένοι (✓/✕), η έξοδος ακυρώνεται αυτόματα (pg_cron, κάθε λεπτό) και ειδοποιούνται όλοι.

alter table public.outings add column if not exists respond_by timestamptz;

-- ---------- create_outing: νέα παράμετρος p_respond_by (στο τέλος — οι παλιές κλήσεις δουλεύουν) ----------
drop function if exists public.create_outing(public.activity_kind, public.city_id, timestamptz, text, jsonb, uuid[], jsonb, text);

create or replace function public.create_outing(
  p_activity   public.activity_kind,
  p_city       public.city_id,
  p_meet_at    timestamptz default null,
  p_title      text default null,
  p_me         jsonb default null,
  p_invitees   uuid[] default '{}',
  p_guests     jsonb default '[]',
  p_category   text default null,
  p_respond_by timestamptz default null
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
  if p_respond_by is not null then
    if p_respond_by <= now() or p_respond_by > now() + interval '7 days' then
      raise exception 'respond_by out of range' using errcode = '22023';
    end if;
    if p_meet_at is not null and p_respond_by > p_meet_at then
      raise exception 'respond_by after meet_at' using errcode = '22023';
    end if;
  end if;

  insert into public.outings (organizer_id, title, activity, category, city, meet_at, respond_by)
  values (me, nullif(trim(p_title), ''), p_activity, nullif(p_category, ''), p_city, p_meet_at,
          -- Χωρίς καλεσμένους δεν έχει νόημα χρονόμετρο
          case when coalesce(cardinality(p_invitees), 0) > 0 then p_respond_by end)
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

-- ---------- Push πρόσκλησης: + «Απάντησε έως τις 19:30» ----------
-- Ώρα Ελλάδας· η μέρα μόνο αν δεν είναι σήμερα («έως Κυρ 22/11 19:30»).
create or replace function public._deadline_label(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_at is null then ''
    when (p_at at time zone 'Europe/Athens')::date = (now() at time zone 'Europe/Athens')::date
      then ' Απάντησε έως τις ' || to_char(p_at at time zone 'Europe/Athens', 'HH24:MI') || '.'
    else ' Απάντησε έως '
      || (array['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'])[extract(isodow from p_at at time zone 'Europe/Athens')::int]
      || ' ' || to_char(p_at at time zone 'Europe/Athens', 'FMDD/FMMM HH24:MI') || '.'
  end;
$$;
revoke all on function public._deadline_label from public, anon, authenticated;

create or replace function public._push_on_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o record;
begin
  select ou.id, ou.activity, ou.meet_at, ou.respond_by, ou.organizer_id, pr.display_name as organizer
    into o
  from public.outings ou join public.profiles pr on pr.id = ou.organizer_id
  where ou.id = new.outing_id;
  if new.user_id is null or new.user_id = o.organizer_id then return new; end if;
  perform public._send_push(
    array[new.user_id],
    'Πρόσκληση 📍',
    format('%s σε προσκαλεί για %s%s. Θα έρθεις;%s', o.organizer, public._activity_label(o.activity),
           public._when_label(o.meet_at), public._deadline_label(o.respond_by)),
    jsonb_build_object('url', '/outing/' || o.id)
  );
  return new;
end $$;

-- ---------- Αυτόματη ακύρωση όταν λήξει ο χρόνος και κάποιος δεν απάντησε ----------
create or replace function public.expire_unanswered_outings()
returns int language plpgsql security definer set search_path = '' as $$
declare
  o record;
  n int := 0;
begin
  for o in
    select ou.id, ou.activity
    from public.outings ou
    where ou.respond_by is not null
      and ou.respond_by <= now()
      and ou.status not in ('decided', 'cancelled', 'done')
      and exists (select 1 from public.outing_participants p where p.outing_id = ou.id and p.rsvp = 'invited')
    for update skip locked
  loop
    update public.outings set status = 'cancelled' where id = o.id;
    perform public._outing_system_message(
      o.id,
      'Η έξοδος ακυρώθηκε: έληξε ο χρόνος και δεν απάντησαν όλοι.',
      jsonb_build_object('event', 'outing_expired')
    );
    perform public._send_push(
      array(select p.user_id from public.outing_participants p
            where p.outing_id = o.id and p.user_id is not null and p.rsvp <> 'declined'),
      'Ακυρώθηκε ⏳',
      format('Η έξοδος για %s ακυρώθηκε: δεν απάντησαν όλοι εγκαίρως.', public._activity_label(o.activity)),
      jsonb_build_object('url', '/outing/' || o.id)
    );
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.expire_unanswered_outings from public, anon, authenticated;

-- Κάθε λεπτό (pg_cron· υπάρχει στο Supabase — όχι στο απλό image των tests)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('expire-unanswered-outings', '* * * * *', 'select public.expire_unanswered_outings()');
  end if;
end $$;

-- ---------- my_outings: + respond_by & πόσοι δεν έχουν απαντήσει ----------
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
  unanswered_count  int
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
      where x.outing_id = o.id and x.rsvp = 'invited')::int
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  left join public.profiles pr on pr.id = o.organizer_id
  where o.status not in ('cancelled', 'done')
  order by o.created_at desc
  limit 50;
$$;

revoke all on function public.my_outings from public, anon;
grant execute on function public.my_outings to authenticated;
