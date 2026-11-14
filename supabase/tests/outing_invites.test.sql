-- Tests για αποθηκευμένες εξόδους, προσκλήσεις, αφετηρίες και RLS.
-- Τρέχουν με: npm run test:db  (βλ. supabase/tests/run.sh)
\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------- Δεδομένα ----------
-- A διοργανωτής · B, C φίλοι του A (όχι μεταξύ τους) · D άγνωστος · E φίλος που έχει αποκλείσει τον A
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@example.com',   '{"full_name":"Άννα"}'),
  ('00000000-0000-0000-0000-00000000000b', 'babis@example.com',  '{"full_name":"Μπάμπης"}'),
  ('00000000-0000-0000-0000-00000000000c', 'chloe@example.com',  '{"full_name":"Χλόη"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dimitris@example.com', '{"full_name":"Δημήτρης"}'),
  ('00000000-0000-0000-0000-00000000000e', 'eleni@example.com',  '{"full_name":"Ελένη"}');

insert into public.friendships (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted'),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'accepted'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000e', 'accepted');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-00000000000a');

\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
\set E '00000000-0000-0000-0000-00000000000e'

-- ---------- Δημιουργία εξόδου ----------
set role anon;
select test.throws($$select public.create_outing('coffee', 'athens')$$, '42501', 'ο anon δεν μπορεί να καλέσει create_outing');
reset role;

select test.login(:'A');
set role authenticated;

select test.throws(
  format($$select public.create_outing('coffee', 'athens', null, null, null, array[%L]::uuid[])$$, :'D'),
  '42501', 'δεν μπορείς να καλέσεις άγνωστο');
select test.throws(
  format($$select public.create_outing('coffee', 'athens', null, null, null, array[%L]::uuid[])$$, :'E'),
  '42501', 'δεν μπορείς να καλέσεις φίλο με αποκλεισμό');
select test.throws($$select public.create_outing('coffee', 'athens')$$, '22023', 'χρειάζονται τουλάχιστον 2 άτομα');
select test.throws(
  $$select public.create_outing('coffee', 'athens', null, null, '{"lat":200,"lng":23,"mode":"walk"}')$$,
  '22023', 'άκυρες συντεταγμένες απορρίπτονται');

select public.create_outing(
  'coffee', 'athens', '2026-11-20T19:00:00+02', 'Καφεδάκι',
  '{"lat":37.9755,"lng":23.7348,"label":"Σύνταγμα","mode":"walk"}',
  array[:'B', :'C', :'B']::uuid[],
  '[{"name":"Γιώργος","lat":37.94,"lng":23.65,"label":"Πειραιάς","mode":"transit"}]'
) as outing \gset

select test.ok((select count(*) from public.get_outing_participants(:'outing')) = 4,
  'η έξοδος έχει 4 συμμετέχοντες (διπλή πρόσκληση αγνοείται)');
select test.ok(
  (select array_agg(name order by name) from public.get_outing_participants(:'outing') where declared)
    = array['Άννα', 'Γιώργος'],
  'διοργανωτής και επισκέπτης έχουν ήδη δηλώσει');
select test.ok(
  (select bool_and(lat is not null) from public.get_outing_participants(:'outing') where declared),
  'ο διοργανωτής βλέπει όλες τις αφετηρίες');
select test.ok((select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
                where c.outing_id = :'outing' and m.kind = 'system') = 1,
  'μήνυμα συστήματος για τη νέα έξοδο');
reset role;

select id as part_b  from public.outing_participants where outing_id = :'outing' and user_id = :'B' \gset
select id as part_c  from public.outing_participants where outing_id = :'outing' and user_id = :'C' \gset
select id as part_a  from public.outing_participants where outing_id = :'outing' and user_id = :'A' \gset
select id as part_g  from public.outing_participants where outing_id = :'outing' and guest_name = 'Γιώργος' \gset

select test.ok(
  (select count(*) from public.conversation_members cm join public.conversations c on c.id = cm.conversation_id
   where c.outing_id = :'outing') = 3,
  'A, B, C μπαίνουν στην ομαδική συνομιλία');

-- ---------- Ιδιωτικότητα αφετηριών ----------
select test.login(:'B');
set role authenticated;
select test.ok(
  (select bool_and(lat is null and origin_label is null) from public.get_outing_participants(:'outing')),
  'ο B δεν βλέπει αφετηρίες άλλων');
select test.throws($$select * from public.outing_origins$$, '42501', 'απευθείας ανάγνωση outing_origins απαγορεύεται');
select test.ok((select count(*) from public.outings where id = :'outing') = 1, 'ο B βλέπει την έξοδο (RLS)');

-- Ο B δηλώνει
select public.declare_origin(:'part_b', 37.99, 23.73, 'Κυψέλη', 'bike');
select test.ok(
  (select lat = 37.99 and lng = 23.73 and origin_label = 'Κυψέλη' and mode = 'bike' and rsvp = 'going'
   from public.get_outing_participants(:'outing') where id = :'part_b'),
  'ο B βλέπει τη δική του αφετηρία μετά τη δήλωση');
