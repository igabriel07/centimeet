-- Tests για push ειδοποιήσεις και διαγραφή λογαριασμού
\set ON_ERROR_STOP 1
\set QUIET 1

\set F '00000000-0000-0000-0000-0000000000f1'
\set G '00000000-0000-0000-0000-0000000000f2'
\set H '00000000-0000-0000-0000-0000000000f3'
\set TF 'ExponentPushToken[fffffffffffff]'
\set TG 'ExponentPushToken[ggggggggggggg]'

insert into auth.users (id, email, raw_user_meta_data) values
  (:'F', 'fotini@example.com', '{"full_name":"Φωτεινή"}'),
  (:'G', 'giannis@example.com', '{"full_name":"Γιάννης"}'),
  (:'H', 'haris@example.com', '{"full_name":"Χάρης"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'F', :'G', 'accepted');

-- ---------- Καταχώρηση συσκευής ----------
select test.login(:'G');
set role authenticated;
select public.register_push_token(:'TG', 'ios');
select test.throws($$select public.register_push_token('not-a-token', 'ios')$$, '22023', 'άκυρο token απορρίπτεται');
reset role;
select test.ok((select user_id from public.push_tokens where token = :'TG') = :'G', 'token καταχωρήθηκε στον Γ');

select test.login(:'H');
set role authenticated;
select public.register_push_token(:'TG', 'ios');
reset role;
select test.ok((select user_id from public.push_tokens where token = :'TG') = :'H', 'ίδια συσκευή, άλλος λογαριασμός → το token μεταφέρεται');

select test.login(:'G');
set role authenticated;
select public.register_push_token(:'TG', 'ios');
reset role;
select test.login(:'F');
set role authenticated;
select public.register_push_token(:'TF', 'android');
reset role;

-- ---------- Πρόσκληση ----------
select test.login(:'F');
set role authenticated;
select public.create_outing('drinks', 'athens', null, null, '{"lat":37.97,"lng":23.73,"mode":"walk"}', array[:'G']::uuid[]) as outing \gset
reset role;

select test.ok((select count(*) from test.pushes_to(:'TG')) = 1, 'ο Γ πήρε μία ειδοποίηση πρόσκλησης (όχι και για το μήνυμα «Νέα έξοδος»)');
select test.ok((select m->>'body' from test.pushes_to(:'TG') m limit 1) = 'Φωτεινή σε κάλεσε για ποτό. Δήλωσε από πού ξεκινάς!', 'κείμενο πρόσκλησης');
select test.ok((select m->'data'->>'url' from test.pushes_to(:'TG') m limit 1) = '/outing/' || :'outing', 'η ειδοποίηση ανοίγει την έξοδο');
select test.ok((select count(*) from test.pushes_to(:'TF')) = 0, 'ο διοργανωτής δεν ειδοποιείται για τη δική του έξοδο');

-- ---------- Δήλωση ----------
select id as part_g from public.outing_participants where outing_id = :'outing' and user_id = :'G' \gset
select test.login(:'G');
set role authenticated;
select public.declare_origin(:'part_g', 37.99, 23.74, 'Κυψέλη', 'transit');
reset role;
select test.ok((select count(*) from test.pushes_to(:'TF')) = 1, 'ο διοργανωτής ειδοποιείται για τη δήλωση');
select test.ok((select m->>'body' from test.pushes_to(:'TF') m) = 'Όλοι δήλωσαν! Βρες το δίκαιο σημείο 🎯', '«Όλοι δήλωσαν» όταν δεν εκκρεμεί κανείς');
select test.ok((select count(*) from test.pushes_to(:'TG')) = 1, 'αυτός που δήλωσε δεν ειδοποιείται');

-- ---------- Μηνύματα ----------
select id as conv from public.conversations where outing_id = :'outing' \gset
select test.login(:'G');
set role authenticated;
insert into public.messages (conversation_id, sender_id, body) values (:'conv', :'G', 'Στις 9 εκεί;');
reset role;
select test.ok((select m->>'title' from test.pushes_to(:'TF') m offset 1 limit 1) = 'Γιάννης', 'μήνυμα → ειδοποίηση με όνομα αποστολέα');
select test.ok((select count(*) from test.pushes_to(:'TG')) = 1, 'ο αποστολέας δεν ειδοποιείται');

select test.login(:'F');
set role authenticated;
update public.conversation_members set muted = true where conversation_id = :'conv' and user_id = :'F';
reset role;
select test.login(:'G');
set role authenticated;
insert into public.messages (conversation_id, sender_id, body) values (:'conv', :'G', 'Ε;');
reset role;
select test.ok((select count(*) from test.pushes_to(:'TF')) = 2, 'σίγαση → χωρίς ειδοποίηση');

-- ---------- Προτάσεις ----------
select test.login(:'F');
set role authenticated;
insert into public.venue_suggestions (outing_id, payload) values (:'outing', '{"areas":[],"primary":[],"alternatives":[]}');
reset role;
select test.ok((select m->>'title' from test.pushes_to(:'TG') m offset 1 limit 1) = 'Ήρθαν προτάσεις! ☕', 'τα μέλη ειδοποιούνται για τις προτάσεις');
select test.ok((select count(*) from test.pushes_to(:'TF')) = 2, 'ο διοργανωτής όχι');

-- ---------- Διαγραφή λογαριασμού ----------
set role anon;
select test.throws($$select public.delete_my_account()$$, '42501', 'ο anon δεν διαγράφει λογαριασμούς');
reset role;

select test.login(:'G');
set role authenticated;
select public.delete_my_account();
reset role;
select test.ok(not exists (select 1 from auth.users where id = :'G'), 'ο λογαριασμός διαγράφηκε');
select test.ok(not exists (select 1 from public.profiles where id = :'G'), 'το προφίλ διαγράφηκε');
select test.ok(not exists (select 1 from public.outing_participants where user_id = :'G'), 'οι συμμετοχές διαγράφηκαν');
select test.ok(not exists (select 1 from public.outing_origins where participant_id = :'part_g'), 'η αφετηρία διαγράφηκε');
select test.ok(not exists (select 1 from public.messages where sender_id = :'G' or body = 'Στις 9 εκεί;'), 'τα μηνύματά του διαγράφηκαν');
select test.ok(not exists (select 1 from public.push_tokens where token = :'TG'), 'το push token διαγράφηκε');
select test.ok(not exists (select 1 from public.friendships where :'G' in (requester_id, addressee_id)), 'οι φιλίες διαγράφηκαν');
select test.ok(exists (select 1 from public.outings where id = :'outing'), 'η έξοδος της Φωτεινής μένει');

\echo 'Push & διαγραφή λογαριασμού ✅'
