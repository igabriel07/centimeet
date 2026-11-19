-- Tests: ιστορικό εξόδων (outing_history)
\set ON_ERROR_STOP 1
\set QUIET 1

\set K '00000000-0000-0000-0000-0000000000e1'
\set M '00000000-0000-0000-0000-0000000000e2'
\set X '00000000-0000-0000-0000-0000000000e3'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'K', 'history-k@example.com', '{"full_name":"Κική"}'),
  (:'M', 'history-m@example.com', '{"full_name":"Μάρκος"}'),
  (:'X', 'history-x@example.com', '{"full_name":"Ξένια"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'M', :'K', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'
\set GUESTS '[{"name":"Λία","lat":38.0,"lng":23.76,"mode":"car"}]'

-- Η Κική: ένας καφές που έγινε (με μαγαζί) και ένα φαγητό που ακυρώθηκε
select test.login(:'K');
set role authenticated;
select public.create_outing('coffee', 'athens', '2026-11-01T18:00:00Z', null, :'ME', '{}', :'GUESTS') as done_coffee \gset
select public.create_outing('food', 'athens', '2026-11-05T20:00:00Z', null, :'ME', '{}', :'GUESTS', 'bougatsa') as cancelled_food \gset
reset role;
update public.outings set status = 'done', chosen_venue = '{"name":"Café Μέση"}' where id = :'done_coffee';
update public.outings set status = 'cancelled' where id = :'cancelled_food';

-- Ο Μάρκος καλεί την Κική σε δύο εξόδους· τη μία την αρνείται
select test.login(:'M');
set role authenticated;
select public.create_outing('drinks', 'athens', '2026-11-10T21:00:00Z', null, :'ME', array[:'K']::uuid[], '[]') as declined \gset
select public.create_outing('cinema', 'athens', '2026-11-12T21:00:00Z', null, :'ME', array[:'K']::uuid[], '[]') as invited \gset
reset role;

select test.login(:'K');
set role authenticated;
select public.set_rsvp(:'declined', 'declined');

select test.ok((select count(*) from public.outing_history()) = 3, 'ιστορικό: 3 έξοδοι (όχι αυτή που αρνήθηκε)');
select test.ok(not exists (select 1 from public.outing_history() where id = :'declined'), 'όχι η έξοδος που αρνήθηκε');
select test.ok(exists (select 1 from public.outing_history() where id = :'done_coffee' and status = 'done'),
  'περιλαμβάνει ολοκληρωμένες (που το my_outings κρύβει)');
select test.ok(not exists (select 1 from public.my_outings() where id = :'done_coffee'), 'το my_outings πράγματι τις κρύβει');
select test.ok(exists (select 1 from public.outing_history() where id = :'cancelled_food' and status = 'cancelled' and category = 'bougatsa'),
  'περιλαμβάνει ακυρωμένες, με κατηγορία');
select test.ok((select venue_name from public.outing_history() where id = :'done_coffee') = 'Café Μέση', 'όνομα μαγαζιού που επιλέχθηκε');
select test.ok((select is_organizer from public.outing_history() where id = :'invited') = false, 'σε πρόσκληση δεν είναι διοργανώτρια');
select test.ok((select array_agg(id order by ord) from (select id, row_number() over () as ord from public.outing_history()) s)
  = array[:'invited', :'cancelled_food', :'done_coffee']::uuid[], 'νεότερη πρώτη');
reset role;

-- Προτίμηση «πού πάμε»: ο καλεσμένος ορίζει τη δική του
select test.login(:'K');
set role authenticated;
select id as kpart from public.outing_participants where outing_id = :'invited' and user_id = :'K' \gset
select test.ok((select preference from public.get_outing_participants(:'invited') where user_id = :'K') = 'fair', 'προεπιλογή: στη μέση');
select public.set_place_preference(:'kpart', 'near');
select test.ok((select preference from public.get_outing_participants(:'invited') where user_id = :'K') = 'near', 'προτίμηση «κοντά μου»');
select id as mpart from public.outing_participants where outing_id = :'invited' and user_id = :'M' \gset
select test.throws(format($$select public.set_place_preference(%L, 'anywhere')$$, :'mpart'), '42501', 'δεν αλλάζω την προτίμηση άλλου');
reset role;

-- Η Ξένια δεν βλέπει τίποτα από αυτά
select test.login(:'X');
set role authenticated;
select test.ok((select count(*) from public.outing_history()) = 0, 'άλλος χρήστης: άδειο ιστορικό');
reset role;

set role anon;
select test.throws($$select * from public.outing_history()$$, '42501', 'ο anon δεν διαβάζει ιστορικό');
reset role;

-- Αρχική «Προσκλήσεις»: το my_outings δίνει το όνομα του διοργανωτή
select test.login(:'K');
set role authenticated;
select test.ok((select organizer_name from public.my_outings() where id = :'invited') = 'Μάρκος', 'my_outings: όνομα διοργανωτή');
select test.ok((select my_rsvp from public.my_outings() where id = :'declined') = 'declined', 'my_outings: η άρνηση φαίνεται (την κρύβει η εφαρμογή)');
reset role;

\echo 'Ιστορικό εξόδων ✅'
