-- Tests: διάρκεια εξόδου
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000c8'
\set P '00000000-0000-0000-0000-0000000000c9'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'du-o@example.com', '{"full_name":"Όλγα"}'),
  (:'P', 'du-p@example.com', '{"full_name":"Πάνος"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]',
                            null, null, null, false, false, null, null, 120) as oid \gset
select test.ok((select duration_minutes from public.outings where id = :'oid') = 120, 'διάρκεια 2 ώρες');
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]') as oid2 \gset
select test.ok((select duration_minutes from public.outings where id = :'oid2') is null, 'χωρίς διάρκεια → null');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, null, null, 5)$$, :'ME', :'P'),
  '22023', 'κάτω από 15 λεπτά → σφάλμα');
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]',
                            null, null, null, false, false, null, null, 3 * 1440) as oid3 \gset
select test.ok((select duration_minutes from public.outings where id = :'oid3') = 4320, '3 μέρες');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, null, null, 259201)$$, :'ME', :'P'),
  '22023', 'πάνω από 6 μήνες → σφάλμα');

-- «Άλλη»: ακριβής λήξη
select public.create_outing('coffee', 'athens', now() + interval '1 hour', null, :'ME', array[:'P']::uuid[], '[]',
                            null, null, null, false, false, null, null, null, now() + interval '2 days') as oid4 \gset
select test.ok((select ends_at is not null and duration_minutes is null from public.outings where id = :'oid4'), 'ακριβής λήξη');
select test.throws(format($$select public.create_outing('coffee', 'athens', now() + interval '3 hours', null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, null, null, null, now() + interval '2 hours')$$, :'ME', :'P'),
  '22023', 'λήξη πριν τη συνάντηση → σφάλμα');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, null, null, 60, now() + interval '2 hours')$$, :'ME', :'P'),
  '22023', 'διάρκεια ΚΑΙ λήξη → σφάλμα');
-- Χρονόμετρο απάντησης: έως 6 μήνες
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]', null, now() + interval '3 months') as oid5 \gset
select test.ok((select respond_by is not null from public.outings where id = :'oid5'), 'χρονόμετρο 3 μηνών');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, now() + interval '200 days')$$, :'ME', :'P'),
  '22023', 'χρονόμετρο > 6 μήνες → σφάλμα');
select test.login(:'P');
select test.ok((select duration_minutes from public.outings where id = :'oid') = 120, 'ο καλεσμένος τη βλέπει');
reset role;

\echo 'Διάρκεια ✅'
