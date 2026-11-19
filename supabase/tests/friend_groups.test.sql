-- Tests: ομάδες φίλων (my_groups)
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000b1'
\set A '00000000-0000-0000-0000-0000000000b2'
\set B '00000000-0000-0000-0000-0000000000b3'
\set S '00000000-0000-0000-0000-0000000000b4'
\set X '00000000-0000-0000-0000-0000000000b5'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'groups-o@example.com', '{"full_name":"Όλγα"}'),
  (:'A', 'groups-a@example.com', '{"full_name":"Άρης"}'),
  (:'B', 'groups-b@example.com', '{"full_name":"Βίκυ"}'),
  (:'S', 'groups-s@example.com', '{"full_name":"Στέλιος"}'),
  (:'X', 'groups-x@example.com', '{"full_name":"Ξανθή"}');

-- Η Όλγα είναι φίλη με Άρη, Βίκυ, Στέλιο· τον Στέλιο τον έχει αποκλείσει. Η Ξανθή δεν είναι φίλη.
insert into public.friendships (requester_id, addressee_id, status) values
  (:'O', :'A', 'accepted'), (:'B', :'O', 'accepted'), (:'O', :'S', 'accepted');
insert into public.blocks (blocker_id, blocked_id) values (:'O', :'S');

insert into public.friend_groups (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000fa01', :'O', 'Σχολή'),
  ('00000000-0000-0000-0000-00000000fa02', :'O', 'Άδεια'),
  ('00000000-0000-0000-0000-00000000fa03', :'A', 'Του Άρη');
insert into public.friend_group_members (group_id, user_id) values
  ('00000000-0000-0000-0000-00000000fa01', :'A'),
  ('00000000-0000-0000-0000-00000000fa01', :'B'),
  ('00000000-0000-0000-0000-00000000fa01', :'S'),
  ('00000000-0000-0000-0000-00000000fa01', :'X'),
  ('00000000-0000-0000-0000-00000000fa03', :'O');

select test.login(:'O');
set role authenticated;
select test.ok((select count(*) from public.my_groups()) = 2, 'βλέπω μόνο τις δικές μου ομάδες');
select test.ok(
  (select array_agg(m->>'display_name' order by m->>'display_name')
     from public.my_groups() g, jsonb_array_elements(g.members) m where g.name = 'Σχολή') = array['Άρης', 'Βίκυ'],
  'μέλη: μόνο όσοι είναι ακόμη φίλοι και χωρίς αποκλεισμό');
select test.ok((select members from public.my_groups() where name = 'Άδεια') = '[]'::jsonb, 'άδεια ομάδα → κενή λίστα');
select test.throws($$select * from public.friend_groups$$, '42501', 'όχι απευθείας ανάγνωση ομάδων');
select test.throws($$insert into public.friend_groups (owner_id, name) values (auth.uid(), 'x')$$, '42501', 'όχι απευθείας δημιουργία');
reset role;

-- Ο Άρης δεν βλέπει τις ομάδες της Όλγας (ούτε ότι είναι μέλος)
select test.login(:'A');
set role authenticated;
select test.ok((select array_agg(name) from public.my_groups()) = array['Του Άρη'], 'ο Άρης βλέπει μόνο τη δική του ομάδα');
reset role;

set role anon;
select test.throws($$select * from public.my_groups()$$, '42501', 'ο anon δεν διαβάζει ομάδες');
reset role;

\echo 'Ομάδες φίλων ✅'
