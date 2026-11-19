-- Tests: κατηγορία εξόδου (πίτσα, σουβλάκι…) και δραστηριότητα «Σημείο»
\set ON_ERROR_STOP 1
\set QUIET 1

\set K '00000000-0000-0000-0000-0000000000d1'
\set M '00000000-0000-0000-0000-0000000000d2'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'K', 'kostas@example.com', '{"full_name":"Κώστας"}'),
  (:'M', 'mina@example.com', '{"full_name":"Μίνα"}');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'
\set GUESTS '[{"name":"Λία","lat":38.0,"lng":23.76,"mode":"car"}]'

select test.login(:'K');
set role authenticated;

-- Φαγητό → πίτσα
select public.create_outing('food', 'athens', null, null, :'ME', '{}', :'GUESTS', 'pizza') as pizza \gset
select test.ok((select category from public.outings where id = :'pizza') = 'pizza', 'αποθηκεύεται η κατηγορία');
select test.ok((select category from public.my_outings() where id = :'pizza') = 'pizza', 'my_outings επιστρέφει την κατηγορία');

-- Χωρίς κατηγορία («Όλα») — και οι παλιές κλήσεις χωρίς την παράμετρο δουλεύουν
select public.create_outing('drinks', 'athens', null, null, :'ME', '{}', :'GUESTS') as anyd \gset
select test.ok((select category from public.outings where id = :'anyd') is null, 'χωρίς κατηγορία = null («Όλα»)');
select public.create_outing('drinks', 'athens', null, null, :'ME', '{}', :'GUESTS', '') as emptyc \gset
select test.ok((select category from public.outings where id = :'emptyc') is null, 'κενή κατηγορία = null');

-- «Σημείο»
select public.create_outing('spot', 'thessaloniki', null, null, :'ME', '{}', :'GUESTS') as spot \gset
select test.ok((select activity from public.my_outings() where id = :'spot') = 'spot', '«Σημείο» αποθηκεύεται');
select test.throws(
  format($$select public.create_outing('spot', 'athens', null, null, %L, '{}', %L, 'pizza')$$, :'ME', :'GUESTS'),
  '22023', '«Σημείο» δεν δέχεται κατηγορία');

-- Μορφή κατηγορίας
select test.throws(
  format($$select public.create_outing('food', 'athens', null, null, %L, '{}', %L, 'DROP TABLE')$$, :'ME', :'GUESTS'),
  '23514', 'άκυρη μορφή κατηγορίας απορρίπτεται');
select test.throws(
  format($$update public.outings set activity = 'spot' where id = %L$$, :'pizza'),
  '23514', 'δεν γίνεται «Σημείο» με κατηγορία ούτε με απευθείας update');

-- «Θέατρο» + μπουγάτσα στο ενιαίο φαγητό
select public.create_outing('theater', 'athens', null, null, :'ME', '{}', :'GUESTS', 'standup') as th \gset
select test.ok((select activity::text || '/' || category from public.my_outings() where id = :'th') = 'theater/standup', '«Θέατρο» με κατηγορία');
select public.create_outing('food', 'thessaloniki', null, null, :'ME', '{}', :'GUESTS', 'bougatsa') as boug \gset
select test.ok((select category from public.outings where id = :'boug') = 'bougatsa', 'φαγητό → μπουγάτσα');

-- Γλυκό/Brunch δεν υπάρχουν πια ως δραστηριότητες
select test.throws(
  format($$select public.create_outing('dessert', 'athens', null, null, %L, '{}', %L)$$, :'ME', :'GUESTS'),
  '23514', 'νέα έξοδος «dessert» απορρίπτεται');
select test.throws(
  format($$select public.create_outing('brunch', 'athens', null, null, %L, '{}', %L)$$, :'ME', :'GUESTS'),
  '23514', 'νέα έξοδος «brunch» απορρίπτεται');

-- Ο anon δεν καλεί create_outing (και με τη νέα υπογραφή)
reset role;
set role anon;
select test.throws($$select public.create_outing('food', 'athens', null, null, null, '{}', '[]', 'pizza')$$, '42501', 'ο anon δεν καλεί create_outing');
reset role;

-- Ειδοποίηση πρόσκλησης για «Σημείο»
select test.ok(public._activity_label('spot') = 'συνάντηση', 'κείμενο ειδοποίησης για «Σημείο»');
select test.ok(public._activity_label('theater') = 'θέατρο', 'κείμενο ειδοποίησης για «Θέατρο»');

\echo 'Κατηγορίες & «Σημείο» ✅'
