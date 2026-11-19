-- Tests: επιλογή μαγαζιού & αποστολή στην παρέα μέσα στην εφαρμογή
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000cd'
\set P '00000000-0000-0000-0000-0000000000ce'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'dv-o@example.com', '{"full_name":"Ορέστης"}'),
  (:'P', 'dv-p@example.com', '{"full_name":"Πηνελόπη"}');
insert into public.friendships (requester_id, addressee_id, status) values (:'O', :'P', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'
\set VENUE '{"id":"v1","name":"Καφέ Μέση","address":"Ερμού 1","location":{"lat":37.976,"lng":23.73},"rating":4.6}'

select test.login(:'O');
set role authenticated;
select public.create_outing('coffee', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]') as oid \gset
select id as po from public.outing_participants where outing_id = :'oid' and user_id = :'P' \gset
select id as oo from public.outing_participants where outing_id = :'oid' and user_id = :'O' \gset

select test.login(:'P');
select test.throws(format($$select public.decide_venue(%L, %L)$$, :'oid', :'VENUE'), '42501', 'μόνο ο διοργανωτής');

select test.login(:'O');
select public.decide_venue(:'oid', :'VENUE', jsonb_build_array(
  jsonb_build_object('participantId', :'po', 'mode', 'transit', 'durationMin', 22, 'costEur', 1.2, 'navigationUrl', 'https://maps.example/x',
    'steps', jsonb_build_array(
      jsonb_build_object('kind', 'walk', 'durationMin', 4),
      jsonb_build_object('kind', 'bus', 'line', '31', 'from', 'Πανεπιστήμιο', 'to', 'Σύνταγμα', 'durationMin', 9),
      jsonb_build_object('kind', 'hack', 'line', repeat('x', 50), 'durationMin', 'oops'))),
  jsonb_build_object('participantId', :'oo', 'mode', 'walk', 'durationMin', 8, 'navigationUrl', 'javascript:alert(1)')
));
select test.ok((select status = 'decided' and chosen_venue->>'name' = 'Καφέ Μέση' from public.outings where id = :'oid'), 'αποφασίστηκε');
select test.ok((select plan->>'navigationUrl' is null from public.get_outing_participants(:'oid') where id = :'oo'), 'μη https link → αφαιρείται');

-- Η Πηνελόπη βλέπει μόνο τη δική της διαδρομή
select test.login(:'P');
select test.ok((select (plan->>'durationMin')::int = 22 from public.get_outing_participants(:'oid') where id = :'po'), 'η δική μου διαδρομή');
select test.ok((select plan is null from public.get_outing_participants(:'oid') where id = :'oo'), 'όχι των άλλων');
select test.ok((select jsonb_array_length(plan->'steps') = 3 and plan->'steps'->1->>'line' = '31' and plan->'steps'->1->>'from' = 'Πανεπιστήμιο'
  from public.get_outing_participants(:'oid') where id = :'po'), 'βήματα συγκοινωνίας');
select test.ok((select plan->'steps'->2->>'kind' = 'other' and char_length(plan->'steps'->2->>'line') = 20 and plan->'steps'->2->'durationMin' is null
  from public.get_outing_participants(:'oid') where id = :'po'), 'βήματα: καθαρισμός');
select test.ok((select venue_name = 'Καφέ Μέση' from public.my_outings() where id = :'oid'), 'my_outings: όνομα μαγαζιού');
reset role;

select test.ok(exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
  where c.outing_id = :'oid' and m.meta->>'event' = 'venue_decided'), 'μήνυμα στη συνομιλία');

\echo 'Επιλογή μαγαζιού ✅'
