-- 🔖 Αποθηκευμένες έξοδοι («Αποθηκευμένα» στην αρχική): ο χρήστης κρατά όποιες έξοδους θέλει,
-- και μένουν εκεί και αφού τελειώσουν ή ακυρωθούν. Ιδιωτικό: μόνο ο ίδιος βλέπει τι έχει αποθηκεύσει.
create table if not exists public.saved_outings (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outing_id  uuid not null references public.outings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, outing_id)
);
alter table public.saved_outings enable row level security;

drop policy if exists "saved outings read own" on public.saved_outings;
create policy "saved outings read own" on public.saved_outings
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "saved outings insert own member" on public.saved_outings;
create policy "saved outings insert own member" on public.saved_outings
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_outing_member(outing_id, auth.uid()));
drop policy if exists "saved outings delete own" on public.saved_outings;
create policy "saved outings delete own" on public.saved_outings
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.saved_outings to authenticated;
revoke all on public.saved_outings from anon;

-- ---------- my_outings: + saved ----------
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
  saved             boolean
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
    exists (select 1 from public.saved_outings s where s.user_id = auth.uid() and s.outing_id = o.id)
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
  saved             boolean
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
    exists (select 1 from public.saved_outings s where s.user_id = auth.uid() and s.outing_id = o.id)
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  join public.saved_outings sv on sv.outing_id = o.id and sv.user_id = auth.uid()
  left join public.profiles pr on pr.id = o.organizer_id
  order by sv.created_at desc
  limit 100;
$$;

revoke all on function public.my_saved_outings from public, anon;
grant execute on function public.my_saved_outings to authenticated;
