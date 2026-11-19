-- Tests: αποθηκευμένες διευθύνσεις
\set ON_ERROR_STOP 1
\set QUIET 1

\set A '00000000-0000-0000-0000-0000000000c6'
\set B '00000000-0000-0000-0000-0000000000c7'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A', 'sp-a@example.com', '{"full_name":"Άννα"}'),
  (:'B', 'sp-b@example.com', '{"full_name":"Βασίλης"}');

select test.login(:'A');
set role authenticated;
insert into public.saved_places (label, emoji, name, address, lat, lng)
  values ('Σπίτι', '🏠', 'Σόλωνος 10', 'Σόλωνος 10, Αθήνα', 37.98, 23.73);
select test.ok((select user_id from public.saved_places) = :'A'::uuid, 'user_id = εγώ (default)');
select test.throws($$insert into public.saved_places (user_id, label, name, lat, lng) values ('00000000-0000-0000-0000-0000000000c7', 'x', 'x', 1, 1)$$,
  '42501', 'όχι για άλλον χρήστη');
select test.throws($$insert into public.saved_places (label, name, lat, lng) values ('   ', 'x', 1, 1)$$, '23514', 'κενό όνομα → σφάλμα');
select test.throws($$insert into public.saved_places (label, name, lat, lng) values ('x', 'x', 100, 1)$$, '23514', 'λάθος lat → σφάλμα');
insert into public.saved_places (label, name, lat, lng) select 'p' || g, 'p', 1, 1 from generate_series(1, 19) g;
select test.throws($$insert into public.saved_places (label, name, lat, lng) values ('21η', 'x', 1, 1)$$, '22023', 'όριο 20');

select test.login(:'B');
select test.ok((select count(*) from public.saved_places) = 0, 'ο άλλος δεν βλέπει τίποτα');
update public.saved_places set label = 'hack';
delete from public.saved_places;
select test.login(:'A');
select test.ok((select count(*) from public.saved_places where label = 'Σπίτι') = 1, 'ο άλλος δεν αλλάζει/σβήνει');
update public.saved_places set label = 'Σπιτάκι' where label = 'Σπίτι';
select test.ok(exists (select 1 from public.saved_places where label = 'Σπιτάκι'), 'μετονομασία');
reset role;

\echo 'Αποθηκευμένες διευθύνσεις ✅'
