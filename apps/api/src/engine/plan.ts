import {
  estimateMinutes,
  googleMapsNavUrl,
  type ParkingOption,
  type ParticipantPlan,
  type VenuePlanRequest,
  type VenuePlanResponse,
} from '@centimeet/shared';
import type { Providers, RouteTiming } from '../providers/types';
import { personTrip, ROUTING_MODE } from './modes';

export const PARKING_RADIUS_M = 600;

/**
 * Αναλυτικό πλάνο για κάθε άτομο, όταν η παρέα διαλέξει μαγαζί:
 * χρόνος (με κίνηση της ώρας συνάντησης), βήματα συγκοινωνιών, κόστος με διόδια,
 * parking + χρόνος εύρεσης για όσους έχουν όχημα.
 */
export async function venuePlan(
  req: VenuePlanRequest,
  providers: Providers,
  /** Προαιρετικά: δική σου αναζήτηση parking (π.χ. Google + OSM συγχωνευμένα) */
  findParking?: (center: { lat: number; lng: number }) => Promise<ParkingOption[]>,
): Promise<VenuePlanResponse | null> {
  const venue = await providers.places.getVenue(req.venueId);
  if (!venue) return null;
  const meetAt = req.departAt ? new Date(req.departAt) : undefined;

  const needsParking = req.participants.some((p) => p.mode === 'car' || p.mode === 'motorbike');
  const parkingPromise: Promise<ParkingOption[]> = needsParking
    ? (findParking ?? ((c) => providers.places.searchParking(c, PARKING_RADIUS_M)))(venue.location)
    : Promise.resolve([]);

  const timingFor = (p: VenuePlanRequest['participants'][number]): RouteTiming | undefined => {
    if (!meetAt) return undefined;
    const mode = ROUTING_MODE[p.mode];
    if (mode === 'transit') return { arriveBy: meetAt };
    if (mode === 'car') {
      const est = estimateMinutes(p.origin, venue.location, mode).durationMin;
      return { departAt: new Date(meetAt.getTime() - est * 60_000) };
    }
    return undefined;
  };

  const [parking, routes] = await Promise.all([
    parkingPromise,
    Promise.all(
      req.participants.map((p) => providers.routing.route(p.origin, venue.location, ROUTING_MODE[p.mode], timingFor(p))),
    ),
  ]);

  const plans: ParticipantPlan[] = req.participants.map((p, i) => {
    const r = routes[i];
    const toll = p.mode === 'car' || p.mode === 'taxi' ? (r?.tollEur ?? 0) : 0;
    const trip = r ? personTrip(req.city, p.mode, r, venue.location, toll) : null;
    const vehicle = p.mode === 'car' || p.mode === 'motorbike';
    return {
      participantId: p.id,
      name: p.name,
      mode: p.mode,
      durationMin: trip ? Math.round(trip.durationMin) : 0,
      ...(r?.estimated ? { estimated: true } : {}),
      distanceKm: trip ? Math.round(trip.distanceKm * 10) / 10 : 0,
      costEur: trip?.costEur ?? 0,
      costNote: trip ? (toll ? `${trip.costNote} + διόδια` : trip.costNote) : 'Δεν βρέθηκε διαδρομή',
      tollEur: toll || undefined,
      parkingSearchMin: trip?.parkingMin || undefined,
      transitSteps: r?.steps,
      parking: vehicle ? parking : undefined,
      navigationUrl: googleMapsNavUrl(venue.location, p.mode, venue.id.startsWith('mock_') || venue.id.startsWith('osm:') ? undefined : venue.id),
    };
  });

  return { venue, plans };
}
