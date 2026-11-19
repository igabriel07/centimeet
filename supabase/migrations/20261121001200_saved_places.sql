-- ⭐ Αποθηκευμένες διευθύνσεις (αγαπημένα) ανά χρήστη: «Σπίτι», «Δουλειά», …
-- Ιδιωτικές: μόνο ο ιδιοκτήτης τις βλέπει/αλλάζει. Συγχρονίζονται σε όλες τις συσκευές.
create table if not exists public.saved_places (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label        text not null check (char_length(trim(label)) between 1 and 40),
  emoji        text not null default '⭐' check (char_length(emoji) between 1 and 8),
  name         text not null check (char_length(name) between 1 and 200),
  address      text check (address is null or char_length(address) <= 300),
  place_id     text check (place_id is null or char_length(place_id) <= 300),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  created_at   timestamptz not null default now()
);
create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at);

alter table public.saved_places enable row level security;

drop policy if exists "saved places own" on public.saved_places;
create policy "saved places own" on public.saved_places
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.saved_places to authenticated;
revoke all on public.saved_places from anon;

-- Όριο 20 ανά χρήστη
create or replace function public._saved_places_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.saved_places where user_id = new.user_id) >= 20 then
    raise exception 'saved places limit' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public._saved_places_limit from public, anon, authenticated;

drop trigger if exists saved_places_limit on public.saved_places;
create trigger saved_places_limit before insert on public.saved_places
  for each row execute function public._saved_places_limit();
