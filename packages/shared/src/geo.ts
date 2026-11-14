import type { LatLng, TransportMode } from './types';

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
export function weightedCentroid(points: { origin: LatLng; mode: TransportMode }[]): LatLng {
  if (points.length === 0) throw new Error('weightedCentroid: empty input');
  let wSum = 0;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    const w = 1 / URBAN_SPEED_KMH[p.mode];
    wSum += w;
    lat += p.origin.lat * w;
    lng += p.origin.lng * w;
  }
  return { lat: lat / wSum, lng: lng / wSum };
}
