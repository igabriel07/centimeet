// Αποθηκευμένες έξοδοι: τύποι για τα RPC του Supabase και μετατροπή σε participants για το API.
import { z } from 'zod';
import { ACTIVITIES, CITIES, PLACE_PREFERENCES, TRANSPORT_MODES, type Participant } from './types';
import { localDayKey } from './when';

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
  /** «Πού θέλεις να πάμε;» (λείπει σε βάση χωρίς το migration invite_response) */
  preference: z.enum(PLACE_PREFERENCES).optional(),
  /** «Δεν απάντησε»: ο διοργανωτής προχώρησε χωρίς αυτόν */
  skipped: z.boolean().optional(),
  /** Η διαδρομή μου προς το μαγαζί που αποφασίστηκε (μόνο η δική μου — ή όλων για τον διοργανωτή) */
  plan: z
    .object({
      mode: z.string().optional(),
      durationMin: z.number().optional(),
      /** Εκτίμηση (π.χ. συγκοινωνίες χωρίς Google) → «~» */
      estimated: z.boolean().optional(),
      distanceKm: z.number().optional(),
      costEur: z.number().optional(),
      navigationUrl: z.string().optional(),
      /** Βήματα συγκοινωνίας (γραμμή, στάση–στάση) */
      steps: z
        .array(
          z.object({
            kind: z.enum(['walk', 'bus', 'metro', 'tram', 'train', 'trolley', 'other']),
            line: z.string().optional(),
            from: z.string().optional(),
            to: z.string().optional(),
            durationMin: z.number().optional(),
          }),
        )
        .optional(),
    })
    .nullable()
    .optional(),
});
export type OutingParticipantRow = z.infer<typeof OutingParticipantRowSchema>;

/** Γραμμή από my_outings() */
export const MyOutingRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  activity: z.enum(ACTIVITIES),
  category: z.string().nullable().optional(),
  city: z.enum(CITIES),
  meet_at: z.string().nullable(),
  status: z.enum(OUTING_STATUSES),
  is_organizer: z.boolean(),
  /** Όνομα διοργανωτή (λείπει σε βάση χωρίς το migration home_invites) */
  organizer_name: z.string().optional(),
  my_participant_id: z.string(),
  my_rsvp: z.enum(RSVP_STATUSES),
  my_declared: z.boolean(),
  declared_count: z.number().int(),
  total_count: z.number().int(),
  created_at: z.string(),
  /** Προθεσμία απάντησης (λείπει σε βάση χωρίς το migration respond_by) */
  respond_by: z.string().nullable().optional(),
  /** Πόσοι καλεσμένοι δεν έχουν απαντήσει ακόμα */
  unanswered_count: z.number().int().optional(),
  /** fixed = «Διαλέγω εγώ το μέρος» (λείπει σε βάση χωρίς το migration fixed_place) */
  place_mode: z.enum(['fair', 'fixed', 'none']).optional(),
  venue_name: z.string().nullable().optional(),
  /** Πόσοι έρχονται (✓) */
  going_count: z.number().int().optional(),
  /** «Σήμερα» χωρίς ώρα: μόνο μέρα (YYYY-MM-DD) */
  meet_day: z.string().nullable().optional(),
  /** 🔖 Την έχω αποθηκεύσει */
  saved: z.boolean().optional(),
  /** 🌙 «Απόψε» (μαζί με meet_day, χωρίς ώρα) */
  meet_part: z.literal('evening').nullable().optional(),
});
export type MyOutingRow = z.infer<typeof MyOutingRowSchema>;

/** Γραμμή από outing_history(): όλες οι έξοδοι όπου συμμετείχες (και οι παλιές/ακυρωμένες) */
export const OutingHistoryRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  activity: z.enum(ACTIVITIES),
  category: z.string().nullable(),
  city: z.enum(CITIES),
  meet_at: z.string().nullable(),
  status: z.enum(OUTING_STATUSES),
  /** Όνομα του μαγαζιού που επιλέχθηκε (αν επιλέχθηκε) */
  venue_name: z.string().nullable(),
  is_organizer: z.boolean(),
  created_at: z.string(),
});
export type OutingHistoryRow = z.infer<typeof OutingHistoryRowSchema>;
export const OutingHistoryRowsSchema = z.array(OutingHistoryRowSchema);

/** Ημερομηνία για ταξινόμηση/εμφάνιση στο ιστορικό: η ώρα συνάντησης, αλλιώς πότε φτιάχτηκε */
export const historyDate = (r: Pick<OutingHistoryRow, 'meet_at' | 'created_at'>) => r.meet_at ?? r.created_at;

