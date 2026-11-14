-- =====================================================================
-- CentiMeet – αποθηκευμένες έξοδοι & προσκλήσεις φίλων
--
-- Κάθε φίλος δηλώνει μόνος του αφετηρία και μέσο.
--  * Οι αφετηρίες (συχνά = σπίτι) μένουν σε ξεχωριστό πίνακα χωρίς πολιτικές
--    RLS και εκτός Realtime: τις βλέπει μόνο ο ίδιος και ο διοργανωτής,
--    μέσω της get_outing_participants().
--  * Όλες οι εισαγωγές/αλλαγές συμμετεχόντων περνούν από RPC
--    (κλείνει και το κενό όπου η πολιτική update επέτρεπε αλλαγή outing_id).
-- =====================================================================

-- ---------- Αφετηρίες σε ξεχωριστό πίνακα ----------
create table public.outing_origins (
  participant_id uuid primary key references public.outing_participants(id) on delete cascade,
  outing_id      uuid not null references public.outings(id) on delete cascade,
  origin         extensions.geography(point, 4326) not null,
  label          text check (label is null or char_length(label) <= 200),
  updated_at     timestamptz not null default now()
);
create index on public.outing_origins (outing_id);
alter table public.outing_origins enable row level security;
-- Καμία πολιτική: πρόσβαση μόνο μέσω των security definer συναρτήσεων παρακάτω.
revoke all on public.outing_origins from anon, authenticated;

-- Μεταφορά τυχόν υπαρχόντων δεδομένων και αφαίρεση των παλιών στηλών
alter table public.outing_participants add column declared_at timestamptz;

insert into public.outing_origins (participant_id, outing_id, origin, label)
select id, outing_id, origin, origin_label from public.outing_participants where origin is not null;

update public.outing_participants set declared_at = created_at where origin is not null and mode is not null;

alter table public.outing_participants drop column origin, drop column origin_label;

-- ---------- Συμμετέχοντες: μόνο ανάγνωση/διαγραφή απευθείας ----------
drop policy "participants add" on public.outing_participants;
drop policy "participants update self or organizer" on public.outing_participants;
revoke insert, update on public.outing_participants from anon, authenticated;

