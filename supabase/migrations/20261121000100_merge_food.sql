-- Ενιαίο «Φαγητό»: τα «Γλυκό» (dessert) και «Brunch» γίνονται κατηγορίες του φαγητού.
-- Οι τιμές dessert/brunch μένουν στο enum (η Postgres δεν αφαιρεί τιμές enum χωρίς αναδημιουργία
-- του τύπου), αλλά δεν χρησιμοποιούνται πια: οι υπάρχουσες έξοδοι μεταφέρονται και νέες απαγορεύονται.

update public.outings set activity = 'food', category = 'brunch' where activity = 'brunch';
update public.outings set activity = 'food' where activity = 'dessert';

alter table public.outings
  add constraint outings_no_legacy_activity check (activity not in ('dessert', 'brunch'));

-- ---------- Κείμενο δραστηριότητας για ειδοποιήσεις ----------
create or replace function public._activity_label(a public.activity_kind)
returns text language sql immutable set search_path = '' as $$
  select case a
    when 'spot' then 'συνάντηση'
    when 'coffee' then 'καφέ' when 'food' then 'φαγητό' when 'drinks' then 'ποτό'
    when 'cinema' then 'σινεμά' when 'theater' then 'θέατρο'
    -- παλιές τιμές (δεν δημιουργούνται πια)
    when 'dessert' then 'φαγητό' when 'brunch' then 'φαγητό'
  end;
$$;
revoke all on function public._activity_label from public, anon, authenticated;
