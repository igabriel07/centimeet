-- ⚠️ ΜΟΝΟ για ΤΟΠΙΚΟ Supabase (npm run local:seed). ΠΟΤΕ στο production.
-- Δοκιμαστικοί λογαριασμοί (κωδικός για όλους: centimeet-test):
--   maria@centimeet.test     Μαρία   — ο «κύριος» λογαριασμός για δοκιμή
--   nikos@centimeet.test     Νίκος
--   eleni@centimeet.test     Ελένη
--   giorgos@centimeet.test   Γιώργος
--   katerina@centimeet.test  Κατερίνα
--   kostas@centimeet.test    Κώστας  — ΟΧΙ φίλος (εκκρεμές αίτημα φιλίας προς Μαρία)
-- Ξανατρέχει με ασφάλεια: σβήνει πρώτα τους παλιούς δοκιμαστικούς λογαριασμούς (και ό,τι τους ανήκει).
\set ON_ERROR_STOP 1
\set QUIET 1

-- Ασφάλεια: σταματά αν δεν είναι η τοπική βάση του Supabase CLI
do $$ begin
  if (select count(*) from auth.users where email not like '%@centimeet.test') > 20 then
    raise exception 'Πολλοί πραγματικοί χρήστες — αυτή δεν μοιάζει με τοπική βάση. Σταματώ.';
  end if;
end $$;

delete from auth.users where email like '%@centimeet.test';

create schema if not exists dev;
create or replace function dev.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false),
         set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
$$;
-- Ώρα Αθήνας: σε d μέρες από σήμερα, στις hh:mm
create or replace function dev.at(d int, hh int, mm int default 0) returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Europe/Athens') + make_interval(days => d, hours => hh, mins => mm))
         at time zone 'Europe/Athens';
$$;
-- Σε h ώρες από τώρα, στρογγυλεμένο στο τέταρτο
create or replace function dev.in_hours(h numeric) returns timestamptz language sql stable as $$
  select to_timestamp(ceil(extract(epoch from now() + make_interval(secs => h * 3600)) / 900) * 900);
$$;
grant usage on schema dev to authenticated;
grant execute on all functions in schema dev to authenticated;

-- ---------- Λογαριασμοί ----------
create or replace function dev.add_user(u uuid, mail text, full_name text, mode public.transport_mode) returns void
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', mail,
          extensions.crypt('centimeet-test', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name), now(), now(),
          '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), u, u::text, 'email',
          jsonb_build_object('sub', u::text, 'email', mail, 'email_verified', true), now(), now(), now());
  update public.profiles set default_mode = mode where id = u;
end $$;

select dev.add_user('dddddddd-0000-0000-0000-000000000001', 'maria@centimeet.test',    'Μαρία Παπαδοπούλου', 'transit');
select dev.add_user('dddddddd-0000-0000-0000-000000000002', 'nikos@centimeet.test',    'Νίκος Γεωργίου',     'car');
select dev.add_user('dddddddd-0000-0000-0000-000000000003', 'eleni@centimeet.test',    'Ελένη Κωνσταντίνου', 'walk');
select dev.add_user('dddddddd-0000-0000-0000-000000000004', 'giorgos@centimeet.test',  'Γιώργος Αλεξίου',    'transit');
select dev.add_user('dddddddd-0000-0000-0000-000000000005', 'katerina@centimeet.test', 'Κατερίνα Δημητρίου', 'car');
select dev.add_user('dddddddd-0000-0000-0000-000000000006', 'kostas@centimeet.test',   'Κώστας Ιωάννου',     'transit');

\set MARIA    'dddddddd-0000-0000-0000-000000000001'
\set NIKOS    'dddddddd-0000-0000-0000-000000000002'
\set ELENI    'dddddddd-0000-0000-0000-000000000003'
\set GIORGOS  'dddddddd-0000-0000-0000-000000000004'
\set KATERINA 'dddddddd-0000-0000-0000-000000000005'
\set KOSTAS   'dddddddd-0000-0000-0000-000000000006'

-- ---------- Φιλίες & ομάδες ----------
insert into public.friendships (requester_id, addressee_id, status, responded_at) values
  (:'MARIA', :'NIKOS', 'accepted', now()),
  (:'ELENI', :'MARIA', 'accepted', now()),
  (:'MARIA', :'GIORGOS', 'accepted', now()),
  (:'KATERINA', :'MARIA', 'accepted', now()),
  (:'NIKOS', :'ELENI', 'accepted', now()),
  (:'NIKOS', :'GIORGOS', 'accepted', now()),
  (:'ELENI', :'KATERINA', 'accepted', now());
insert into public.friendships (requester_id, addressee_id, status) values (:'KOSTAS', :'MARIA', 'pending');

with g as (insert into public.friend_groups (owner_id, name) values (:'MARIA', 'Η παρέα') returning id)
insert into public.friend_group_members (group_id, user_id) select g.id, u from g, unnest(array[:'NIKOS', :'ELENI', :'GIORGOS']::uuid[]) u;
with g as (insert into public.friend_groups (owner_id, name) values (:'MARIA', 'Δουλειά') returning id)
insert into public.friend_group_members (group_id, user_id) select g.id, u from g, unnest(array[:'KATERINA', :'GIORGOS']::uuid[]) u;
with g as (insert into public.friend_groups (owner_id, name) values (:'NIKOS', 'Μπάλα') returning id)
insert into public.friend_group_members (group_id, user_id) select g.id, u from g, unnest(array[:'MARIA', :'GIORGOS']::uuid[]) u;