-- ---------- Εσωτερικές βοηθητικές συναρτήσεις ----------
create or replace function public._outing_system_message(p_outing uuid, p_body text, p_meta jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.messages (conversation_id, sender_id, kind, body, meta)
  select c.id, null, 'system', p_body, p_meta from public.conversations c where c.outing_id = p_outing;
$$;

-- Γράφει αφετηρία + μέσο για έναν συμμετέχοντα. p = {lat, lng, label?, mode}
create or replace function public._set_origin(p_participant uuid, p_outing uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_lat   double precision := (p->>'lat')::double precision;
  v_lng   double precision := (p->>'lng')::double precision;
  v_mode  public.transport_mode := (p->>'mode')::public.transport_mode;
  v_label text := left(nullif(trim(p->>'label'), ''), 200);
begin
  if v_lat is null or v_lng is null or v_lat not between -90 and 90 or v_lng not between -180 and 180 then
    raise exception 'invalid origin' using errcode = '22023';
  end if;
  if v_mode is null then
    raise exception 'missing mode' using errcode = '22023';
  end if;

  insert into public.outing_origins (participant_id, outing_id, origin, label)
  values (
    p_participant, p_outing,
    extensions.st_setsrid(extensions.st_makepoint(v_lng, v_lat), 4326)::extensions.geography,
    v_label
  )
  on conflict (participant_id) do update
    set origin = excluded.origin, label = excluded.label, updated_at = now();

  update public.outing_participants set mode = v_mode, declared_at = now() where id = p_participant;
end $$;

-- Προσθέτει φίλους του διοργανωτή ως προσκεκλημένους. Επιστρέφει πόσοι προστέθηκαν.
create or replace function public._add_invitees(p_outing uuid, p_organizer uuid, p_invitees uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  u uuid;
  n int := 0;
  added int;
begin
  for u in select distinct x from unnest(coalesce(p_invitees, '{}'::uuid[])) as x loop
    continue when u = p_organizer;
    if not public.are_friends(p_organizer, u) or public.is_blocked(p_organizer, u) then
      raise exception 'can only invite friends' using errcode = '42501';
    end if;
    insert into public.outing_participants (outing_id, user_id, rsvp)
    values (p_outing, u, 'invited')
    on conflict (outing_id, user_id) do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;

  if (select count(*) from public.outing_participants where outing_id = p_outing) > 20 then
    raise exception 'too many participants (max 20)' using errcode = '22023';
  end if;
  return n;
end $$;

revoke all on function public._outing_system_message from public, anon, authenticated;
revoke all on function public._set_origin from public, anon, authenticated;
revoke all on function public._add_invitees from public, anon, authenticated;

-- =====================================================================
-- RPC για την εφαρμογή
-- =====================================================================

-- Δημιουργία εξόδου: διοργανωτής (+ προαιρετικά η αφετηρία του), επισκέπτες
-- χωρίς λογαριασμό (τους συμπληρώνει ο διοργανωτής) και φίλοι-προσκεκλημένοι.
--   p_me     = {lat, lng, label?, mode}
--   p_guests = [{name, lat, lng, label?, mode}, ...]
create or replace function public.create_outing(
  p_activity public.activity_kind,
  p_city     public.city_id,
  p_meet_at  timestamptz default null,
  p_title    text default null,
  p_me       jsonb default null,
  p_invitees uuid[] default '{}',
  p_guests   jsonb default '[]'
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
  if jsonb_typeof(coalesce(p_guests, '[]'::jsonb)) <> 'array' then
    raise exception 'guests must be an array' using errcode = '22023';
  end if;

  insert into public.outings (organizer_id, title, activity, city, meet_at)
  values (me, nullif(trim(p_title), ''), p_activity, p_city, p_meet_at)
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

-- Ο διοργανωτής προσκαλεί κι άλλους φίλους αργότερα
create or replace function public.invite_to_outing(p_outing uuid, p_invitees uuid[])
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_status public.outing_status;
  n int;
begin
  select status into v_status from public.outings where id = p_outing and organizer_id = me;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_status not in ('collecting', 'suggesting') then
    raise exception 'outing closed' using errcode = '55000';
  end if;
  n := public._add_invitees(p_outing, me, p_invitees);
  if n > 0 then
    perform public._outing_system_message(
      p_outing,
      case when n = 1 then 'Προστέθηκε 1 άτομο στην έξοδο.' else format('Προστέθηκαν %s άτομα στην έξοδο.', n) end,
      jsonb_build_object('event', 'invited', 'count', n)
    );
  end if;
  return n;
end $$;

-- Δήλωση αφετηρίας & μέσου. Επιτρέπεται για τη δική σου θέση,
-- ή (για τον διοργανωτή) για επισκέπτη χωρίς λογαριασμό — ποτέ για άλλον χρήστη.
create or replace function public.declare_origin(
  p_participant uuid,
  p_lat   double precision,
  p_lng   double precision,
  p_label text,
  p_mode  public.transport_mode
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r record;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select p.user_id, p.outing_id, p.declared_at, o.organizer_id, o.status
    into r
  from public.outing_participants p
  join public.outings o on o.id = p.outing_id
  where p.id = p_participant
  for update of p;

  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not ((r.user_id is not null and r.user_id = me) or (r.user_id is null and r.organizer_id = me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status not in ('collecting', 'suggesting') then
    raise exception 'outing closed' using errcode = '55000';
  end if;

  perform public._set_origin(
    p_participant, r.outing_id,
    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'label', p_label, 'mode', p_mode)
  );

  if r.user_id is not null then
    update public.outing_participants set rsvp = 'going' where id = p_participant;
    if r.declared_at is null then
      perform public._outing_system_message(
        r.outing_id,
        (select display_name from public.profiles where id = me) || ' δήλωσε αφετηρία ✓',
        jsonb_build_object('event', 'origin_declared', 'user_id', me)
      );
    end if;
  end if;
end $$;

-- Αποδοχή / άρνηση πρόσκλησης. Με άρνηση σβήνεται και η αφετηρία.
create or replace function public.set_rsvp(p_outing uuid, p_status public.rsvp_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_part uuid;
  v_prev public.rsvp_status;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status = 'invited' then raise exception 'invalid status' using errcode = '22023'; end if;

  select id, rsvp into v_part, v_prev
  from public.outing_participants
  where outing_id = p_outing and user_id = me
  for update;
  if not found then raise exception 'not a participant' using errcode = '42501'; end if;

  update public.outing_participants set rsvp = p_status where id = v_part;

  if p_status = 'declined' and v_prev <> 'declined' then
    delete from public.outing_origins where participant_id = v_part;
    update public.outing_participants set declared_at = null, mode = null where id = v_part;
    perform public._outing_system_message(
      p_outing,
      (select display_name from public.profiles where id = me) || ' δεν θα έρθει',
      jsonb_build_object('event', 'declined', 'user_id', me)
    );
  end if;
end $$;

-- Συμμετέχοντες μιας εξόδου. Συντεταγμένες/διεύθυνση επιστρέφονται μόνο για
-- τον εαυτό σου — ή για όλους αν είσαι ο διοργανωτής.
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
  origin_label text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  v_org uuid;
begin
  if me is null or not public.is_outing_member(p_outing, me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.organizer_id into v_org from public.outings o where o.id = p_outing;

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
    case when v_org = me or p.user_id = me then oo.label end
  from public.outing_participants p
  left join public.profiles pr on pr.id = p.user_id
  left join public.outing_origins oo on oo.participant_id = p.id
  where p.outing_id = p_outing
  order by p.created_at, p.id;
end $$;

-- Οι ενεργές έξοδοί μου, με την πρόοδο των δηλώσεων
create or replace function public.my_outings()
returns table (
  id                uuid,
  title             text,
  activity          public.activity_kind,
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
    o.id, o.title, o.activity, o.city, o.meet_at, o.status,
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

revoke all on function public.create_outing from public, anon;
revoke all on function public.invite_to_outing from public, anon;
revoke all on function public.declare_origin from public, anon;
revoke all on function public.set_rsvp from public, anon;
revoke all on function public.get_outing_participants from public, anon;
revoke all on function public.my_outings from public, anon;
grant execute on function public.create_outing to authenticated;
grant execute on function public.invite_to_outing to authenticated;
grant execute on function public.declare_origin to authenticated;
grant execute on function public.set_rsvp to authenticated;
grant execute on function public.get_outing_participants to authenticated;
grant execute on function public.my_outings to authenticated;
