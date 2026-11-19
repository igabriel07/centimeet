-- Tests: «Απόψε» χωρίς ώρα
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000d4'
\set P '00000000-0000-0000-0000-0000000000d5'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'tn-o@example.com', '{"full_name":"Όμηρος"}'),
  (:'P', 'tn-p@example.com', '{"full_name":"Πάρις"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select (now() at time zone 'Europe/Athens')::date as today \gset
select public.create_outing('drinks', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]',
  null, null, null, false, false, :'today'::date, null, null, null, 'evening') as oid \gset
select test.ok((select meet_part = 'evening' and meet_day = :'today'::date from public.my_outings() where id = :'oid'), 'my_outings: απόψε');
select test.throws(format($$select public.create_outing('drinks', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, null, null, null, null, 'evening')$$, :'ME', :'P'),
  '22023', 'απόψε χωρίς μέρα → σφάλμα');
select test.throws(format($$select public.create_outing('drinks', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, %L::date, null, null, null, 'morning')$$, :'ME', :'P', :'today'),
  '22023', 'άλλο μέρος μέρας → σφάλμα');
reset role;

\echo '«Απόψε» ✅'
