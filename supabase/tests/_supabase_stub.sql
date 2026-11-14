-- Ελάχιστο «Supabase» πάνω σε σκέτη PostgreSQL + PostGIS, ώστε τα migrations
-- και οι πολιτικές RLS να δοκιμάζονται τοπικά χωρίς Supabase CLI.
-- auth.uid() διαβάζει το request.jwt.claim.sub (όπως παλιότερα το PostgREST).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema extensions;
create extension pgcrypto with schema extensions;

create table auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb not null default '{}'
);

create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema public, auth, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Όπως στο Supabase: οι ρόλοι του API έχουν πλήρη δικαιώματα στους νέους πίνακες
-- του public και το RLS κάνει τον έλεγχο.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

set client_min_messages = error;  -- χωρίς το warning για wal_level
create publication supabase_realtime;
reset client_min_messages;
