import {
  MyOutingRowsSchema,
  OutingParticipantRowsSchema,
  type Activity,
  type CityId,
  type OriginInput,
  type OutingStatus,
  type RsvpStatus,
  type SuggestionsResponse,
} from '@centimeet/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from './supabase';

/** Αποθηκευμένες έξοδοι: λεπτά wrappers γύρω από τα RPC του Supabase (βλ. migration outing_invites) */

export type OutingRow = {
  id: string;
  organizer_id: string;
  title: string | null;
  activity: Activity;
  city: CityId;
  meet_at: string | null;
  status: OutingStatus;
};

export const ACTIVITY_EMOJI: Record<Activity, string> = {
  coffee: '☕',
  food: '🍽️',
  drinks: '🍸',
  cinema: '🎬',
  dessert: '🍰',
  brunch: '🥞',
};

/** Τα σφάλματα του Supabase είναι απλά αντικείμενα με message, όχι πάντα Error */
export const errorMessage = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);

export const outingKeys = {
  mine: ['my-outings'] as const,
  outing: (id: string) => ['outing', id] as const,
  participants: (id: string) => ['outing-participants', id] as const,
  suggestions: (id: string) => ['outing-suggestions', id] as const,
};

export async function createOuting(input: {
  activity: Activity;
  city: CityId;
  meetAt?: string;
  me: OriginInput;
  invitees: string[];
  guests: (OriginInput & { name: string })[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_outing', {
    p_activity: input.activity,
    p_city: input.city,
    p_meet_at: input.meetAt ?? null,
    p_me: input.me,
    p_invitees: input.invitees,
    p_guests: input.guests,
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

export async function setRsvp(outingId: string, status: Exclude<RsvpStatus, 'invited'>) {
  const { error } = await supabase.rpc('set_rsvp', { p_outing: outingId, p_status: status });
  if (error) throw error;
}

export async function fetchOuting(id: string): Promise<OutingRow | null> {
  const { data, error } = await supabase
    .from('outings')
    .select('id, organizer_id, title, activity, city, meet_at, status')
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
