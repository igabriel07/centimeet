-- Tests: «Προχώρα χωρίς όσους δεν απάντησαν»
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000ca'
\set P '00000000-0000-0000-0000-0000000000cb'
\set Q '00000000-0000-0000-0000-0000000000cc'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'sk-o@example.com', '{"full_name":"Όθων"}'),
  (:'P', 'sk-p@example.com', '{"full_name":"Πόπη"}'),
  (:'Q', 'sk-q@example.com', '{"full_name":"Κική"}');
insert into public.friendships (requester_id, addressee_id, status) values
  (:'O', :'P', 'accepted'), (:'O', :'Q', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P', :'Q']::uuid[], '[]') as oid \gset

-- Η Πόπη δηλώνει, η Κική δεν απαντά
select test.login(:'P');
select public.declare_origin((select id from public.outing_participants where outing_id = :'oid' and user_id = :'P'), 37.98, 23.74, 'x', 'walk');

-- Μόνο ο διοργανωτής
select test.throws(format($$select public.skip_unanswered(%L)$$, :'oid'), '42501', 'μόνο ο διοργανωτής');

select test.login(:'O');
select test.ok(public.skip_unanswered(:'oid') = 1, 'παραλείφθηκε 1');
select test.ok((select skipped and rsvp = 'declined' from public.get_outing_participants(:'oid') where user_id = :'Q'), 'Κική: «Δεν απάντησε»');
select test.ok((select not skipped and rsvp = 'going' from public.get_outing_participants(:'oid') where user_id = :'P'), 'Πόπη: κανονικά');
select test.ok(public.skip_unanswered(:'oid') = 0, 'δεύτερη φορά: τίποτα');

-- Η Κική δεν μπορεί πια να απαντήσει ή να δηλώσει
select test.login(:'Q');
select test.throws(format($$select public.set_rsvp(%L, 'going')$$, :'oid'), '55000', 'παραλείφθηκε → όχι απάντηση');
select test.throws(format($$select public.declare_origin(%L, 37.9, 23.7, 'x', 'walk')$$,
  (select id from public.outing_participants where outing_id = :'oid' and user_id = :'Q')), '55000', 'παραλείφθηκε → όχι δήλωση');
reset role;

select test.ok(exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id where c.outing_id = :'oid' and m.meta->>'event' = 'skipped_unanswered'), 'μήνυμα στη συνομιλία');

\echo 'Παράλειψη όσων δεν απάντησαν ✅'
