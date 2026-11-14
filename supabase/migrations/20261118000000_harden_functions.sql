-- =====================================================================
-- CentiMeet – σκλήρυνση συναρτήσεων (ευρήματα Supabase Security Advisor)
--
-- 1. Οι βοηθητικές συναρτήσεις are_friends / is_blocked / is_outing_member / is_conversation_member
--    ήταν εκτελέσιμες από ΟΠΟΙΟΝΔΗΠΟΤΕ μέσω /rest/v1/rpc → μπορούσε κανείς να μάθει αν δύο ΑΛΛΟΙ
--    χρήστες είναι φίλοι ή έχουν αποκλείσει ο ένας τον άλλον. Τώρα απαντούν μόνο όταν ο χρήστης
--    που ρωτά είναι ένα από τα εμπλεκόμενα μέρη (ό,τι χρειάζονται οι πολιτικές RLS και τα RPC).
--    Χωρίς χρήστη (backend/triggers, auth.uid() = null) απαντούν κανονικά.
-- 2. Ο anon δεν εκτελεί καμία συνάρτηση της εφαρμογής· οι συναρτήσεις triggers δεν καλούνται ως RPC.
-- 3. pg_net στο schema extensions (όχι στο public).
-- =====================================================================

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid() in (a, b))
     and exists (
       select 1 from public.friendships
       where status = 'accepted'
         and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
     );
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid() in (a, b))
     and exists (
       select 1 from public.blocks
       where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
     );
$$;

create or replace function public.is_outing_member(o uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid() = u)
     and (
       exists (select 1 from public.outings where id = o and organizer_id = u)
       or exists (select 1 from public.outing_participants where outing_id = o and user_id = u)
     );
$$;

create or replace function public.is_conversation_member(c uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid() = u)
     and exists (select 1 from public.conversation_members where conversation_id = c and user_id = u);
$$;

-- Βοηθητικές: μόνο συνδεδεμένοι (τις χρειάζονται οι πολιτικές RLS) και backend
revoke all on function public.are_friends(uuid, uuid) from public, anon;
revoke all on function public.is_blocked(uuid, uuid) from public, anon;
revoke all on function public.is_outing_member(uuid, uuid) from public, anon;
revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_blocked(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_outing_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated, service_role;

revoke all on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Συναρτήσεις triggers: ποτέ ως RPC (οι triggers εκτελούνται κανονικά)
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_outing() from public, anon, authenticated;
revoke all on function public.handle_new_participant() from public, anon, authenticated;

-- pg_net στο schema extensions (οι συναρτήσεις του μένουν στο schema net)
do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
