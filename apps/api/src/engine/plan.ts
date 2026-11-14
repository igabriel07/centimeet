import {
  estimateTripCost,
  googleMapsNavUrl,
  type ParkingOption,
  type ParticipantPlan,
  type VenuePlanRequest,
  type VenuePlanResponse,
} from '@centimeet/shared';
import type { Providers } from '../providers/types';

export const PARKING_RADIUS_M = 600;

/**
 * Αναλυτικό πλάνο για κάθε άτομο, όταν η παρέα διαλέξει μαγαζί:
 * χρόνος, βήματα συγκοινωνιών, κόστος, parking για όσους έχουν όχημα.
 */
export async function venuePlan(
  req: VenuePlanRequest,
  providers: Providers,
  /** Προαιρετικά: δική σου αναζήτηση parking (π.χ. Google + OSM συγχωνευμένα) */
  findParking?: (center: { lat: number; lng: number }) => Promise<ParkingOption[]>,
): Promise<VenuePlanResponse | null> {
  const venue = await providers.places.getVenue(req.venueId);
  if (!venue) return null;
  const departAt = req.departAt ? new Date(req.departAt) : undefined;

  const needsParking = req.participants.some((p) => p.mode === 'car' || p.mode === 'motorbike');
  const parkingPromise: Promise<ParkingOption[]> = needsParking
    ? (findParking ?? ((c) => providers.places.searchParking(c, PARKING_RADIUS_M)))(venue.location)
    : Promise.resolve([]);

  const [parking, routes] = await Promise.all([
    parkingPromise,
    Promise.all(req.participants.map((p) => providers.routing.route(p.origin, venue.location, p.mode, departAt))),
  ]);

  const plans: ParticipantPlan[] = req.participants.map((p, i) => {
    const r = routes[i];
    const durationMin = r?.durationMin ?? 0;
    const distanceKm = Math.round((r?.distanceKm ?? 0) * 10) / 10;
    const { costEur, note } = estimateTripCost(req.city, p.mode, distanceKm, durationMin);
    return {
      participantId: p.id,
      name: p.name,
      mode: p.mode,
      durationMin,
      distanceKm,
      costEur,
      costNote: r ? note : 'Δεν βρέθηκε διαδρομή',
      transitSteps: r?.steps,
      parking: p.mode === 'car' || p.mode === 'motorbike' ? parking : undefined,
      navigationUrl: googleMapsNavUrl(venue.location, p.mode, venue.id.startsWith('mock_') ? undefined : venue.id),
    };
  });

  return { venue, plans };
}
