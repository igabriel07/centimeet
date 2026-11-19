-- Αρχική οθόνη: «Προσκλήσεις» — το my_outings επιστρέφει και το όνομα του διοργανωτή
-- (για «Η Μαρία σε προσκαλεί»). Αλλάζει ο τύπος επιστροφής → drop & create.
drop function if exists public.my_outings();

create function public.my_outings()
returns table (
  id                uuid,
  title             text,
  activity          public.activity_kind,
  category          text,
  city              public.city_id,
  meet_at           timestamptz,
  status            public.outing_status,
  is_organizer      boolean,
  organizer_name    text,
  my_participant_id uuid,
  my_rsvp           public.rsvp_status,
  my_declared       boolean,
  declared_count    int,
  total_count       int,
  created_at        timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    o.id, o.title, o.activity, o.category, o.city, o.meet_at, o.status,
    o.organizer_id = auth.uid(),
    coalesce(pr.display_name, '?'),
    mp.id, mp.rsvp, mp.declared_at is not null,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined' and x.declared_at is not null)::int,
    (select count(*) from public.outing_participants x
      where x.outing_id = o.id and x.rsvp <> 'declined')::int,
    o.created_at
  from public.outings o
  join public.outing_participants mp on mp.outing_id = o.id and mp.user_id = auth.uid()
  left join public.profiles pr on pr.id = o.organizer_id
  where o.status not in ('cancelled', 'done')
  order by o.created_at desc
  limit 50;
$$;

revoke all on function public.my_outings from public, anon;
grant execute on function public.my_outings to authenticated;
