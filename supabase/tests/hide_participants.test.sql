-- Tests: κρυφή λίστα καλεσμένων (hide_participants)
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000ad'
\set A '00000000-0000-0000-0000-0000000000ae'
\set B '00000000-0000-0000-0000-0000000000af'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'hide-o@example.com', '{"full_name":"Οργανωτής"}'),
  (:'A', 'hide-a@example.com', '{"full_name":"Άλκης"}'),
  (:'B', 'hide-b@example.com', '{"full_name":"Βάσω"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'A', 'accepted'), (:'O', :'B', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'A', :'B']::uuid[], '[{"name":"Λία","lat":37.98,"lng":23.74,"mode":"walk"}]',
                            null, null, null, true) as hidden \gset
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'A', :'B']::uuid[]) as open \gset

select test.ok((select count(*) from public.get_outing_participants(:'hidden')) = 4, 'ο διοργανωτής βλέπει όλους (κρυφή)');
select test.ok((select count(*) from public.outing_participants where outing_id = :'hidden') = 4, 'ο διοργανωτής: και στον πίνακα');
reset role;

select test.login(:'A');
set role authenticated;
select test.ok((select count(*) from public.get_outing_participants(:'hidden')) = 2, 'καλεσμένος: μόνο διοργανωτής + εγώ');
select test.ok(not exists (select 1 from public.get_outing_participants(:'hidden') where name in ('Βάσω', 'Λία')), 'δεν βλέπει τα ονόματα των άλλων');
select test.ok((select count(*) from public.outing_participants where outing_id = :'hidden') = 2, 'ούτε απευθείας από τον πίνακα (RLS)');
select test.ok((select count(*) from public.get_outing_participants(:'open')) = 3, 'προεπιλογή: βλέπει όλους');
select test.ok((select total_count from public.my_outings() where id = :'hidden') = 4, 'το πλήθος φαίνεται (όχι τα ονόματα)');
-- Δεν είναι στην ομαδική συνομιλία της κρυφής εξόδου (θα έβλεπε ποιοι γράφουν)
select test.ok(not exists (select 1 from public.conversations c where c.outing_id = :'hidden'), 'δεν βλέπει τη συνομιλία της κρυφής');
select test.ok(exists (select 1 from public.conversations c where c.outing_id = :'open'), 'βλέπει τη συνομιλία της κανονικής');
-- Μπορεί να απαντήσει κανονικά
select public.set_rsvp(:'hidden', 'going');
reset role;

select test.ok((select rsvp from public.outing_participants where outing_id = :'hidden' and user_id = :'A') = 'going', 'η απάντηση καταγράφηκε');

\echo 'Κρυφή λίστα καλεσμένων ✅'
