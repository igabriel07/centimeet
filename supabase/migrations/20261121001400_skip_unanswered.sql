-- ⏭ «Προχώρα χωρίς όσους δεν απάντησαν»: ο διοργανωτής κλείνει τις εκκρεμείς προσκλήσεις.
-- Όσοι δεν είχαν απαντήσει γίνονται «Δεν απάντησε» (rsvp = declined + skipped_at) και δεν μπορούν πια να απαντήσουν.
alter table public.outing_participants add column if not exists skipped_at timestamptz;

create or replace function public.skip_unanswered(p_outing uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_org uuid;
  v_status public.outing_status;
  n int;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select organizer_id, status into v_org, v_status from public.outings where id = p_outing for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_org <> me then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_status not in ('collecting', 'suggesting') then
    raise exception 'outing closed' using errcode = '55000';
  end if;

  update public.outing_participants
     set rsvp = 'declined', skipped_at = now()
   where outing_id = p_outing and rsvp = 'invited';
  get diagnostics n = row_count;

  if n > 0 then
    perform public._outing_system_message(
      p_outing,
      'Ο διοργανωτής προχώρησε χωρίς όσους δεν απάντησαν.',
      jsonb_build_object('event', 'skipped_unanswered', 'count', n)
    );
  end if;
  return n;
end $$;
revoke all on function public.skip_unanswered from public, anon;
grant execute on function public.skip_unanswered to authenticated;

-- ---------- set_rsvp: όποιος παραλείφθηκε δεν απαντά πια ----------
create or replace function public.set_rsvp(p_outing uuid, p_status public.rsvp_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  v_part uuid;
  v_prev public.rsvp_status;
  v_skipped timestamptz;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_status = 'invited' then raise exception 'invalid status' using errcode = '22023'; end if;

  select id, rsvp, skipped_at into v_part, v_prev, v_skipped
  from public.outing_participants
  where outing_id = p_outing and user_id = me
  for update;
  if not found then raise exception 'not a participant' using errcode = '42501'; end if;
  if v_skipped is not null then raise exception 'skipped by organizer' using errcode = '55000'; end if;

  update public.outing_participants set rsvp = p_status where id = v_part;

  if p_status = 'declined' and v_prev <> 'declined' then
    delete from public.outing_origins where participant_id = v_part;
    update public.outing_participants set declared_at = null, mode = null where id = v_part;
    perform public._outing_system_message(
      p_outing,
      (select display_name from public.profiles where id = me) || ' δεν θα έρθει',
      jsonb_build_object('event', 'declined', 'user_id', me)
    );
  end if;
end $$;

-- ---------- declare_origin: ούτε δήλωση αφετηρίας μετά την παράλειψη ----------
create or replace function public.declare_origin(
  p_participant uuid,
  p_lat   double precision,
  p_lng   double precision,
  p_label text,
  p_mode  public.transport_mode
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r record;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select p.user_id, p.outing_id, p.declared_at, p.skipped_at, o.organizer_id, o.status
    into r
  from public.outing_participants p
  join public.outings o on o.id = p.outing_id
  where p.id = p_participant
  for update of p;

  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not ((r.user_id is not null and r.user_id = me) or (r.user_id is null and r.organizer_id = me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if r.status not in ('collecting', 'suggesting') then
    raise exception 'outing closed' using errcode = '55000';
  end if;
  if r.skipped_at is not null then
    raise exception 'skipped by organizer' using errcode = '55000';
  end if;

  perform public._set_origin(
    p_participant, r.outing_id,
    jsonb_build_object('lat', p_lat, 'lng', p_lng, 'label', p_label, 'mode', p_mode)
  );

  if r.user_id is not null then
    update public.outing_participants set rsvp = 'going' where id = p_participant;
    if r.declared_at is null then
      perform public._outing_system_message(
        r.outing_id,
        (select display_name from public.profiles where id = me) || ' δήλωσε αφετηρία ✓',
        jsonb_build_object('event', 'origin_declared', 'user_id', me)
      );
    end if;
  end if;
end $$;

-- ---------- get_outing_participants: + skipped ----------
drop function if exists public.get_outing_participants(uuid);

create function public.get_outing_participants(p_outing uuid)
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
  preference   public.place_preference,
  skipped      boolean
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  v_org uuid;
  v_hidden boolean;
begin
  if me is null or not public.is_outing_member(p_outing, me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select o.organizer_id, o.hide_participants into v_org, v_hidden from public.outings o where o.id = p_outing;

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
    p.preference,
    p.skipped_at is not null
  from public.outing_participants p
  left join public.profiles pr on pr.id = p.user_id
  left join public.outing_origins oo on oo.participant_id = p.id
  where p.outing_id = p_outing
    and (not v_hidden or v_org = me or p.user_id = me or p.user_id = v_org)
  order by p.created_at, p.id;
end $$;
revoke all on function public.get_outing_participants from public, anon;
grant execute on function public.get_outing_participants to authenticated;
