-- Κάθε απευθείας κίνηση της εφαρμογής (supabase-js) πρέπει να επιτρέπεται από τα grants,
-- και ό,τι δεν χρειάζεται πρέπει να απαγορεύεται. (Supabase: χωρίς αυτόματα grants από 2026.)
\set ON_ERROR_STOP 1
\set QUIET 1

\set K '00000000-0000-0000-0000-0000000000c1'
\set L '00000000-0000-0000-0000-0000000000c2'
\set M '00000000-0000-0000-0000-0000000000c3'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'K', 'kostas@example.com', '{"full_name":"Κώστας"}'),
  (:'L', 'lena@example.com', '{"full_name":"Λένα"}'),
  (:'M', 'manos@example.com', '{"full_name":"Μάνος"}');

-- ---------- Φίλοι (friends.tsx) ----------
select test.login(:'K');
set role authenticated;
select test.ok((select count(*) from public.profiles where username ilike 'lena%') = 1, 'αναζήτηση προφίλ');
insert into public.friendships (requester_id, addressee_id) values (:'K', :'L');
select test.ok((select count(*) from public.friendships) = 1, 'ανάγνωση φιλιών');
update public.profiles set display_name = 'Κώστας Π.' where id = :'K';
select test.throws(format($$update public.profiles set id = gen_random_uuid() where id = %L$$, :'K'), '42501', 'το id του προφίλ δεν αλλάζει');
reset role;

select test.login(:'L');
set role authenticated;
update public.friendships set status = 'accepted', responded_at = now() where requester_id = :'K' and addressee_id = :'L';
select public.get_or_create_direct_conversation(:'K') as conv \gset
insert into public.messages (conversation_id, sender_id, body) values (:'conv', :'L', 'Γεια!');
update public.conversation_members set last_read_at = now() where conversation_id = :'conv' and user_id = :'L';
select test.ok((select count(*) from public.messages where conversation_id = :'conv') = 1, 'μηνύματα: αποστολή και ανάγνωση');
-- Αναφορά & αποκλεισμός (moderation.ts)
insert into public.reports (reporter_id, reported_id, reason) values (:'L', :'M', 'Spam');
select test.throws($$select * from public.reports$$, '42501', 'οι αναφορές δεν διαβάζονται από χρήστες');
insert into public.blocks (blocker_id, blocked_id) values (:'L', :'M');
delete from public.friendships where requester_id = :'K' and addressee_id = :'L';
select test.ok((select count(*) from public.friendships) = 0, 'αφαίρεση φίλου');
-- Αποθηκευμένες τοποθεσίες & push tokens
insert into public.saved_locations (user_id, label, location) values (:'L', 'Σπίτι', 'SRID=4326;POINT(23.73 37.97)');
select public.register_push_token('ExponentPushToken[lenalenalena123]', 'ios');
delete from public.push_tokens where token = 'ExponentPushToken[lenalenalena123]';
select test.ok((select count(*) from public.push_tokens) = 0, 'διαγραφή push token στην αποσύνδεση');
reset role;

-- ---------- Έξοδος (outings.ts) ----------
insert into public.friendships (requester_id, addressee_id, status) values (:'K', :'L', 'accepted');
select test.login(:'K');
set role authenticated;
select public.create_outing('food', 'athens', null, null, '{"lat":37.97,"lng":23.73,"mode":"walk"}', array[:'L']::uuid[]) as outing \gset
select test.ok((select count(*) from public.outings where id = :'outing') = 1, 'ανάγνωση εξόδου');
insert into public.venue_suggestions (outing_id, payload) values (:'outing', '{}');
update public.outings set status = 'suggesting' where id = :'outing' and status = 'collecting';
select test.ok((select status from public.outings where id = :'outing') = 'suggesting', 'αποθήκευση προτάσεων & αλλαγή κατάστασης');
select test.ok((select count(*) from public.conversations where outing_id = :'outing') = 1, 'εύρεση συνομιλίας εξόδου');
select test.throws($$select * from public.outing_origins$$, '42501', 'αφετηρίες μόνο μέσω RPC');
select test.throws($$select * from public.api_usage$$, '42501', 'μετρητές κόστους: καμία πρόσβαση');
reset role;

-- ---------- anon: τίποτα απευθείας ----------
set role anon;
select test.throws($$select * from public.profiles$$, '42501', 'ο anon δεν διαβάζει προφίλ');
select test.throws($$select * from public.messages$$, '42501', 'ο anon δεν διαβάζει μηνύματα');
reset role;

-- ---------- service_role (backend) ----------
set role service_role;
select test.ok(public.consume_api_usage('2026-11', 'google:places_search', 1, 10), 'το backend μετρά χρήση');
reset role;

\echo 'Δικαιώματα πινάκων ✅'
