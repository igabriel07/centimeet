-- Tests: χρονόμετρο απάντησης (respond_by) + αυτόματη ακύρωση
\set ON_ERROR_STOP 1
\set QUIET 1

\set O '00000000-0000-0000-0000-0000000000a8'
\set P '00000000-0000-0000-0000-0000000000a9'
\set Q '00000000-0000-0000-0000-0000000000aa'
insert into auth.users (id, email, raw_user_meta_data) values
  (:'O', 'timer-o@example.com', '{"full_name":"Όλγα"}'),
  (:'P', 'timer-p@example.com', '{"full_name":"Πέτρος"}'),
  (:'Q', 'timer-q@example.com', '{"full_name":"Κώστας"}');
insert into public.friendships (requester_id, addressee_id, status) values
  (:'O', :'P', 'accepted'), (:'O', :'Q', 'accepted');

\set ME '{"lat":37.97,"lng":23.73,"mode":"walk"}'

select test.login(:'O');
set role authenticated;

-- Έλεγχοι προθεσμίας
select test.throws(format($$select public.create_outing('coffee', 'athens', null, null, %L, array[%L]::uuid[], '[]', null, now() - interval '1 minute')$$, :'ME', :'P'),
  '22023', 'προθεσμία στο παρελθόν → σφάλμα');
select test.throws(format($$select public.create_outing('coffee', 'athens', now() + interval '1 hour', null, %L, array[%L]::uuid[], '[]', null, now() + interval '2 hours')$$, :'ME', :'P'),
  '22023', 'προθεσμία μετά την ώρα συνάντησης → σφάλμα');

-- 1) Λήγει: ο Πέτρος απάντησε, ο Κώστας όχι → ακύρωση
select public.create_outing('coffee', 'athens', now() + interval '3 hours', null, :'ME', array[:'P', :'Q']::uuid[], '[]', null, now() + interval '30 minutes') as expiring \gset
-- 2) Λήγει αλλά απάντησαν όλοι → μένει
select public.create_outing('drinks', 'athens', null, null, :'ME', array[:'P']::uuid[], '[]', null, now() + interval '30 minutes') as answered \gset
-- 3) Δεν έχει λήξει → μένει
select public.create_outing('cinema', 'athens', null, null, :'ME', array[:'Q']::uuid[], '[]', null, now() + interval '2 hours') as running \gset
-- 4) Χωρίς χρονόμετρο → μένει
select public.create_outing('food', 'athens', null, null, :'ME', array[:'Q']::uuid[], '[]') as no_timer \gset

select test.ok((select respond_by is not null from public.my_outings() where id = :'expiring'), 'my_outings: προθεσμία');
select test.ok((select unanswered_count from public.my_outings() where id = :'expiring') = 2, 'my_outings: 2 δεν απάντησαν');
select test.ok((select respond_by is null from public.my_outings() where id = :'no_timer'), 'χωρίς χρονόμετρο: null');
reset role;

select test.login(:'P');
set role authenticated;
select public.set_rsvp(:'expiring', 'going');
select public.set_rsvp(:'answered', 'declined');
reset role;

-- Ο χρόνος «περνά»
update public.outings set respond_by = now() - interval '1 minute' where id in (:'expiring', :'answered');

-- Μόνο ο cron (postgres) την τρέχει
set role authenticated;
select test.throws($$select public.expire_unanswered_outings()$$, '42501', 'ο χρήστης δεν τρέχει την ακύρωση');
reset role;

select test.ok(public.expire_unanswered_outings() = 1, 'ακυρώθηκε ακριβώς μία έξοδος');
select test.ok((select status from public.outings where id = :'expiring') = 'cancelled', 'έληξε & δεν απάντησαν όλοι → ακυρώθηκε');
select test.ok((select status from public.outings where id = :'answered') = 'collecting', 'απάντησαν όλοι → μένει');
select test.ok((select status from public.outings where id = :'running') = 'collecting', 'δεν έληξε → μένει');
select test.ok((select status from public.outings where id = :'no_timer') = 'collecting', 'χωρίς χρονόμετρο → μένει');
select test.ok(exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
                       where c.outing_id = :'expiring' and m.meta->>'event' = 'outing_expired'), 'μήνυμα ακύρωσης στη συνομιλία');
select test.ok(public.expire_unanswered_outings() = 0, 'δεύτερη εκτέλεση: τίποτα');

-- Κείμενο push με προθεσμία
select test.ok(public._deadline_label(null) = '', 'χωρίς προθεσμία: κενό');
select test.ok(public._deadline_label(date_trunc('day', now() at time zone 'Europe/Athens') at time zone 'Europe/Athens' + interval '23 hours 30 minutes')
  = ' Απάντησε έως τις 23:30.', 'σήμερα: «έως τις 23:30»');

\echo 'Χρονόμετρο απάντησης ✅'