-- ---------- Αφετηρίες ----------
\set O_SYNTAGMA '{"lat":37.9755,"lng":23.7348,"label":"Σύνταγμα","mode":"transit"}'
\set O_KIFISIA  '{"lat":38.0736,"lng":23.8114,"label":"Κηφισιά","mode":"car"}'
\set O_PAGRATI  '{"lat":37.9682,"lng":23.7466,"label":"Παγκράτι","mode":"walk"}'
\set O_PIREAS   '{"lat":37.9420,"lng":23.6465,"label":"Πειραιάς","mode":"transit"}'
\set O_GLYFADA  '{"lat":37.8652,"lng":23.7535,"label":"Γλυφάδα","mode":"car"}'

-- ---------- Έξοδοι ----------
set role authenticated;

-- 1) Νίκος → Μαρία, Ελένη: καφές σε ~2 ώρες, χρονόμετρο 1 ώρας — η Μαρία ΔΕΝ έχει απαντήσει
select dev.as_user(:'NIKOS');
select public.create_outing('coffee', 'athens', dev.in_hours(2), null, :'O_KIFISIA', array[:'MARIA', :'ELENI']::uuid[], '[]', null, now() + interval '1 hour') as o1 \gset

-- 2) Κατερίνα → Μαρία, Ελένη: θέατρο σε 4 μέρες — η Μαρία ΔΕΝ έχει απαντήσει
select dev.as_user(:'KATERINA');
select public.create_outing('theater', 'athens', dev.at(4, 20, 30), null, :'O_GLYFADA', array[:'MARIA', :'ELENI']::uuid[], '[]', 'stage') as o2 \gset

-- 3) Ελένη → Μαρία, Κατερίνα: σινεμά αύριο 21:00 — η Μαρία είπε «Έρχομαι» αλλά δεν δήλωσε αφετηρία
select dev.as_user(:'ELENI');
select public.create_outing('cinema', 'athens', dev.at(1, 21), null, :'O_PAGRATI', array[:'MARIA', :'KATERINA']::uuid[], '[]') as o3 \gset
select dev.as_user(:'MARIA');
select public.set_rsvp(:'o3', 'going');

-- 4) Γιώργος → Μαρία, Νίκος: μπουγάτσα σε 2 μέρες 10:00 — η Μαρία δήλωσε (Σύνταγμα, «Κοντά μου»)
select dev.as_user(:'GIORGOS');
select public.create_outing('food', 'athens', dev.at(2, 10), null, :'O_PIREAS', array[:'MARIA', :'NIKOS']::uuid[], '[]', 'bougatsa') as o4 \gset
select dev.as_user(:'MARIA');
select public.set_rsvp(:'o4', 'going');
select id as p4 from public.outing_participants where outing_id = :'o4' and user_id = :'MARIA' \gset
select public.declare_origin(:'p4', 37.9755, 23.7348, 'Σύνταγμα', 'transit');
select public.set_place_preference(:'p4', 'near');

-- 5) Μαρία → Νίκος, Ελένη, Γιώργος: ποτό αύριο 22:00 — η Ελένη δήλωσε, ο Γιώργος αρνήθηκε, ο Νίκος δεν απάντησε
select dev.as_user(:'MARIA');
select public.create_outing('drinks', 'athens', dev.at(1, 22), null, :'O_SYNTAGMA', array[:'NIKOS', :'ELENI', :'GIORGOS']::uuid[], '[]', 'cocktail') as o5 \gset
select dev.as_user(:'ELENI');
select public.set_rsvp(:'o5', 'going');
select id as p5 from public.outing_participants where outing_id = :'o5' and user_id = :'ELENI' \gset
select public.declare_origin(:'p5', 37.9682, 23.7466, 'Παγκράτι', 'walk');
select public.set_place_preference(:'p5', 'anywhere');
select dev.as_user(:'GIORGOS');
select public.set_rsvp(:'o5', 'declined');

-- 6) Ιστορικό της Μαρίας: καφές που έγινε & φαγητό που ακυρώθηκε
select dev.as_user(:'MARIA');
select public.create_outing('coffee', 'athens', dev.at(-5, 18), null, :'O_SYNTAGMA', array[:'NIKOS']::uuid[], '[]') as o6 \gset
select public.create_outing('food', 'athens', dev.at(-3, 21), null, :'O_SYNTAGMA', array[:'ELENI']::uuid[], '[]', 'souvlaki') as o7 \gset
select public.create_outing('cinema', 'thessaloniki', dev.at(-12, 21), null, :'O_SYNTAGMA', array[:'KATERINA']::uuid[], '[]') as o8 \gset

reset role;
update public.outings set status = 'done', chosen_venue = '{"name":"Taf Coffee"}' where id in (:'o6');
update public.outings set status = 'done', chosen_venue = '{"name":"Βακούρα"}' where id in (:'o8');
update public.outings set status = 'cancelled' where id = :'o7';

\echo 'Δοκιμαστικά δεδομένα έτοιμα ✅  (κωδικός: centimeet-test)'
