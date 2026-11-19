-- Πιο ανθεκτική δημιουργία προφίλ στην εγγραφή (email + κωδικός, κωδικός στο email, Google).
--  - Όνομα: trim, κενό → από το email, κόψιμο στους 60 χαρακτήρες (αλλιώς το check του profiles
--    έριχνε ΟΛΗ την εγγραφή με «Database error saving new user» — π.χ. μεγάλο όνομα από Google).
--  - Username: πεζά ΠΡΙΝ το φιλτράρισμα (πριν χάνονταν τα κεφαλαία του email).
--  - Φωτογραφία από Google (avatar_url / picture), μόνο https.
--  - Αν το username υπάρχει ήδη (ίδιο πρόθεμα + suffix), δοκιμάζει άλλο suffix αντί να αποτύχει η εγγραφή.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base text := regexp_replace(lower(coalesce(nullif(split_part(new.email, '@', 1), ''), 'user')), '[^a-z0-9_.]', '', 'g');
  name text := btrim(regexp_replace(coalesce(nullif(btrim(meta->>'full_name'), ''), nullif(btrim(meta->>'name'), ''), ''), '\s+', ' ', 'g'));
  avatar text := coalesce(meta->>'avatar_url', meta->>'picture');
  attempt int;
begin
  if char_length(base) < 3 then base := 'user'; end if;
  if name = '' then name := left(base, 60); end if;
  if avatar is not null and (avatar !~ '^https://' or char_length(avatar) > 1000) then avatar := null; end if;

  for attempt in 0..9 loop
    begin
      insert into public.profiles (id, username, display_name, avatar_url)
      values (
        new.id,
        left(base, 16) || '_' || case
          when attempt = 0 then substr(replace(new.id::text, '-', ''), 1, 6)
          else substr(md5(new.id::text || attempt::text || clock_timestamp()::text), 1, 6)
        end,
        left(name, 60),
        avatar
      );
      return new;
    exception when unique_violation then
      -- Αν η σύγκρουση είναι στο id (διπλό insert), δεν βοηθά η επανάληψη
      if exists (select 1 from public.profiles where id = new.id) then raise; end if;
    end;
  end loop;
  raise exception 'could not allocate a unique username' using errcode = 'unique_violation';
end $$;

-- Παραμένει μόνο για το trigger (όχι RPC)
revoke all on function public.handle_new_user() from public, anon, authenticated;
