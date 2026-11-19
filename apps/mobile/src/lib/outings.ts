import {
  CATEGORY_EMOJI,
  isValidCategory,
  MyOutingRowsSchema,
  OutingHistoryRowsSchema,
  OutingParticipantRowsSchema,
  type Activity,
  type ActivityCategory,
  type CityId,
  type OriginInput,
  type OutingStatus,
  type PlacePreference,
  type PlaceMode,
  dayKind,
  type FixedVenue,
  type RsvpStatus,
  type SuggestionsResponse,
  type ParticipantPlan,
  type Venue,
} from '@centimeet/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from './supabase';

/** «🍕 Πίτσα» αν υπάρχει κατηγορία, αλλιώς «🍽️ Φαγητό» */
export function activityTitle(t: (k: string) => string, activity: Activity, category?: string | null): string {
  if (category && isValidCategory(activity, category)) return `${CATEGORY_EMOJI[category as ActivityCategory]} ${t(`category.${category}`)}`;
  return `${ACTIVITY_EMOJI[activity]} ${t(`activity.${activity}`)}`;
}

/** Αποθηκευμένες έξοδοι: λεπτά wrappers γύρω από τα RPC του Supabase (βλ. migration outing_invites) */

export type OutingRow = {
  id: string;
  organizer_id: string;
  title: string | null;
  /** Περιγραφή από τον διοργανωτή */
  description?: string | null;
  /** ⏱ Διάρκεια σε λεπτά */
  duration_minutes?: number | null;
  /** ⏱ Ακριβής λήξη */
  ends_at?: string | null;
  activity: Activity;
  category: ActivityCategory | null;
  city: CityId;
  meet_at: string | null;
  /** «Σήμερα» χωρίς ώρα: μόνο μέρα (YYYY-MM-DD) */
  meet_day?: string | null;
  /** 🌙 «Απόψε» */
  meet_part?: 'evening' | null;
  status: OutingStatus;
  /** Προθεσμία απάντησης (χρονόμετρο) */
  respond_by?: string | null;
  /** fixed = ο διοργανωτής όρισε το μέρος (χωρίς αφετηρίες) */
  place_mode?: PlaceMode;
  chosen_venue?: FixedVenue | null;
  /** Κρυφή λίστα καλεσμένων */
  hide_participants?: boolean;
};

export const ACTIVITY_EMOJI: Record<Activity, string> = {
  spot: '📍',
  coffee: '☕',
  food: '🍽️',
  drinks: '🍸',
  cinema: '🎬',
  theater: '🎭',
};

/** Τα σφάλματα του Supabase είναι απλά αντικείμενα με message, όχι πάντα Error */
export const errorMessage = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);

export const outingKeys = {
  mine: ['my-outings'] as const,
  history: ['outing-history'] as const,
  saved: ['saved-outings'] as const,
  outing: (id: string) => ['outing', id] as const,
  participants: (id: string) => ['outing-participants', id] as const,
  suggestions: (id: string) => ['outing-suggestions', id] as const,
};

