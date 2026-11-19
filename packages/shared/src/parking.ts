/**
 * «Πού πάρκαρα;» — θέσεις στάθμευσης του χρήστη.
 * Αποθηκεύονται ΜΟΝΟ στη συσκευή (η τοποθεσία είναι ευαίσθητο δεδομένο). Εδώ η καθαρή λογική:
 * προσθήκη (νεότερη πρώτη, όριο ιστορικού), ασφαλής ανάγνωση αποθηκευμένων και link για Google Maps.
 */
import { z } from 'zod';
import { haversineKm } from './geo';

export const PARKING_HISTORY_MAX = 50;
/** Αν η νέα θέση απέχει λιγότερο από τόσο από την τελευταία, θεωρείται η ίδια (π.χ. διπλό πάτημα) */
export const PARKING_SAME_SPOT_M = 15;

export const ParkedSpotSchema = z.object({
  id: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  /** ISO ημερομηνία αποθήκευσης */
  savedAt: z.string().min(1),
});
export type ParkedSpot = z.infer<typeof ParkedSpotSchema>;

export type NewParkedSpot = Omit<ParkedSpot, 'id' | 'savedAt'>;

/**
 * Προσθέτει θέση στην αρχή της λίστας.
 * Ίδια θέση με την τελευταία (< 15 m) → ανανεώνεται αυτή αντί να γίνει διπλή εγγραφή.
 */
export function addParkedSpot(list: ParkedSpot[], spot: NewParkedSpot, now: Date = new Date(), id: string = makeId(now)): ParkedSpot[] {
  const entry: ParkedSpot = {
    id,
    lat: spot.lat,
    lng: spot.lng,
    name: spot.name.trim().slice(0, 200) || `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`,
    ...(spot.address && spot.address !== spot.name ? { address: spot.address.slice(0, 300) } : {}),
    savedAt: now.toISOString(),
  };
  const [last, ...rest] = list;
  const sameAsLast = last && haversineKm(last, entry) * 1000 < PARKING_SAME_SPOT_M;
  return [entry, ...(sameAsLast ? rest : list)].slice(0, PARKING_HISTORY_MAX);
}

export function removeParkedSpot(list: ParkedSpot[], id: string): ParkedSpot[] {
  return list.filter((s) => s.id !== id);
}

/** Ανάγνωση από αποθήκευση: αγνοεί χαλασμένα δεδομένα αντί να ρίχνει την εφαρμογή */
export function parseParkedSpots(raw: string | null | undefined): ParkedSpot[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .map((x) => ParkedSpotSchema.safeParse(x))
    .filter((r) => r.success)
    .map((r) => r.data)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, PARKING_HISTORY_MAX);
}

/** Ανοίγει το σημείο στο Google Maps (στο κινητό: στην εφαρμογή, αλλιώς στον browser) */
export function googleMapsUrl(p: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

function makeId(now: Date): string {
  return `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
