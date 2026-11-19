-- Tests: αποθηκευμένες έξοδοι
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000cf'
\set P '00000000-0000-0000-0000-0000000000d0'
\set X '00000000-0000-0000-0000-0000000000d3'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'so-o@example.com', '{"full_name":"Όλγα"}'),
  (:'P', 'so-p@example.com', '{"full_name":"Πέτρος"}'),
  (:'X', 'so-x@example.com', '{"full_name":"Ξένος"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]') as oid \gset
select public.create_outing('food', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]') as oid2 \gset

select test.login(:'P');
insert into public.saved_outings (outing_id) values (:'oid');
select test.ok((select saved from public.my_outings() where id = :'oid'), 'my_outings: saved');
select test.ok((select not saved from public.my_outings() where id = :'oid2'), 'my_outings: όχι saved');
select test.ok((select count(*) = 1 from public.my_saved_outings()), 'my_saved_outings: μόνο η αποθηκευμένη');

-- Μένει και μετά την ολοκλήρωση
reset role;
update public.outings set status = 'done' where id = :'oid';
set role authenticated;
select test.login(:'P');
select test.ok((select count(*) = 1 from public.my_saved_outings() where id = :'oid' and status = 'done'), 'μένει και όταν τελειώσει');

-- Ο Όλγα δεν βλέπει τις αποθηκεύσεις του Πέτρου
select test.login(:'O');
select test.ok((select count(*) = 0 from public.saved_outings), 'ιδιωτικό');

-- Ξένος: δεν μπορεί να αποθηκεύσει έξοδο που δεν είναι μέλος
select test.login(:'X');
select test.throws(format($$insert into public.saved_outings (outing_id) values (%L)$$, :'oid2'), '42501', 'μόνο μέλη');

select test.login(:'P');
delete from public.saved_outings where outing_id = :'oid';
select test.ok((select count(*) = 0 from public.my_saved_outings()), 'αφαίρεση');
reset role;

\echo 'Αποθηκευμένες έξοδοι ✅'
