-- =====================================================================
-- CentiMeet – ρητά δικαιώματα πινάκων για το Data API (supabase-js)
--
-- Από 30/5/2026 (νέα projects) και 30/10/2026 (όλα) το Supabase ΔΕΝ δίνει πια αυτόματα
-- select/insert/update/delete στους νέους πίνακες του public. Χωρίς αυτό το migration η εφαρμογή
-- δεν βλέπει φίλους, μηνύματα κ.λπ. Βλ. https://supabase.com/changelog/45329
--
-- Αρχή: ελάχιστα δικαιώματα. Το RLS παραμένει ο έλεγχος ανά γραμμή· τα grants ορίζουν ΤΙ
-- επιτρέπεται να επιχειρήσει ο ρόλος. Ό,τι γίνεται μόνο μέσω RPC (security definer) δεν
-- χρειάζεται grant πίνακα (π.χ. outing_origins, api_usage, insert/update συμμετεχόντων).
-- Ιδεμποτές: σε παλιό project με τα παλιά προεπιλεγμένα δικαιώματα απλώς τα «στενεύει».
-- =====================================================================

-- Η εφαρμογή απαιτεί σύνδεση: ο anon δεν χρειάζεται καμία πρόσβαση σε πίνακες
revoke all on all tables in schema public from anon;
-- Ξεκινάμε από καθαρή κατάσταση και για τον authenticated (σε παλιά projects είχε «όλα»)
revoke all on all tables in schema public from authenticated;

-- ---------- authenticated (χρήστες της εφαρμογής) ----------
grant select, update                 on public.profiles             to authenticated;
grant select, insert, update, delete on public.saved_locations      to authenticated;
grant select, insert, update, delete on public.friendships          to authenticated;
grant select, insert, delete         on public.blocks               to authenticated;
grant insert                         on public.reports              to authenticated;
grant select, insert, update, delete on public.outings              to authenticated;
-- Συμμετέχοντες: εισαγωγή/αλλαγή μόνο μέσω RPC (create_outing, declare_origin, set_rsvp…)
grant select, delete                 on public.outing_participants  to authenticated;
grant select, insert                 on public.venue_suggestions    to authenticated;
grant select, insert, update, delete on public.votes                to authenticated;
grant select                         on public.conversations        to authenticated;
grant select, update                 on public.conversation_members to authenticated;
grant select, insert                 on public.messages             to authenticated;
grant select, insert, update, delete on public.push_tokens          to authenticated;
-- outing_origins, api_usage: καμία απευθείας πρόσβαση (μόνο μέσω RPC)

-- Ακόμη και με grant update, οι χρήστες δεν αλλάζουν το id/ημερομηνία του προφίλ τους
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, default_mode, default_city, locale) on public.profiles to authenticated;

-- ---------- service_role (backend) ----------
grant select, insert, update, delete on all tables in schema public to service_role;
