-- =====================================================================
-- CentiMeet – push ειδοποιήσεις & διαγραφή λογαριασμού
--
-- Push: τις στέλνει η ίδια η βάση (triggers → pg_net → Expo Push API, δωρεάν), χωρίς δικό μας server.
--   • πρόσκληση σε έξοδο → ο καλεσμένος
--   • δήλωση/άρνηση → μόνο ο διοργανωτής («Όλοι δήλωσαν!» όταν δεν μένει κανείς)
--   • προτάσεις μαγαζιών → όλα τα μέλη εκτός του διοργανωτή
--   • μήνυμα συνομιλίας → τα υπόλοιπα μέλη (όχι όσοι έχουν σίγαση)
-- Διαγραφή λογαριασμού: απαιτείται από App Store & Google Play.
-- =====================================================================

-- pg_net υπάρχει στο Supabase· τοπικά (tests) μπορεί να λείπει → οι ειδοποιήσεις απλώς δεν στέλνονται
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net δεν είναι διαθέσιμο — οι push ειδοποιήσεις απενεργοποιημένες';
end $$;

-- ---------- Καταχώρηση συσκευής ----------
-- Μια συσκευή μπορεί να αλλάξει λογαριασμό: το token μεταφέρεται στον τρέχοντα χρήστη.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

-- ---------- Αποστολή ----------
create or replace function public._activity_label(a public.activity_kind)
returns text language sql immutable set search_path = '' as $$
  select case a
    when 'coffee' then 'καφέ' when 'food' then 'φαγητό' when 'drinks' then 'ποτό'
    when 'cinema' then 'σινεμά' when 'dessert' then 'γλυκό' when 'brunch' then 'brunch'
  end;
$$;

create or replace function public._send_push(p_user_ids uuid[], p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', p_title, 'body', left(p_body, 180),
           'data', p_data, 'sound', 'default', 'channelId', 'default'))
    into msgs
  from public.push_tokens t
  where t.user_id = any(p_user_ids);
  if msgs is null then return; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return; end if;

  -- Ασύγχρονα (pg_net): δεν καθυστερεί τη συναλλαγή του χρήστη
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := msgs,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
end $$;

-- Πρόσκληση σε έξοδο
create or replace function public._push_on_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o record;
begin
  select ou.id, ou.activity, ou.organizer_id, pr.display_name as organizer
    into o
  from public.outings ou join public.profiles pr on pr.id = ou.organizer_id
  where ou.id = new.outing_id;
  if new.user_id is null or new.user_id = o.organizer_id then return new; end if;
  perform public._send_push(
    array[new.user_id],
    'Νέα έξοδος 📍',
    format('%s σε κάλεσε για %s. Δήλωσε από πού ξεκινάς!', o.organizer, public._activity_label(o.activity)),
    jsonb_build_object('url', '/outing/' || o.id)
  );
  return new;
end $$;
create trigger push_on_invite after insert on public.outing_participants
  for each row execute function public._push_on_invite();

-- Νέες προτάσεις μαγαζιών
create or replace function public._push_on_suggestions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o record;
  recipients uuid[];
begin
  select id, activity, organizer_id into o from public.outings where id = new.outing_id;
  select array_agg(p.user_id) into recipients
  from public.outing_participants p
  where p.outing_id = o.id and p.user_id is not null and p.user_id <> o.organizer_id and p.rsvp <> 'declined';
  if recipients is null then return new; end if;
  perform public._send_push(
    recipients,
    'Ήρθαν προτάσεις! ☕',
    format('Δες πού θα πάτε για %s.', public._activity_label(o.activity)),
    jsonb_build_object('url', '/outing/' || o.id)
  );
  return new;
end $$;
create trigger push_on_suggestions after insert on public.venue_suggestions
  for each row execute function public._push_on_suggestions();

-- Μηνύματα (κείμενο και μηνύματα συστήματος)
create or replace function public._push_on_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  conv record;
  o record;
  ev text := new.meta->>'event';
  recipients uuid[];
  title text;
  body text := new.body;
  pending int;
begin
  select id, kind, outing_id into conv from public.conversations where id = new.conversation_id;

  if new.kind = 'system' then
    -- Για αυτά υπάρχει ήδη ειδική ειδοποίηση (πρόσκληση) ή δεν χρειάζεται
    if ev is null or ev in ('outing_created', 'invited') then return new; end if;
    if conv.outing_id is null then return new; end if;
    select id, activity, organizer_id into o from public.outings where id = conv.outing_id;
    if ev in ('origin_declared', 'declined') then
      -- Μόνο ο διοργανωτής ενδιαφέρεται για την πρόοδο των δηλώσεων
      recipients := array[o.organizer_id];
      if ev = 'origin_declared' then
        select count(*) into pending from public.outing_participants
        where outing_id = o.id and rsvp <> 'declined' and declared_at is null;
        if pending = 0 then body := 'Όλοι δήλωσαν! Βρες το δίκαιο σημείο 🎯'; end if;
      end if;
    else
      select array_agg(m.user_id) into recipients
      from public.conversation_members m
      where m.conversation_id = conv.id and not m.muted;
    end if;
    -- Όχι σε αυτόν που έκανε την ενέργεια
    recipients := array_remove(recipients, nullif(new.meta->>'user_id', '')::uuid);
    title := 'Έξοδος για ' || public._activity_label(o.activity);
  else
    select array_agg(m.user_id) into recipients
    from public.conversation_members m
    where m.conversation_id = conv.id and m.user_id <> new.sender_id and not m.muted;
    select display_name into title from public.profiles where id = new.sender_id;
  end if;

  if recipients is null or cardinality(recipients) = 0 then return new; end if;
  perform public._send_push(
    recipients,
    coalesce(title, 'CentiMeet'),
    body,
    jsonb_build_object('url', case when conv.outing_id is not null then '/outing/' || conv.outing_id else '/chat/' || conv.id end)
  );
  return new;
end $$;
create trigger push_on_message after insert on public.messages
  for each row execute function public._push_on_message();

-- ---------- Διαγραφή λογαριασμού ----------
-- Διαγράφει τα μηνύματα του χρήστη και τον ίδιο από το auth.users· όλα τα υπόλοιπα (προφίλ, φίλοι,
-- έξοδοι που οργάνωσε, συμμετοχές, αφετηρίες, tokens) σβήνουν με ON DELETE CASCADE.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.messages where sender_id = me;
  delete from auth.users where id = me;
end $$;

revoke all on function public.register_push_token from public, anon;
revoke all on function public.delete_my_account from public, anon;
grant execute on function public.register_push_token to authenticated;
grant execute on function public.delete_my_account to authenticated;
revoke all on function public._activity_label from public, anon, authenticated;
revoke all on function public._send_push from public, anon, authenticated;
revoke all on function public._push_on_invite from public, anon, authenticated;
revoke all on function public._push_on_suggestions from public, anon, authenticated;
revoke all on function public._push_on_message from public, anon, authenticated;
