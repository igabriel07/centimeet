-- Tests: «Διαλέγω εγώ το μέρος» (place_mode = fixed)
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000ab'
\set P '00000000-0000-0000-0000-0000000000ac'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'fixed-o@example.com', '{"full_name":"Ορέστης"}'),
  (:'P', 'fixed-p@example.com', '{"full_name":"Πόπη"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set VENUE '{"id":"g:taf","name":"Taf Coffee","address":"Εμμανουήλ Μπενάκη 7, Αθήνα","location":{"lat":37.9805,"lng":23.7313},"rating":4.7,"ratingCount":2100,"evil":"x"}'

select test.login(:'O');
set role authenticated;

-- Χωρίς αφετηρίες: ούτε για μένα ούτε για τον επισκέπτη
select public.create_outing('coffee', 'athens', null, null, null, array[:'P']::uuid[], '[{"name":"Λία"}]', null, null, :'VENUE') as fixed \gset

select test.ok((select place_mode from public.my_outings() where id = :'fixed') = 'fixed', 'place_mode = fixed');
select test.ok((select venue_name from public.my_outings() where id = :'fixed') = 'Taf Coffee', 'όνομα μέρους στο my_outings');
select test.ok((select going_count from public.my_outings() where id = :'fixed') = 2, 'έρχονται: εγώ + η Λία (ο Πέτρος δεν απάντησε)');
select test.ok((select chosen_venue from public.outings where id = :'fixed') ? 'evil' = false, 'κρατά μόνο τα γνωστά πεδία');
select test.ok((select (chosen_venue->'location'->>'lat')::float from public.outings where id = :'fixed') = 37.9805, 'συντεταγμένες');
reset role;
select test.ok(not exists (select 1 from public.outing_origins oo join public.outing_participants p on p.id = oo.participant_id
                           where p.outing_id = :'fixed'), 'καμία αφετηρία');
set role authenticated;

-- Έλεγχοι εγκυρότητας
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, null, array[%L]::uuid[], '[]', null, null, '{"name":"X","location":{"lat":999,"lng":0}}')$$, :'P'),
  '22023', 'άκυρες συντεταγμένες → σφάλμα');
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, null, array[%L]::uuid[], '[]', null, null, '{"name":"","location":{"lat":37.9,"lng":23.7}}')$$, :'P'),
  '22023', 'χωρίς όνομα → σφάλμα');

-- Κανονική («δίκαιη») έξοδος: όπως πριν
select public.create_outing('coffee', 'athens', null, null, '{"lat":37.97,"lng":23.73,"mode":"walk"}', array[:'P']::uuid[]) as fair \gset
select test.ok((select place_mode from public.my_outings() where id = :'fair') = 'fair', 'προεπιλογή: fair');
select test.ok((select venue_name from public.my_outings() where id = :'fair') is null, 'χωρίς μέρος');
reset role;

-- Ο καλεσμένος βλέπει το μέρος και απαντά μόνο ✓
select test.login(:'P');
set role authenticated;
select test.ok((select venue_name from public.my_outings() where id = :'fixed') = 'Taf Coffee', 'ο καλεσμένος βλέπει το μέρος');
select public.set_rsvp(:'fixed', 'going');
select test.ok((select going_count from public.my_outings() where id = :'fixed') = 3, 'μετά το ✓: 3 έρχονται');
reset role;

-- «Χωρίς μέρος»: ούτε μαγαζί ούτε αφετηρίες (και αγνοεί αφετηρία αν σταλεί)
select test.login(:'O');
set role authenticated;
select public.create_outing('cinema', 'athens', null, null, '{"lat":37.97,"lng":23.73,"mode":"walk"}', array[:'P']::uuid[], '[{"name":"Μάκης"}]',
                            null, null, null, false, true) as noplace \gset
select test.ok((select place_mode from public.my_outings() where id = :'noplace') = 'none', 'place_mode = none');
select test.ok((select venue_name from public.my_outings() where id = :'noplace') is null, 'χωρίς μέρος');
reset role;
select test.ok(not exists (select 1 from public.outing_origins oo join public.outing_participants p on p.id = oo.participant_id
                           where p.outing_id = :'noplace'), 'χωρίς μέρος: καμία αφετηρία');
select test.throws($$update public.outings set place_mode = 'other' where false or true$$, '23514', 'άγνωστη τιμή place_mode → σφάλμα');

\echo '«Διαλέγω εγώ το μέρος» ✅'
