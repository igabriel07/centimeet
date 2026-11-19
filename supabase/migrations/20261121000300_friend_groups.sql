-- Ομάδες φίλων (π.χ. «Παρέα σχολής»): πρόσκληση όλης της ομάδας σε έξοδο με ένα πάτημα.
-- Η ομάδα είναι ιδιωτική λίστα του κατόχου της (τα μέλη δεν βλέπουν ότι ανήκουν σε αυτή).
-- Εδώ μόνο η ανάγνωση (my_groups)· η δημιουργία/επεξεργασία έρχεται με τη σελίδα φίλων.

create table public.friend_groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
create index on public.friend_groups (owner_id);

create table public.friend_group_members (
  group_id uuid not null references public.friend_groups(id) on delete cascade,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.friend_group_members (user_id);

-- Καμία απευθείας πρόσβαση από την εφαρμογή: μόνο μέσω RPC (security definer)
alter table public.friend_groups        enable row level security;
alter table public.friend_group_members enable row level security;
revoke all on public.friend_groups, public.friend_group_members from anon, authenticated;

-- Οι ομάδες μου, με τα μέλη που είναι ΑΚΟΜΗ φίλοι μου και δεν υπάρχει αποκλεισμός
create or replace function public.my_groups()
returns table (id uuid, name text, members jsonb)
language sql stable security definer set search_path = '' as $$
  select
    g.id,
    g.name,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name)
                        order by p.display_name)
         from public.friend_group_members m
         join public.profiles p on p.id = m.user_id
        where m.group_id = g.id
          and public.are_friends(auth.uid(), m.user_id)
          and not public.is_blocked(auth.uid(), m.user_id)),
      '[]'::jsonb)
  from public.friend_groups g
  where g.owner_id = auth.uid()
  order by g.name;
$$;

revoke all on function public.my_groups from public, anon;
grant execute on function public.my_groups to authenticated;
