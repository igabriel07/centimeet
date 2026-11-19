import { preferenceWeight, type LatLng, type PlacePreference, type TransportMode } from './types';

const R_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Απόσταση σε km (haversine) */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/**
 * Ενδεικτική μέση ταχύτητα (km/h) μέσα σε πόλη.
 * Χρησιμοποιείται ΜΟΝΟ για το βάρος του κέντρου και για εκτιμήσεις χωρίς API.
 */
export const URBAN_SPEED_KMH: Record<TransportMode, number> = {
  car: 22,
  taxi: 22,
  motorbike: 28,
  transit: 16,
  bike: 14,
  walk: 4.8,
};

/**
 * Σταθμισμένο κέντρο: όσο πιο αργό το μέσο, τόσο περισσότερο «τραβάει» το κέντρο προς
 * τη μεριά του ατόμου, ώστε να εξισώνονται οι ΧΡΟΝΟΙ και όχι οι αποστάσεις.
 */
export function weightedCentroid(points: { origin: LatLng; mode: TransportMode; preference?: PlacePreference }[]): LatLng {
  if (points.length === 0) throw new Error('weightedCentroid: empty input');
  let wSum = 0;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    // Πιο αργό μέσο → πιο κοντά του· «κοντά μου» → ακόμη πιο κοντά, «οπουδήποτε» → λιγότερο
    const w = (1 / URBAN_SPEED_KMH[p.mode]) * preferenceWeight(p.preference);
    wSum += w;
    lat += p.origin.lat * w;
    lng += p.origin.lng * w;
  }
  return { lat: lat / wSum, lng: lng / wSum };
}

/** Σταθερή επιβάρυνση (λεπτά) ανά μέσο: αναμονή, πρόσβαση σε στάση κ.λπ. */
const MODE_OVERHEAD_MIN: Record<TransportMode, number> = { transit: 8, car: 4, taxi: 4, motorbike: 2, bike: 1, walk: 0 };

/**
 * Χονδρική εκτίμηση χρόνου (λεπτά) χωρίς API: ευθεία απόσταση × 1.3 (δρόμοι).
 * Χρησιμοποιείται για το προ-φιλτράρισμα υποψήφιων σημείων και στο mock.
 */
export function estimateMinutes(a: LatLng, b: LatLng, mode: TransportMode): { durationMin: number; distanceKm: number } {
  const distanceKm = haversineKm(a, b) * 1.3;
  return { durationMin: (distanceKm / URBAN_SPEED_KMH[mode]) * 60 + MODE_OVERHEAD_MIN[mode], distanceKm };
}

/** Περπάτημα: ευθεία απόσταση × 1.3 (δρόμοι) με 4.8 km/h */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round(((haversineKm(a, b) * 1.3) / 4.8) * 60));
}
