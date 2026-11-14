import {
  estimateTripCost,
  rankVenues,
  type SuggestRequest,
  type SuggestionsResponse,
  type TransportMode,
  type TravelEstimate,
  type Venue,
} from '@centimeet/shared';
import type { Providers } from '../providers/types';
import { candidateAreas } from './areas';

export const SEARCH = {
  primaryRadiusM: 900,
  altRadiusM: 700,
  primaryMaxVenues: 15,
  altMaxVenues: 6,
  primaryResults: 6,
  altResultsPerArea: 3,
} as const;

/** Ταξί και αυτοκίνητο έχουν ίδιο χρόνο → ίδια κλήση στο Routes API */
const ROUTING_GROUP: Record<TransportMode, TransportMode> = {
  car: 'car',
  taxi: 'car',
  motorbike: 'motorbike',
  transit: 'transit',
  walk: 'walk',
  bike: 'bike',
};

export async function suggest(req: SuggestRequest, providers: Providers): Promise<SuggestionsResponse> {
  const departAt = req.departAt ? new Date(req.departAt) : undefined;
  const areas = candidateAreas(req.city, req.participants);

  // 1. Μαγαζιά ανά περιοχή (χωρίς διπλότυπα)
  const seen = new Set<string>();
  const venueArea = new Map<string, string>();
  const venues: Venue[] = [];
  const perArea = await Promise.all(
    areas.map((a) =>
      providers.places.searchVenues(
        a.center,
        req.activity,
        a.isPrimary ? SEARCH.primaryRadiusM : SEARCH.altRadiusM,
        a.isPrimary ? SEARCH.primaryMaxVenues : SEARCH.altMaxVenues,
      ),
    ),
  );
  perArea.forEach((list, i) => {
    for (const v of list.filter((v) => passesFilters(v, req.filters))) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      venueArea.set(v.id, areas[i]!.id);
      venues.push(v);
    }
  });
  if (venues.length === 0) return { areas, primary: [], alternatives: [] };

  // 2. Χρόνοι: μία κλήση matrix ανά ομάδα μέσου
  const travel = new Map<string, TravelEstimate[]>(venues.map((v) => [v.id, []]));
  const groups = new Map<TransportMode, typeof req.participants>();
  for (const p of req.participants) {
    const g = ROUTING_GROUP[p.mode];
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const unreachable = new Set<string>();
  await Promise.all(
    [...groups.entries()].map(async ([mode, people]) => {
      const m = await providers.routing.matrix(
        people.map((p) => p.origin),
        venues.map((v) => v.location),
        mode,
        departAt,
      );
      people.forEach((p, oi) => {
        venues.forEach((v, di) => {
          const cell = m[oi]?.[di];
          if (!cell || !Number.isFinite(cell.durationMin)) {
            unreachable.add(v.id);
            return;
          }
          const { costEur } = estimateTripCost(req.city, p.mode, cell.distanceKm, cell.durationMin);
          travel.get(v.id)!.push({
            participantId: p.id,
            durationMin: Math.round(cell.durationMin),
            distanceKm: Math.round(cell.distanceKm * 10) / 10,
            costEur,
          });
        });
      });
    }),
  );

  // 3. Κατάταξη
  const ranked = rankVenues(
    venues
      .filter((v) => !unreachable.has(v.id))
      .map((v) => ({ venue: v, travel: travel.get(v.id)!, areaId: venueArea.get(v.id)! })),
  );

  const primary = ranked.filter((r) => r.areaId === 'primary').slice(0, SEARCH.primaryResults);
  const alternatives = areas
    .filter((a) => !a.isPrimary)
    .flatMap((a) => ranked.filter((r) => r.areaId === a.id).slice(0, SEARCH.altResultsPerArea));

  return { areas, primary, alternatives };
}

function passesFilters(v: Venue, f: SuggestRequest['filters']): boolean {
  if (!f) return true;
  if (f.openNow && v.openNow === false) return false;
  if (f.minRating != null && (v.rating ?? 0) < f.minRating) return false;
  if (f.maxPriceLevel != null && v.priceLevel != null && v.priceLevel > f.maxPriceLevel) return false;
  return true;
}
