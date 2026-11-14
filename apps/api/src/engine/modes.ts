import { estimateTripCost, parkingSearchMinutes, type CityId, type LatLng, type TransportMode } from '@centimeet/shared';

/**
 * Με ποιο μέσο ζητάμε διαδρομή από το Routes API.
 * Ταξί & μηχανή = αυτοκίνητο (ίδιοι δρόμοι) → μία κλήση matrix για όλα τα οχήματα.
 */
export const ROUTING_MODE: Record<TransportMode, TransportMode> = {
  car: 'car',
  taxi: 'car',
  motorbike: 'car',
  transit: 'transit',
  walk: 'walk',
  bike: 'bike',
};

/** Διόρθωση χρόνου: η μηχανή περνάει ανάμεσα στην κίνηση (≈15% γρηγορότερη) */
export const DURATION_FACTOR: Record<TransportMode, number> = {
  car: 1,
  taxi: 1,
  motorbike: 0.85,
  transit: 1,
  walk: 1,
  bike: 1,
};

/**
 * Από τον «ωμό» χρόνο του Routes API στον πραγματικό χρόνο του ατόμου ως το σημείο:
 * διόρθωση μέσου + εύρεση parking. Μαζί και το κόστος της διαδρομής.
 */
export function personTrip(
  city: CityId,
  mode: TransportMode,
  routed: { durationMin: number; distanceKm: number },
  destination: LatLng,
  extraCostEur = 0,
) {
  const parkingMin = parkingSearchMinutes(city, mode, destination);
  const durationMin = routed.durationMin * DURATION_FACTOR[mode] + parkingMin;
  const { costEur, note } = estimateTripCost(city, mode, routed.distanceKm, routed.durationMin);
  return {
    durationMin,
    distanceKm: routed.distanceKm,
    costEur: Math.round((costEur + extraCostEur) * 100) / 100,
    costNote: note,
    parkingMin,
  };
}
