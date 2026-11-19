-- Ιστορικό: όλες οι έξοδοι όπου συμμετείχε ο χρήστης — και οι ολοκληρωμένες/ακυρωμένες,
-- που το my_outings() κρύβει. Όχι όσες αρνήθηκε. Το φίλτρο ανά δραστηριότητα γίνεται στην εφαρμογή.
create or replace function public.outing_history()
returns table (
  id           uuid,
  title        text,
  activity     public.activity_kind,
  category     text,
  city         public.city_id,
  meet_at      timestamptz,
  status       public.outing_status,
  venue_name   text,
  is_organizer boolean,
  created_at   timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    o.id, o.title, o.activity, o.category, o.city, o.meet_at, o.status,
    nullif(o.chosen_venue->>'name', ''),
    o.organizer_id = auth.uid(),
    o.created_at
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  where mp.rsvp <> 'declined'
  order by coalesce(o.meet_at, o.created_at) desc
  limit 200;
$$;

revoke all on function public.outing_history from public, anon;
grant execute on function public.outing_history to authenticated;
