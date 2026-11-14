-- Βοηθητικά για τα SQL tests (τρέχει μετά τα migrations, πριν τα *.test.sql)
\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------- Βοηθητικά ----------
create schema test;
grant usage on schema test to anon, authenticated, service_role;

create function test.login(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
$$;

create function test.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;

-- Εκτελεί SQL και περιμένει σφάλμα με τον δοσμένο κωδικό
create function test.throws(sql text, code text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % (δεν πέταξε σφάλμα)', msg;
exception
  when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlstate <> code then
      raise exception 'FAIL: % (αναμενόταν %, ήρθε % «%»)', msg, code, sqlstate, sqlerrm;
    end if;
    raise notice 'ok - %', msg;
end $$;

grant execute on all functions in schema test to anon, authenticated, service_role;


-- Ψεύτικο pg_net: καταγράφει τις push αντί να τις στέλνει (στο Supabase υπάρχει το πραγματικό)
create schema if not exists net;
create table test.push_log (id bigserial primary key, url text, body jsonb, at timestamptz default now());
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into test.push_log (url, body) values (url, body) returning id;
$$;

/** Push που στάλθηκαν σε αυτό το token (από όλες τις κλήσεις) */
create function test.pushes_to(p_token text) returns setof jsonb language sql as $$
  select m from test.push_log l, jsonb_array_elements(l.body) m where m->>'to' = p_token order by l.id;
$$;
grant execute on all functions in schema test to anon, authenticated, service_role;
