-- =====================================================================
-- CentiMeet – αρχικό σχήμα βάσης (Supabase / PostgreSQL + PostGIS)
-- Λογαριασμοί, φίλοι, αποκλεισμοί, έξοδοι, προτάσεις, ψήφοι, μηνύματα, push
-- Όλοι οι πίνακες έχουν Row Level Security.
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------- Enums ----------
create type transport_mode as enum ('car', 'motorbike', 'transit', 'walk', 'bike', 'taxi');
create type activity_kind  as enum ('coffee', 'food', 'drinks', 'cinema', 'dessert', 'brunch');
create type city_id        as enum ('athens', 'thessaloniki');
create type friendship_status as enum ('pending', 'accepted', 'declined');
create type outing_status  as enum ('collecting', 'suggesting', 'voting', 'decided', 'cancelled', 'done');
create type rsvp_status    as enum ('invited', 'going', 'maybe', 'declined');

-- ---------- Profiles ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name  text not null check (char_length(display_name) between 1 and 60),
  avatar_url    text,
  default_mode  transport_mode not null default 'transit',
  default_city  city_id not null default 'athens',
  locale        text not null default 'el',
  created_at    timestamptz not null default now()
);

-- Αυτόματη δημιουργία προφίλ στο signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  base text := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'user'), '[^a-z0-9_.]', '', 'g'));
begin
  if char_length(base) < 3 then base := 'user'; end if;
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    left(base, 16) || '_' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', left(base, 60))
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- Αποθηκευμένες τοποθεσίες (Σπίτι, Δουλειά…) ----------
create table public.saved_locations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 40),
  address    text,
  location   extensions.geography(point, 4326) not null,
  mode       transport_mode,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.saved_locations (user_id);

-- ---------- Φιλίες & αποκλεισμοί ----------
create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- Μία σχέση ανά ζευγάρι, ανεξαρτήτως κατεύθυνσης
create unique index friendships_pair_uniq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid,
  reason      text not null check (char_length(reason) between 3 and 500),
  created_at  timestamptz not null default now()
);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------- Έξοδοι ----------
create table public.outings (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references public.profiles(id) on delete cascade,
  title         text,
  activity      activity_kind not null,
  city          city_id not null,
  meet_at       timestamptz,
  status        outing_status not null default 'collecting',
  chosen_venue  jsonb,           -- το μαγαζί που επιλέχθηκε (snapshot)
  share_token   text unique not null default encode(extensions.gen_random_bytes(9), 'base64'),
  created_at    timestamptz not null default now()
);
create index on public.outings (organizer_id);

-- Συμμετέχοντες: είτε χρήστης (user_id) είτε «επισκέπτης» χωρίς λογαριασμό (guest_name)
create table public.outing_participants (
  id          uuid primary key default gen_random_uuid(),
  outing_id   uuid not null references public.outings(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  guest_name  text check (guest_name is null or char_length(guest_name) between 1 and 60),
  origin      extensions.geography(point, 4326),
  origin_label text,
  mode        transport_mode,
  rsvp        rsvp_status not null default 'invited',
  share_slug  text unique not null default encode(extensions.gen_random_bytes(6), 'hex'),
  created_at  timestamptz not null default now(),
  check ((user_id is not null) <> (guest_name is not null)),
  unique (outing_id, user_id)
);
create index on public.outing_participants (user_id);

create or replace function public.is_outing_member(o uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.outings where id = o and organizer_id = u)
      or exists (select 1 from public.outing_participants where outing_id = o and user_id = u);
$$;

create table public.venue_suggestions (
  id         uuid primary key default gen_random_uuid(),
  outing_id  uuid not null references public.outings(id) on delete cascade,
  payload    jsonb not null,   -- SuggestionsResponse από το API
  created_at timestamptz not null default now()
);

create table public.votes (
  outing_id  uuid not null references public.outings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  venue_id   text not null,
  created_at timestamptz not null default now(),
  primary key (outing_id, user_id)
);

-- ---------- Μηνύματα ----------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('direct', 'outing')),
  outing_id  uuid unique references public.outings(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((kind = 'outing') = (outing_id is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  muted           boolean not null default false,
  primary key (conversation_id, user_id)
);
create index on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references public.profiles(id) on delete set null, -- null = μήνυμα συστήματος
  kind            text not null default 'text' check (kind in ('text', 'location', 'system')),
  body            text not null check (char_length(body) between 1 and 4000),
  meta            jsonb,
  created_at      timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc);

create or replace function public.is_conversation_member(c uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members where conversation_id = c and user_id = u);
$$;

-- Ιδιωτική συνομιλία μόνο μεταξύ φίλων που δεν έχουν αποκλείσει ο ένας τον άλλο
create or replace function public.get_or_create_direct_conversation(other uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.are_friends(me, other) or public.is_blocked(me, other) then
    raise exception 'not allowed';
  end if;
  select c.id into conv
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = me
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = other
  where c.kind = 'direct'
  limit 1;
  if conv is null then
    insert into public.conversations (kind) values ('direct') returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  end if;
  return conv;
end $$;

-- Κάθε έξοδος αποκτά αυτόματα ομαδική συνομιλία με τον διοργανωτή
create or replace function public.handle_new_outing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conv uuid;
begin
  insert into public.conversations (kind, outing_id) values ('outing', new.id) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, new.organizer_id);
  return new;
end $$;
create trigger on_outing_created after insert on public.outings
  for each row execute function public.handle_new_outing();

-- …και κάθε προσκεκλημένος χρήστης μπαίνει στη συνομιλία
create or replace function public.handle_new_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null then
    insert into public.conversation_members (conversation_id, user_id)
    select id, new.user_id from public.conversations where outing_id = new.outing_id
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_participant_added after insert on public.outing_participants
  for each row execute function public.handle_new_participant();

-- ---------- Push tokens ----------
create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles              enable row level security;
alter table public.saved_locations       enable row level security;
alter table public.friendships           enable row level security;
alter table public.blocks                enable row level security;
alter table public.reports               enable row level security;
alter table public.outings               enable row level security;
alter table public.outing_participants   enable row level security;
alter table public.venue_suggestions     enable row level security;
alter table public.votes                 enable row level security;
alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;
alter table public.push_tokens           enable row level security;

-- Profiles: ορατά σε συνδεδεμένους (για αναζήτηση φίλων), εκτός αν υπάρχει αποκλεισμός
create policy "profiles read" on public.profiles for select to authenticated
  using (not public.is_blocked(auth.uid(), id));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Τοποθεσίες: μόνο ο ιδιοκτήτης
create policy "saved_locations own" on public.saved_locations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Φιλίες
create policy "friendships read own" on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "friendships request" on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_blocked(requester_id, addressee_id));
create policy "friendships respond" on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "friendships remove" on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Αποκλεισμοί & αναφορές
create policy "blocks own" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "reports create" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

