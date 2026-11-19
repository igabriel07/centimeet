-- Tests: τίτλος & περιγραφή εξόδου
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000c4'
\set P '00000000-0000-0000-0000-0000000000c5'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'td-o@example.com', '{"full_name":"Θάλεια"}'),
  (:'P', 'td-p@example.com', '{"full_name":"Πέτρος"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select public.create_outing('coffee', 'athens', null, '  Γενέθλια Νίκου  ', :'ME', array[:'P']::uuid[], '[]',
                            null, null, null, false, false, null, '  Φέρτε δώρο 🎁  ') as oid \gset
select test.ok((select title from public.outings where id = :'oid') = 'Γενέθλια Νίκου', 'τίτλος (trim)');
select test.ok((select description from public.outings where id = :'oid') = 'Φέρτε δώρο 🎁', 'περιγραφή (trim)');

select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]',
                            null, null, null, false, false, null, '   ') as oid2 \gset
select test.ok((select description from public.outings where id = :'oid2') is null, 'κενή περιγραφή → null');

select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, null, %L)$$, :'ME', :'P', repeat('x', 501)),
  '22023', 'περιγραφή > 500 → σφάλμα');

-- Ο καλεσμένος βλέπει την περιγραφή
select test.login(:'P');
select test.ok((select description from public.outings where id = :'oid') = 'Φέρτε δώρο 🎁', 'ο καλεσμένος βλέπει την περιγραφή');
reset role;

\echo 'Τίτλος & περιγραφή ✅'
