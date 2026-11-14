// Αποθηκευμένες έξοδοι: τύποι για τα RPC του Supabase και μετατροπή σε participants για το API.
import { z } from 'zod';
import { ACTIVITIES, CITIES, TRANSPORT_MODES, type Participant } from './types';

export const RSVP_STATUSES = ['invited', 'going', 'maybe', 'declined'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const OUTING_STATUSES = ['collecting', 'suggesting', 'voting', 'decided', 'cancelled', 'done'] as const;
export type OutingStatus = (typeof OUTING_STATUSES)[number];

/** Γραμμή από get_outing_participants(). lat/lng = null αν δεν σου επιτρέπεται να τα δεις. */
export const OutingParticipantRowSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  name: z.string(),
  mode: z.enum(TRANSPORT_MODES).nullable(),
  rsvp: z.enum(RSVP_STATUSES),
  declared: z.boolean(),
  is_organizer: z.boolean(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  origin_label: z.string().nullable(),
});
export type OutingParticipantRow = z.infer<typeof OutingParticipantRowSchema>;

/** Γραμμή από my_outings() */
export const MyOutingRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  activity: z.enum(ACTIVITIES),
  city: z.enum(CITIES),
  meet_at: z.string().nullable(),
  status: z.enum(OUTING_STATUSES),
  is_organizer: z.boolean(),
  my_participant_id: z.string(),
  my_rsvp: z.enum(RSVP_STATUSES),
  my_declared: z.boolean(),
  declared_count: z.number().int(),
  total_count: z.number().int(),
  created_at: z.string(),
});
export type MyOutingRow = z.infer<typeof MyOutingRowSchema>;

export const OutingParticipantRowsSchema = z.array(OutingParticipantRowSchema);
export const MyOutingRowsSchema = z.array(MyOutingRowSchema);

/** Αφετηρία όπως τη δέχονται τα create_outing (p_me / p_guests) */
export type OriginInput = { lat: number; lng: number; label?: string; mode: (typeof TRANSPORT_MODES)[number] };

/** Περιμένει δήλωση από αυτό το άτομο; (δεν έχει δηλώσει και δεν έχει αρνηθεί) */
export const isPending = (r: Pick<OutingParticipantRow, 'declared' | 'rsvp'>) => !r.declared && r.rsvp !== 'declined';

/**
 * Μετατρέπει τους συμμετέχοντες μιας αποθηκευμένης εξόδου σε participants για το /v1/suggestions.
 * Παίρνει μόνο όσους έχουν δηλώσει και δεν έχουν αρνηθεί, και των οποίων τα στοιχεία είναι ορατά
 * (ο διοργανωτής τα βλέπει όλα). Οι υπόλοιποι επιστρέφονται στο `pending`.
 */
export function outingToParticipants(rows: OutingParticipantRow[]): {
  participants: Participant[];
  pending: OutingParticipantRow[];
} {
  const participants: Participant[] = [];
  const pending: OutingParticipantRow[] = [];
  rows.forEach((r, i) => {
    if (r.rsvp === 'declined') return;
    if (r.declared && r.lat != null && r.lng != null && r.mode) {
      participants.push({
        id: r.id,
        name: (r.name.trim() || `Άτομο ${i + 1}`).slice(0, 60),
        origin: { lat: r.lat, lng: r.lng },
        mode: r.mode,
      });
    } else {
      pending.push(r);
    }
  });
  return { participants, pending };
}