export async function createOuting(input: {
  activity: Activity;
  category?: ActivityCategory;
  city: CityId;
  meetAt?: string;
  /** «Σήμερα» χωρίς ώρα (YYYY-MM-DD) */
  meetDay?: string;
  /** 🌙 «Απόψε» (μαζί με meetDay) */
  meetPart?: 'evening';
  /** Προθεσμία απάντησης (ISO) — αλλιώς ακύρωση */
  respondBy?: string;
  /** «Διαλέγω εγώ το μέρος» — τότε χωρίς αφετηρίες */
  venue?: FixedVenue;
  /** Οι καλεσμένοι δεν βλέπουν ποιοι άλλοι καλέστηκαν */
  hideParticipants?: boolean;
  /** «Χωρίς μέρος»: απλώς συνάντηση — ούτε μαγαζί ούτε αφετηρίες */
  noPlace?: boolean;
  /** ✎ Τίτλος & περιγραφή (προαιρετικά) */
  title?: string;
  description?: string;
  /** ⏱ Διάρκεια (λεπτά) */
  durationMinutes?: number;
  /** ⏱ Ακριβής λήξη (ISO) */
  endsAt?: string;
  me?: OriginInput;
  invitees: string[];
  guests: (Partial<OriginInput> & { name: string })[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_outing', {
    p_activity: input.activity,
    p_city: input.city,
    p_meet_at: input.meetAt ?? null,
    p_me: input.me ?? null,
    p_invitees: input.invitees,
    p_guests: input.guests,
    // Μόνο όταν υπάρχει: έτσι η αποθήκευση «Όλα» δουλεύει και σε βάση χωρίς το migration outing_category
    ...(input.category ? { p_category: input.category } : {}),
    // Μόνο όταν υπάρχει χρονόμετρο (συμβατό με βάση χωρίς το migration respond_by)
    ...(input.respondBy ? { p_respond_by: input.respondBy } : {}),
    ...(input.venue ? { p_venue: input.venue } : {}),
    ...(input.hideParticipants ? { p_hide_participants: true } : {}),
    ...(input.noPlace ? { p_no_place: true } : {}),
    ...(input.meetDay ? { p_meet_day: input.meetDay } : {}),
    ...(input.meetPart ? { p_meet_part: input.meetPart } : {}),
    ...(input.title ? { p_title: input.title } : {}),
    ...(input.description ? { p_description: input.description } : {}),
    ...(input.durationMinutes ? { p_duration_minutes: input.durationMinutes } : {}),
    ...(input.endsAt ? { p_ends_at: input.endsAt } : {}),
  });
  if (error) throw error;
  return data as string;
}

export async function declareOrigin(participantId: string, origin: OriginInput) {
  const { error } = await supabase.rpc('declare_origin', {
    p_participant: participantId,
    p_lat: origin.lat,
    p_lng: origin.lng,
    p_label: origin.label ?? null,
    p_mode: origin.mode,
  });
  if (error) throw error;
}

/** «Πού θέλεις να πάμε;» για μια συμμετοχή (δική μου ή επισκέπτη μου) */
export async function setPlacePreference(participantId: string, preference: PlacePreference) {
  const { error } = await supabase.rpc('set_place_preference', { p_participant: participantId, p_preference: preference });
  if (error) throw error;
}

/** 📨 Ο διοργανωτής διαλέγει μαγαζί και το στέλνει στην παρέα μέσα στην εφαρμογή (+ διαδρομή ανά άτομο) */
export async function decideVenue(outingId: string, venue: Venue, plans: ParticipantPlan[]) {
  const { error } = await supabase.rpc('decide_venue', {
    p_outing: outingId,
    p_venue: { id: venue.id, name: venue.name, address: venue.address, location: venue.location, rating: venue.rating, ratingCount: venue.ratingCount },
    p_plans: plans.map((p) => ({
      participantId: p.participantId,
      mode: p.mode,
      durationMin: p.durationMin,
      estimated: p.estimated,
      distanceKm: p.distanceKm,
      costEur: p.costEur,
      navigationUrl: p.navigationUrl,
      steps: p.transitSteps?.slice(0, 15),
    })),
  });
  if (error) throw error;
}

