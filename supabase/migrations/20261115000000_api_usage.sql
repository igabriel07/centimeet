-- =====================================================================
-- CentiMeet – μετρητές χρήσης (φρένο κόστους Google + όριο αναζητήσεων ανά χρήστη)
--
-- Τους γράφει ΜΟΝΟ το backend με το service role key. Οι χρήστες της εφαρμογής
-- δεν έχουν καμία πρόσβαση (RLS χωρίς πολιτικές + revoke).
-- =====================================================================

create table public.api_usage (
  period     text not null,          -- '2026-11' (μήνας) ή '2026-11-15' (ημέρα)
  key        text not null,          -- 'google:places_search', 'searches:<user id>' …
  count      bigint not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (period, key)
);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;

-- Ατομικά: αυξάνει κατά p_n μόνο αν δεν ξεπερνά το p_limit. Επιστρέφει αν επιτράπηκε.
create or replace function public.consume_api_usage(p_period text, p_key text, p_n int, p_limit bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_new bigint;
begin
  if p_n < 0 then raise exception 'negative usage' using errcode = '22023'; end if;
  insert into public.api_usage (period, key, count) values (p_period, p_key, 0)
  on conflict (period, key) do nothing;

  update public.api_usage
     set count = count + p_n, updated_at = now()
   where period = p_period and key = p_key and count + p_n <= p_limit
  returning count into v_new;

  return v_new is not null;
end $$;

create or replace function public.get_api_usage(p_period text, p_key text)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce((select count from public.api_usage where period = p_period and key = p_key), 0);
$$;

revoke all on function public.consume_api_usage from public, anon, authenticated;
revoke all on function public.get_api_usage from public, anon, authenticated;
grant execute on function public.consume_api_usage to service_role;
grant execute on function public.get_api_usage to service_role;