-- Έξοδοι
create policy "outings read members" on public.outings for select to authenticated
  using (public.is_outing_member(id, auth.uid()));
create policy "outings create" on public.outings for insert to authenticated
  with check (organizer_id = auth.uid());
create policy "outings update organizer" on public.outings for update to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "outings delete organizer" on public.outings for delete to authenticated
  using (organizer_id = auth.uid());

-- Συμμετέχοντες: ορατοί στα μέλη. Ο διοργανωτής προσθέτει (μόνο φίλους ή επισκέπτες).
-- Κάθε χρήστης ενημερώνει μόνο τη δική του αφετηρία/μέσο/RSVP.
create policy "participants read" on public.outing_participants for select to authenticated
  using (public.is_outing_member(outing_id, auth.uid()));
create policy "participants add" on public.outing_participants for insert to authenticated
  with check (
    exists (select 1 from public.outings o where o.id = outing_id and o.organizer_id = auth.uid())
    and (user_id is null or user_id = auth.uid() or public.are_friends(auth.uid(), user_id))
  );
create policy "participants update self or organizer" on public.outing_participants for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.outings o where o.id = outing_id and o.organizer_id = auth.uid())
  );
create policy "participants remove" on public.outing_participants for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.outings o where o.id = outing_id and o.organizer_id = auth.uid())
  );

create policy "suggestions read" on public.venue_suggestions for select to authenticated
  using (public.is_outing_member(outing_id, auth.uid()));
create policy "suggestions write organizer" on public.venue_suggestions for insert to authenticated
  with check (exists (select 1 from public.outings o where o.id = outing_id and o.organizer_id = auth.uid()));

create policy "votes read" on public.votes for select to authenticated
  using (public.is_outing_member(outing_id, auth.uid()));
create policy "votes cast" on public.votes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_outing_member(outing_id, auth.uid()));

-- Μηνύματα
create policy "conversations read" on public.conversations for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));
create policy "members read" on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "members update self" on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "messages read" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "messages send" on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and kind <> 'system'
    and public.is_conversation_member(conversation_id, auth.uid())
    -- σε ιδιωτική συνομιλία: όχι αν υπάρχει αποκλεισμός
    and not exists (
      select 1 from public.conversation_members m
      where m.conversation_id = messages.conversation_id
        and m.user_id <> auth.uid()
        and public.is_blocked(auth.uid(), m.user_id)
        and (select kind from public.conversations c where c.id = messages.conversation_id) = 'direct'
    )
  );

create policy "push_tokens own" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime για μηνύματα, συμμετέχοντες και ψήφους
alter publication supabase_realtime add table public.messages, public.outing_participants, public.votes;