/** ⏭ Ο διοργανωτής προχωρά χωρίς όσους δεν απάντησαν (επιστρέφει πόσοι παραλείφθηκαν) */
export async function skipUnanswered(outingId: string): Promise<number> {
  const { data, error } = await supabase.rpc('skip_unanswered', { p_outing: outingId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function setRsvp(outingId: string, status: Exclude<RsvpStatus, 'invited'>) {
  const { error } = await supabase.rpc('set_rsvp', { p_outing: outingId, p_status: status });
  if (error) throw error;
}

export async function fetchOuting(id: string): Promise<OutingRow | null> {
  const { data, error } = await supabase
    .from('outings')
    .select('id, organizer_id, title, description, duration_minutes, ends_at, activity, category, city, meet_at, meet_day, meet_part, status, respond_by, place_mode, chosen_venue, hide_participants')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as OutingRow | null;
}

export async function fetchParticipants(id: string) {
  const { data, error } = await supabase.rpc('get_outing_participants', { p_outing: id });
  if (error) throw error;
  return OutingParticipantRowsSchema.parse(data);
}

/** Όλες οι έξοδοι όπου συμμετείχα (και ολοκληρωμένες/ακυρωμένες) — για το «Ιστορικό» */
export async function fetchOutingHistory() {
  const { data, error } = await supabase.rpc('outing_history');
  if (error) throw error;
  return OutingHistoryRowsSchema.parse(data);
}

/** 🔖 Οι αποθηκευμένες μου έξοδοι (όλες οι καταστάσεις) */
export async function fetchSavedOutings() {
  const { data, error } = await supabase.rpc('my_saved_outings');
  if (error) throw error;
  return MyOutingRowsSchema.parse(data);
}

/** 🔖 Αποθήκευση / αφαίρεση εξόδου από τα «Αποθηκευμένα» */
export async function setOutingSaved(outingId: string, saved: boolean) {
  const { error } = saved
    ? await supabase.from('saved_outings').upsert({ outing_id: outingId }, { onConflict: 'user_id,outing_id', ignoreDuplicates: true })
    : await supabase.from('saved_outings').delete().eq('outing_id', outingId);
  if (error) throw error;
}

export async function fetchMyOutings() {
  const { data, error } = await supabase.rpc('my_outings');
  if (error) throw error;
  return MyOutingRowsSchema.parse(data);
}

export async function fetchLatestSuggestions(id: string): Promise<SuggestionsResponse | null> {
  const { data, error } = await supabase
    .from('venue_suggestions')
    .select('payload')
    .eq('outing_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.payload as SuggestionsResponse | undefined) ?? null;
}

/** Ο διοργανωτής αποθηκεύει τις προτάσεις· η έξοδος περνά από «συλλογή» σε «προτάσεις» */
export async function saveSuggestions(id: string, payload: SuggestionsResponse) {
  const { error } = await supabase.from('venue_suggestions').insert({ outing_id: id, payload });
  if (error) throw error;
  const { error: e2 } = await supabase.from('outings').update({ status: 'suggesting' }).eq('id', id).eq('status', 'collecting');
  if (e2) throw e2;
}

export async function outingConversationId(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('conversations').select('id').eq('outing_id', id).maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/** Ζωντανή ενημέρωση όταν κάποιος δηλώνει / αλλάζει RSVP (οι αφετηρίες ΔΕΝ περνούν από Realtime) */
export function useOutingRealtime(id: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`outing:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'outing_participants', filter: `outing_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: outingKeys.participants(id) });
        qc.invalidateQueries({ queryKey: outingKeys.mine });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);
}

/** «Κυρ 22 Νοε, 20:30» / «Σήμερα» / «Αύριο» / «Χωρίς ώρα» — ώρα ή μόνο μέρα συνάντησης */
export function meetText(
  t: (k: string) => string,
  when: (iso: string) => string,
  o: { meet_at?: string | null; meet_day?: string | null; meet_part?: string | null },
  locale?: string,
): string {
  if (o.meet_at) return when(o.meet_at);
  if (o.meet_day) {
    const kind = dayKind(o.meet_day, new Date());
    const evening = o.meet_part === 'evening';
    if (evening && kind === 'today') return t('wizard.tonight');
    if (evening && kind === 'tomorrow') return t('wizard.tomorrowEvening');
    if (kind === 'today') return t('wizard.today');
    if (kind === 'tomorrow') return t('wizard.tomorrow');
    return new Date(`${o.meet_day}T12:00:00`).toLocaleDateString(locale ?? 'el-GR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return t('respond.noTime');
}
