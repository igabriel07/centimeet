-- Tests: δημιουργία προφίλ για κάθε τρόπο εγγραφής (email+κωδικός, κωδικός στο email, Google)
\set ON_ERROR_STOP 1
\set QUIET 1

\set A '00000000-0000-0000-0000-0000000000a1'
\set B '00000000-0000-0000-0000-0000000000a2'
\set C '00000000-0000-0000-0000-0000000000a3'
\set D '00000000-0000-0000-0000-0000000000a4'
\set E '00000000-0000-0000-0000-0000000000a5'
\set F '00000000-0000-0000-0000-0000000000a6'

-- Εγγραφή με email + κωδικό: η εφαρμογή στέλνει full_name
insert into auth.users (id, email, raw_user_meta_data) values (:'A', 'maria.p@example.com', '{"full_name":"  Μαρία   Παπαδοπούλου "}');
select test.ok((select display_name from public.profiles where id = :'A') = 'Μαρία Παπαδοπούλου', 'email+κωδικός: όνομα από full_name, χωρίς περιττά κενά');
select test.ok((select username from public.profiles where id = :'A') ~ '^maria\.p_[0-9a-f]{6}$', 'username από το email');

-- Κωδικός στο email χωρίς όνομα: όνομα από το email
insert into auth.users (id, email) values (:'B', 'nikos@example.com');
select test.ok((select display_name from public.profiles where id = :'B') = 'nikos', 'χωρίς όνομα → από το email');

-- Google: name + picture
insert into auth.users (id, email, raw_user_meta_data) values
  (:'C', 'Eleni.K@gmail.com', '{"name":"Ελένη Κ.","full_name":"Ελένη Κ.","avatar_url":"https://lh3.googleusercontent.com/a/abc","picture":"https://lh3.googleusercontent.com/a/abc"}');
select test.ok((select display_name from public.profiles where id = :'C') = 'Ελένη Κ.', 'Google: όνομα');
select test.ok((select avatar_url from public.profiles where id = :'C') = 'https://lh3.googleusercontent.com/a/abc', 'Google: φωτογραφία');
select test.ok((select username from public.profiles where id = :'C') ~ '^eleni\.k_', 'κεφαλαία του email γίνονται πεζά (δεν χάνονται)');

-- Πολύ μεγάλο όνομα: δεν πρέπει να ρίξει την εγγραφή
insert into auth.users (id, email, raw_user_meta_data) values (:'D', 'long@example.com', jsonb_build_object('name', repeat('Α', 120)));
select test.ok((select char_length(display_name) from public.profiles where id = :'D') = 60, 'μεγάλο όνομα κόβεται στους 60 (η εγγραφή δεν αποτυγχάνει)');

-- Κενό όνομα / μη ασφαλής φωτογραφία
insert into auth.users (id, email, raw_user_meta_data) values (:'E', 'x@example.com', '{"full_name":"   ","avatar_url":"http://evil.example/p.png"}');
select test.ok((select display_name from public.profiles where id = :'E') = 'user', 'κενό όνομα + σύντομο email → «user»');
select test.ok((select avatar_url from public.profiles where id = :'E') is null, 'φωτογραφία χωρίς https απορρίπτεται');
select test.ok((select username from public.profiles where id = :'E') ~ '^user_[0-9a-f]{6}$', 'σύντομο email → username user_…');

-- Το username είναι πάντα έγκυρο, ακόμη και με περίεργο email
insert into auth.users (id, email) values (:'F', 'ΑΛΦΑ+βήτα!!@example.com');
select test.ok((select username from public.profiles where id = :'F') ~ '^[a-z0-9_.]{3,24}$', 'username έγκυρο για μη λατινικό email');

-- Σύγκρουση username: δύο σύντομα email με ίδιο suffix (τα test UUIDs ξεκινούν όλα από 000000)
\set G '00000000-0000-0000-0000-0000000000a7'
insert into auth.users (id, email) values (:'G', 'y@example.com');
select test.ok((select username from public.profiles where id = :'G') ~ '^user_[0-9a-f]{6}$', 'ίδιο username → νέο suffix, η εγγραφή δεν αποτυγχάνει');
select test.ok((select username from public.profiles where id = :'G') <> (select username from public.profiles where id = :'E'), 'τα usernames διαφέρουν');

-- Δεν καλείται ως RPC
select test.login(:'A');
set role authenticated;
select test.throws($$select public.handle_new_user()$$, '42501', 'handle_new_user δεν καλείται από χρήστες');
reset role;
\echo 'Εγγραφή & δημιουργία προφίλ ✅'
