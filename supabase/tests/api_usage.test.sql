-- Tests για τους μετρητές χρήσης (φρένο κόστους)
\set ON_ERROR_STOP 1
\set QUIET 1

set role service_role;
select test.ok(public.consume_api_usage('2026-11', 'google:places_search', 1, 2), 'πρώτη κλήση επιτρέπεται');
select test.ok(public.consume_api_usage('2026-11', 'google:places_search', 1, 2), 'δεύτερη κλήση επιτρέπεται (όριο 2)');
select test.ok(not public.consume_api_usage('2026-11', 'google:places_search', 1, 2), 'τρίτη κλήση απορρίπτεται');
select test.ok(public.get_api_usage('2026-11', 'google:places_search') = 2, 'ο μετρητής μένει στο όριο');
select test.ok(not public.consume_api_usage('2026-11', 'google:matrix_pro', 30, 20), 'μεγάλη κλήση που δεν χωράει απορρίπτεται ολόκληρη');
select test.ok(public.get_api_usage('2026-11', 'google:matrix_pro') = 0, '…χωρίς να μετρηθεί τίποτα');
select test.ok(public.consume_api_usage('2026-12', 'google:places_search', 1, 2), 'νέος μήνας = νέος μετρητής');
reset role;

set role authenticated;
select test.throws($$select public.consume_api_usage('2026-11', 'x', 1, 100)$$, '42501', 'ο χρήστης της εφαρμογής δεν αυξάνει μετρητές');
select test.throws($$select * from public.api_usage$$, '42501', 'ο χρήστης της εφαρμογής δεν διαβάζει μετρητές');
reset role;
set role anon;
select test.throws($$select public.get_api_usage('2026-11', 'x')$$, '42501', 'ο anon δεν διαβάζει μετρητές');
reset role;

\echo 'Μετρητές χρήσης ✅'
