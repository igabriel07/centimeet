-- Tests: «Σήμερα» χωρίς ώρα (meet_day)
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000b6'
\set P '00000000-0000-0000-0000-0000000000b7'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'day-o@example.com', '{"full_name":"Ολυμπία"}'),
  (:'P', 'day-p@example.com', '{"full_name":"Παύλος"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select (now() at time zone 'Europe/Athens')::date as today \gset

select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]',
                            null, null, null, false, false, :'today'::date) as today_outing \gset
select test.ok((select meet_day from public.my_outings() where id = :'today_outing') = :'today'::date, 'my_outings: μέρα συνάντησης');
select test.ok((select meet_at from public.my_outings() where id = :'today_outing') is null, 'χωρίς ώρα');

select test.throws(format($$select public.create_outing('coffee', 'athens', now() + interval '1 hour', null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, %L::date)$$, :'ME', :'P', :'today'),
  '22023', 'μέρα ΚΑΙ ώρα μαζί → σφάλμα');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, %L::date - 1)$$, :'ME', :'P', :'today'),
  '22023', 'χθες → σφάλμα');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, null, null, false, false, %L::date + 90)$$, :'ME', :'P', :'today'),
  '22023', 'πάνω από 90 μέρες → σφάλμα');
reset role;

select test.ok(public._day_label(null) = '', 'χωρίς μέρα: κενό');
select test.ok(public._day_label((now() at time zone 'Europe/Athens')::date) = ' σήμερα', 'push: «σήμερα»');
select test.ok(public._day_label((now() at time zone 'Europe/Athens')::date + 1) = ' αύριο', 'push: «αύριο»');

\echo '«Σήμερα» χωρίς ώρα ✅'
