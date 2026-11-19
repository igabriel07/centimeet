/** ⭐ Αποθηκευμένες διευθύνσεις (αγαπημένα): κοινή λογική για εφαρμογή & tests */
import { haversineKm } from './geo';
import type { LatLng, ResolvedPlace } from './types';

export const SAVED_PLACES_MAX = 20;
export const SAVED_LABEL_MAX = 40;
/** Δύο σημεία «είναι η ίδια διεύθυνση» αν απέχουν ≤ 40 μ. */
export const SAVED_MATCH_METERS = 40;

/** Έτοιμες ετικέτες για γρήγορη αποθήκευση */
export const SAVED_PRESETS = [
  { key: 'home', emoji: '🏠' },
  { key: 'work', emoji: '💼' },
  { key: 'school', emoji: '🎓' },
  { key: 'gym', emoji: '🏋️' },
  { key: 'other', emoji: '⭐' },
] as const;
export type SavedPresetKey = (typeof SAVED_PRESETS)[number]['key'];

export type SavedPlace = {
  id: string;
  label: string;
  emoji: string;
  name: string;
  address: string | null;
  place_id: string | null;
  lat: number;
  lng: number;
  created_at: string;
};

/** Η αποθηκευμένη διεύθυνση που ταιριάζει σε ένα σημείο (ή null) */
export function findSaved<T extends { lat: number; lng: number }>(list: readonly T[], loc: LatLng, meters = SAVED_MATCH_METERS): T | null {
  let best: T | null = null;
  let bestKm = meters / 1000;
  for (const s of list) {
    const d = haversineKm({ lat: s.lat, lng: s.lng }, loc);
    if (d <= bestKm) {
      best = s;
      bestKm = d;
    }
  }
  return best;
}

/** Αποθηκευμένη → ResolvedPlace (για επιλογή ως αφετηρία) */
export function savedToPlace(s: Pick<SavedPlace, 'id' | 'label' | 'name' | 'address' | 'place_id' | 'lat' | 'lng'>): ResolvedPlace {
  return {
    placeId: s.place_id ?? `saved:${s.id}`,
    name: s.name,
    address: s.address ?? undefined,
    location: { lat: s.lat, lng: s.lng },
  };
}

/** Καθαρή ετικέτα (trim, όριο χαρακτήρων) ή null αν κενή */
export function cleanLabel(label: string): string | null {
  const v = label.trim().replace(/\s+/g, ' ').slice(0, SAVED_LABEL_MAX);
  return v ? v : null;
}
