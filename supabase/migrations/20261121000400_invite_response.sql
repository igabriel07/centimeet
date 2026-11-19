-- Απάντηση σε πρόσκληση: «Πού θέλεις να πάμε;» + πιο κατατοπιστική ειδοποίηση πρόσκλησης.
--
-- Προτίμηση ανά συμμετέχοντα (τη χρησιμοποιεί ο αλγόριθμος):
--   fair     → κάπου στη μέση (προεπιλογή)
--   anywhere → δεν με νοιάζει πού (ο χρόνος μου μετρά λιγότερο)
--   near     → κάπου κοντά μου (ο χρόνος μου μετρά περισσότερο)

create type public.place_preference as enum ('fair', 'anywhere', 'near');

alter table public.outing_participants
  add column if not exists preference public.place_preference not null default 'fair';

-- ---------- Ορισμός προτίμησης (ίδια δικαιώματα με το declare_origin) ----------
create or replace function public.set_place_preference(p_participant uuid, p_preference public.place_preference)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r record;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select p.user_id, o.organizer_id, o.status into r
  from public.outing_participants p join public.outings o on o.id = p.outing_id
  where p.id = p_participant;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not ((r.user_id is not null and r.user_id = me) or (r.user_id is null and r.organizer_id = me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status not in ('collecting', 'suggesting') then
    raise exception 'outing closed' using errcode = '55000';
  end if;
  update public.outing_participants set preference = p_preference where id = p_participant;
end $$;

revoke all on function public.set_place_preference from public, anon;
grant execute on function public.set_place_preference to authenticated;

-- ---------- get_outing_participants: + preference (αλλάζει ο τύπος επιστροφής → drop) ----------
drop function if exists public.get_outing_participants(uuid);

create or replace function public.get_outing_participants(p_outing uuid)
returns table (
  id           uuid,
  user_id      uuid,
  name         text,
  mode         public.transport_mode,
  rsvp         public.rsvp_status,
  declared     boolean,
  is_organizer boolean,
  lat          double precision,
  lng          double precision,
  origin_label text,
  preference   public.place_preference
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  v_org uuid;
begin
  if me is null or not public.is_outing_member(p_outing, me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.organizer_id into v_org from public.outings o where o.id = p_outing;

  return query
  select
    p.id,
    p.user_id,
    coalesce(pr.display_name, p.guest_name, '?'),
    p.mode,
    p.rsvp,
    p.declared_at is not null,
    coalesce(p.user_id = v_org, false),
    case when v_org = me or p.user_id = me then extensions.st_y(oo.origin::extensions.geometry) end,
    case when v_org = me or p.user_id = me then extensions.st_x(oo.origin::extensions.geometry) end,
    case when v_org = me or p.user_id = me then oo.label end,
    p.preference
  from public.outing_participants p
  left join public.profiles pr on pr.id = p.user_id
  left join public.outing_origins oo on oo.participant_id = p.id
  where p.outing_id = p_outing
  order by p.created_at, p.id;
end $$;

revoke all on function public.get_outing_participants from public, anon;
grant execute on function public.get_outing_participants to authenticated;

-- ---------- Ειδοποίηση πρόσκλησης: «Χ σε προσκαλεί για καφέ στις 20:30» ----------
-- Ώρα Ελλάδας· η μέρα μπαίνει μόνο αν ΔΕΝ είναι σήμερα («την Κυρ 22/11 στις 20:30»).
create or replace function public._when_label(p_at timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_at is null then ''
    when (p_at at time zone 'Europe/Athens')::date = (now() at time zone 'Europe/Athens')::date
      then ' στις ' || to_char(p_at at time zone 'Europe/Athens', 'HH24:MI')
    else ' την '
      || (array['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'])[extract(isodow from p_at at time zone 'Europe/Athens')::int]
      || ' ' || to_char(p_at at time zone 'Europe/Athens', 'FMDD/FMMM')
      || ' στις ' || to_char(p_at at time zone 'Europe/Athens', 'HH24:MI')
  end;
$$;
revoke all on function public._when_label from public, anon, authenticated;

create or replace function public._push_on_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o record;
begin
  select ou.id, ou.activity, ou.meet_at, ou.organizer_id, pr.display_name as organizer
    into o
  from public.outings ou join public.profiles pr on pr.id = ou.organizer_id
  where ou.id = new.outing_id;
  if new.user_id is null or new.user_id = o.organizer_id then return new; end if;
  perform public._send_push(
    array[new.user_id],
    'Πρόσκληση 📍',
    format('%s σε προσκαλεί για %s%s. Θα έρθεις;', o.organizer, public._activity_label(o.activity), public._when_label(o.meet_at)),
    jsonb_build_object('url', '/outing/' || o.id)
  );
  return new;
end $$;