/** Φίλτρο ιστορικού ανά δραστηριότητα (undefined = όλες) + ποιες δραστηριότητες υπάρχουν (για τα chips) */
export function filterHistory(rows: OutingHistoryRow[], activity?: (typeof ACTIVITIES)[number]) {
  return {
    rows: activity ? rows.filter((r) => r.activity === activity) : rows,
    activities: ACTIVITIES.filter((a) => rows.some((r) => r.activity === a)),
  };
}

export const OutingParticipantRowsSchema = z.array(OutingParticipantRowSchema);
export const MyOutingRowsSchema = z.array(MyOutingRowSchema);

/** Μετά από τόσες ώρες από την ώρα συνάντησης, η πρόσκληση δεν είναι πια «ενεργή» (μένει στο Ιστορικό) */
export const INVITE_STALE_HOURS = 3;

/**
 * «Προσκλήσεις» στην αρχική: ενεργές έξοδοι, χωρισμένες σε
 *  - received: με κάλεσαν (όχι όσες αρνήθηκα) — πρώτα όσες περιμένουν απάντηση
 *  - sent: τις οργάνωσα εγώ
 * Κρύβει όσες η ώρα συνάντησης πέρασε πάνω από INVITE_STALE_HOURS. Ταξινόμηση: πιο κοντινή ώρα πρώτα.
 */
export function homeInvites(rows: MyOutingRow[], now: Date = new Date()) {
  const cutoff = now.getTime() - INVITE_STALE_HOURS * 3600_000;
  const today = localDayKey(now);
  // Παλιές: η ώρα πέρασε (+ περιθώριο) ή η μέρα («Σήμερα» χωρίς ώρα) πέρασε
  const active = rows.filter((r) => (r.meet_at ? new Date(r.meet_at).getTime() >= cutoff : !r.meet_day || r.meet_day >= today));
  const time = (r: MyOutingRow) =>
    r.meet_at ? new Date(r.meet_at).getTime() : r.meet_day ? new Date(`${r.meet_day}T23:59:00`).getTime() : Number.MAX_SAFE_INTEGER;
  const byTime = (a: MyOutingRow, b: MyOutingRow) => time(a) - time(b) || b.created_at.localeCompare(a.created_at);
  const received = active
    .filter((r) => !r.is_organizer && r.my_rsvp !== 'declined')
    .sort((a, b) => Number(b.my_rsvp === 'invited') - Number(a.my_rsvp === 'invited') || byTime(a, b));
  const sent = active.filter((r) => r.is_organizer).sort(byTime);
  return { received, sent, unanswered: received.filter((r) => r.my_rsvp === 'invited').length };
}

/** Χωρίς αφετηρίες: «Διαλέγω εγώ το μέρος» ή «Χωρίς μέρος» */
export const noOrigins = (o: Pick<MyOutingRow, 'place_mode'>) => o.place_mode === 'fixed' || o.place_mode === 'none';

/** Θέλει κάτι από μένα: απάντηση ή (στις «δίκαιες») δήλωση αφετηρίας */
export const needsMyAction = (o: MyOutingRow) =>
  o.my_rsvp === 'invited' || (!noOrigins(o) && !o.my_declared && (o.status === 'collecting' || o.status === 'suggesting'));

export const INVITE_TABS = ['answer', 'going', 'sent', 'saved'] as const;
export type InviteTab = (typeof INVITE_TABS)[number];

/**
 * Tabs της αρχικής: «Απάντησε» (θέλουν κάτι από μένα) · «Πάμε» (δέχτηκα) · «Έστειλες» (οργάνωσα)
 * · «Αποθηκευμένα» (🔖 — από το my_saved_outings, και παλιές/ακυρωμένες).
 * `initial`: το πρώτο tab (εκτός «Αποθηκευμένα») που έχει κάτι — αλλιώς «Απάντησε».
 */
export function inviteTabs(rows: MyOutingRow[], now: Date = new Date(), saved: MyOutingRow[] = []) {
  const { received, sent } = homeInvites(rows, now);
  const tabs: Record<InviteTab, MyOutingRow[]> = {
    answer: received.filter(needsMyAction),
    going: received.filter((o) => !needsMyAction(o)),
    sent,
    saved,
  };
  const initial: InviteTab = INVITE_TABS.find((k) => k !== 'saved' && tabs[k].length) ?? 'answer';
  return { tabs, initial };
}

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
        ...(r.preference && r.preference !== 'fair' ? { preference: r.preference } : {}),
      });
    } else {
      pending.push(r);
    }
  });
  return { participants, pending };
}