select test.ok(
  (select my_declared and declared_count = 3 and total_count = 4 and not is_organizer from public.my_outings() where id = :'outing'),
  'my_outings: πρόοδος 3/4 για τον B');

-- Ό,τι δεν επιτρέπεται στον B
select test.throws(format($$select public.declare_origin(%L, 38, 23.7, null, 'car')$$, :'part_c'),
  '42501', 'ο B δεν δηλώνει για τη C');
select test.throws(format($$select public.declare_origin(%L, 38, 23.7, null, 'car')$$, :'part_g'),
  '42501', 'ο B δεν δηλώνει για επισκέπτη');
select test.throws(format($$update public.outing_participants set outing_id = gen_random_uuid() where id = %L$$, :'part_b'),
  '42501', 'απευθείας update συμμετέχοντα απαγορεύεται (κενό outing_id)');
select test.throws(format($$insert into public.outing_participants (outing_id, guest_name) values (%L, 'x')$$, :'outing'),
  '42501', 'απευθείας insert συμμετέχοντα απαγορεύεται');
select test.throws(format($$select public.invite_to_outing(%L, array[%L]::uuid[])$$, :'outing', :'D'),
  '42501', 'μόνο ο διοργανωτής προσκαλεί');
reset role;

select test.ok(
  (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
   where c.outing_id = :'outing' and m.body = 'Μπάμπης δήλωσε αφετηρία ✓') = 1,
  'μήνυμα «δήλωσε αφετηρία»');

-- Δεύτερη δήλωση (αλλαγή) δεν ξαναστέλνει μήνυμα
select test.login(:'B');
set role authenticated;
select public.declare_origin(:'part_b', 37.98, 23.72, 'Κυψέλη 2', 'transit');
reset role;
select test.ok(
  (select count(*) from public.messages where body like 'Μπάμπης δήλωσε%') = 1,
  'αλλαγή αφετηρίας δεν ξαναστέλνει μήνυμα');

-- ---------- Διοργανωτής ----------
select test.login(:'A');
set role authenticated;
select test.ok(
  (select lat = 37.98 and mode = 'transit' from public.get_outing_participants(:'outing') where id = :'part_b'),
  'ο διοργανωτής βλέπει την αφετηρία του B');
select test.throws(format($$select public.declare_origin(%L, 38, 23.7, null, 'car')$$, :'part_b'),
  '42501', 'ο διοργανωτής δεν αλλάζει αφετηρία φίλου');
select public.declare_origin(:'part_g', 37.95, 23.66, 'Πειραιάς λιμάνι', 'taxi');
select test.ok(
  (select mode = 'taxi' from public.get_outing_participants(:'outing') where id = :'part_g'),
  'ο διοργανωτής αλλάζει αφετηρία επισκέπτη');
select test.throws(format($$select public.invite_to_outing(%L, array[%L]::uuid[])$$, :'outing', :'D'),
  '42501', 'ο διοργανωτής δεν προσκαλεί άγνωστο αργότερα');
select test.ok(
  (select public.invite_to_outing(:'outing', array[:'B']::uuid[])) = 0,
  'επανάληψη πρόσκλησης δεν προσθέτει διπλό');
reset role;

-- ---------- Άγνωστος ----------
select test.login(:'D');
set role authenticated;
select test.throws(format($$select * from public.get_outing_participants(%L)$$, :'outing'),
  '42501', 'ο D δεν βλέπει συμμετέχοντες ξένης εξόδου');
select test.ok((select count(*) from public.outings where id = :'outing') = 0, 'ο D δεν βλέπει την έξοδο');
select test.ok((select count(*) from public.my_outings()) = 0, 'my_outings του D είναι κενό');
select test.throws(format($$select public.set_rsvp(%L, 'going')$$, :'outing'),
  '42501', 'ο D δεν κάνει RSVP σε ξένη έξοδο');
reset role;

-- ---------- RSVP ----------
select test.login(:'C');
set role authenticated;
select public.declare_origin(:'part_c', 40.0, 22.9, 'Κάπου', 'car');
select public.set_rsvp(:'outing', 'declined');
select test.ok(
  (select rsvp = 'declined' and not declared and mode is null and lat is null from public.get_outing_participants(:'outing') where id = :'part_c'),
  'με άρνηση σβήνει η αφετηρία της C');
select test.ok(
  (select declared_count = 3 and total_count = 3 from public.my_outings() where id = :'outing'),
  'όποιος αρνήθηκε δεν μετράει στην πρόοδο');
select test.throws(format($$select public.set_rsvp(%L, 'invited')$$, :'outing'), '22023', 'RSVP «invited» δεν επιτρέπεται');
reset role;
select test.ok((select count(*) from public.outing_origins where participant_id = :'part_c') = 0, 'η αφετηρία της C διαγράφηκε από τη βάση');

-- ---------- Κλειστή έξοδος ----------
update public.outings set status = 'decided' where id = :'outing';
select test.login(:'B');
set role authenticated;
select test.throws(format($$select public.declare_origin(%L, 38, 23.7, null, 'car')$$, :'part_b'),
  '55000', 'δεν αλλάζει αφετηρία σε κλεισμένη έξοδο');
reset role;

\echo 'Όλα τα DB tests πέρασαν ✅'
