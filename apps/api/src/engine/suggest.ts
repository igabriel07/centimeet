/**
 * Προτάσεις μαγαζιών — ο αλγόριθμος του CentiMeet:
 *
 *  1. Υποψήφια σημεία (κέντρο παρέας, πλέγμα, κόμβοι) → προ-φιλτράρισμα με εκτίμηση → 5–8 σημεία
 *  2. Πραγματικοί χρόνοι κάθε ατόμου προς κάθε σημείο (Routes), με το μέσο του:
 *       - οχήματα με ώρα συνάντησης: κίνηση εκείνης της ώρας, αναχώρηση = συνάντηση − διάρκεια
 *       - συγκοινωνίες: ώρα άφιξης = ώρα συνάντησης
 *       - + χρόνος εύρεσης parking, μηχανή ≈ 15% γρηγορότερη
 *  3. Δίκαιο σημείο: μικρότερος μέγιστος χρόνος & διαφορά, κόστος ως δευτερεύον → κύριο + 2 εναλλακτικά
 *  4. Μαγαζιά σε 300 m (→ μεγαλύτερη ακτίνα αν δεν φτάνουν), ανοιχτά την ώρα της συνάντησης
 *  5. Σειρά: σταθμισμένη βαθμολογία, μείον «ίσως γεμάτο» για μεγάλες παρέες
 *
 * Πόσες κλήσεις Google γίνονται ορίζει το προφίλ κόστους (engine/config.ts).
 */
import {
  CITY_CONFIG,
  crowdHint,
  estimateMinutes,
  haversineKm,
  isOpenAt,
  pointFairnessCost,
  rankVenuesByQuality,
  travelStats,
  walkMinutes,
  type AreaVenuesRequest,
  type AreaVenuesResponse,
  type LatLng,
  type Participant,
  type ResultNotices,
  type ScoredVenue,
  type SuggestRequest,
  type SuggestionArea,
  type SuggestionsResponse,
  type TransportMode,
  type TravelEstimate,
  type Venue,
} from '@centimeet/shared';
import type { MatrixCell, Providers, RouteTiming } from '../providers/types';
import { CANDIDATES, generateCandidates, prefilterCandidates, type CandidatePoint } from './areas';
import { ENGINE_PROFILES, type EngineConfig } from './config';
import { personTrip, ROUTING_MODE } from './modes';

export const SEARCH = {
  /** Μεγαλώνουμε την ακτίνα μέχρι να βρεθούν τόσα κατάλληλα μαγαζιά */
  minVenues: 6,
  primaryResults: 8,
  altResultsPerArea: 3,
  alternatives: 2,
  /** Το μαγαζί πρέπει να μένει ανοιχτό τουλάχιστον τόσο μετά την άφιξη */
  stayMin: 60,
  /** Αν ο πραγματικός χρόνος οδήγησης απέχει τόσο από την εκτίμηση, ξαναρωτάμε με σωστή ώρα αναχώρησης */
  refineThresholdMin: 10,
} as const;

export type SuggestOptions = { config?: EngineConfig; now?: Date };

type PointTravel = { travel: Map<string, TravelEstimate[]>; estimated: boolean };

export async function suggest(req: SuggestRequest, providers: Providers, opts: SuggestOptions = {}): Promise<SuggestionsResponse> {
  const config = opts.config ?? ENGINE_PROFILES.growth;
  const meetAt = req.departAt ? new Date(req.departAt) : undefined;
  const at = meetAt ?? opts.now ?? new Date();

  // 1. Υποψήφια σημεία
  const candidates = prefilterCandidates(
    req.city,
    req.participants,
    generateCandidates(req.city, req.participants),
    config.maxRealPoints,
  );

  // 2. Πραγματικοί χρόνοι
  const { travel, estimated } = await travelToPoints(req, candidates, providers, meetAt, config);

  // 3. Δίκαιο σημείο + εναλλακτικά σε άλλες περιοχές
  const ranked = candidates
    .filter((c) => travel.has(c.id))
    .map((c) => ({ c, travel: travel.get(c.id)!, cost: pointFairnessCost(travel.get(c.id)!) }))
    .sort((a, b) => a.cost - b.cost);
  const picks: typeof ranked = [];
  for (const r of ranked) {
    if (picks.length > SEARCH.alternatives) break;
    if (picks.every((p) => haversineKm(p.c.center, r.c.center) >= CANDIDATES.altMinSeparationKm)) picks.push(r);
  }
  const notices: ResultNotices = estimated ? { estimatedTimes: true } : {};
  if (picks.length === 0) return { areas: [], primary: [], alternatives: [], notices };

  // 4–5. Μαγαζιά: το κύριο πάντα· τα εναλλακτικά αμέσως ή «κατά παραγγελία»
  const withVenues = picks.map((_, i) => i === 0 || config.alternativesWithVenues);
  const found = await Promise.all(
    picks.map((p, i) =>
      withVenues[i] ? findVenues(providers, p.c.center, req, at, i === 0 ? config.primaryRadiiM : config.altRadiiM) : null,
    ),
  );

  const seen = new Set<string>();
  const areas: SuggestionArea[] = [];
  const perArea: ScoredVenue[][] = [];
  picks.forEach((p, i) => {
    const area = toArea(i === 0 ? 'primary' : p.c.id, p.c, p.travel, i === 0, found[i]?.radiusM ?? 0, withVenues[i]!);
    areas.push(area);
    if (!found[i]) return perArea.push([]);
    const fresh = found[i]!.venues.filter((v) => !seen.has(v.id));
    fresh.forEach((v) => seen.add(v.id));
    if (fresh.some((v) => v.source === 'osm')) notices.basicVenues = true;
    perArea.push(rankArea(req, area, fresh, at).slice(0, i === 0 ? SEARCH.primaryResults : SEARCH.altResultsPerArea));
  });

  return { areas, primary: perArea[0] ?? [], alternatives: perArea.slice(1).flat(), notices };
}

/** «Δες μαγαζιά εδώ»: μαγαζιά για μια εναλλακτική περιοχή που ήρθε χωρίς μαγαζιά */
export async function areaVenues(req: AreaVenuesRequest, providers: Providers, opts: SuggestOptions = {}): Promise<AreaVenuesResponse> {
  const config = opts.config ?? ENGINE_PROFILES.growth;
  const at = req.departAt ? new Date(req.departAt) : (opts.now ?? new Date());
  const exclude = new Set(req.excludeIds ?? []);
  const found = await findVenues(providers, req.area.center, req, at, config.altRadiiM);
  const area = toArea(req.area.id, req.area, req.area.travel, false, found.radiusM, true);
  const venues = found.venues.filter((v) => !exclude.has(v.id));
  return {
    area,
    venues: rankArea(req, area, venues, at).slice(0, SEARCH.primaryResults),
    notices: venues.some((v) => v.source === 'osm') ? { basicVenues: true } : {},
  };
}

function toArea(
  id: string,
  c: { label: string; center: LatLng },
  travel: TravelEstimate[],
  isPrimary: boolean,
  radiusM: number,
  hasVenues: boolean,
): SuggestionArea {
  const stats = travelStats(travel);
  return {
    id,
    label: c.label,
    center: c.center,
    isPrimary,
    travel: travel.map(roundTravel),
    maxMin: Math.round(stats.max),
    minMin: Math.round(stats.min),
    radiusM,
    hasVenues,
  };
}

/** Κατάταξη μαγαζιών μιας περιοχής: χρόνος ως το σημείο + περπάτημα, ποιότητα, «ίσως γεμάτο» */
function rankArea(req: SuggestRequest, area: SuggestionArea, venues: Venue[], at: Date): ScoredVenue[] {
  const tz = CITY_CONFIG[req.city].timeZone;
  return rankVenuesByQuality(
    venues.map((venue) => {
      const walk = walkMinutes(area.center, venue.location);
      return {
        venue,
        areaId: area.id,
        distanceM: haversineKm(area.center, venue.location) * 1000,
        travel: area.travel.map((t) => roundTravel({ ...t, durationMin: t.durationMin + walk })),
        crowd: crowdHint({ venue, activity: req.activity, groupSize: req.participants.length, at, timeZone: tz }),
      };
    }),
  );
}

/**
 * Χρόνοι από κάθε άτομο προς κάθε σημείο: μία κλήση matrix ανά ομάδα μέσου
 * (οχήματα / συγκοινωνίες / πόδια / ποδήλατο). Σημεία που κάποιος δεν φτάνει απορρίπτονται.
 */
async function travelToPoints(
  req: SuggestRequest,
  points: CandidatePoint[],
  providers: Providers,
  meetAt: Date | undefined,
  config: EngineConfig,
): Promise<PointTravel> {
  const groups = new Map<TransportMode, Participant[]>();
  for (const p of req.participants) {
    const g = ROUTING_MODE[p.mode];
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  const perPerson = new Map<string, Map<string, TravelEstimate>>(points.map((pt) => [pt.id, new Map()]));
  const unreachable = new Set<string>();
  const destinations = points.map((p) => p.center);
  let estimated = false;

  await Promise.all(
    [...groups.entries()].map(async ([mode, people]) => {
      const origins = people.map((p) => p.origin);
      const m = await matrixFor(providers, mode, origins, destinations, meetAt, config);
      people.forEach((person, oi) => {
        points.forEach((pt, di) => {
          const cell = m[oi]?.[di];
          if (!cell || !Number.isFinite(cell.durationMin)) {
            unreachable.add(pt.id);
            return;
          }
          if (cell.estimated) estimated = true;
          const trip = personTrip(req.city, person.mode, cell, pt.center);
          perPerson.get(pt.id)!.set(person.id, {
            participantId: person.id,
            durationMin: trip.durationMin,
            distanceKm: trip.distanceKm,
            costEur: trip.costEur,
          });
        });
      });
    }),
  );

  const travel = new Map<string, TravelEstimate[]>();
  for (const pt of points) {
    if (unreachable.has(pt.id)) continue;
    // Ίδια σειρά με τους participants
    travel.set(pt.id, req.participants.map((p) => perPerson.get(pt.id)!.get(p.id)!));
  }
  return { travel, estimated };
}

/**
 * Matrix με τον σωστό χρονισμό:
 *  - οχήματα + ώρα συνάντησης: το Google δέχεται μόνο ώρα ΑΝΑΧΩΡΗΣΗΣ, οπότε
 *    αναχώρηση = συνάντηση − εκτιμώμενη διάρκεια· (growth) αν η πραγματική διάρκεια απέχει πολύ, ξαναρωτάμε
 *  - συγκοινωνίες + ώρα συνάντησης: ώρα ΑΦΙΞΗΣ
 *  - αλλιώς «τώρα», χωρίς κίνηση
 */
async function matrixFor(
  providers: Providers,
  mode: TransportMode,
  origins: LatLng[],
  destinations: LatLng[],
  meetAt: Date | undefined,
  config: EngineConfig,
): Promise<MatrixCell[][]> {
  if (!meetAt || mode === 'walk' || mode === 'bike') return providers.routing.matrix(origins, destinations, mode);
  if (mode === 'transit') return providers.routing.matrix(origins, destinations, mode, { arriveBy: meetAt });

  const estimate = median(origins.flatMap((o) => destinations.map((d) => estimateMinutes(o, d, mode).durationMin)));
  const timing = (minutes: number): RouteTiming => ({ departAt: new Date(meetAt.getTime() - minutes * 60_000) });
  const first = await providers.routing.matrix(origins, destinations, mode, timing(estimate));
  if (!config.refineTraffic) return first;
  const actual = median(first.flat().flatMap((c) => (c && !c.estimated && Number.isFinite(c.durationMin) ? [c.durationMin] : [])));
  if (!Number.isFinite(actual) || Math.abs(actual - estimate) < SEARCH.refineThresholdMin) return first;
  return providers.routing.matrix(origins, destinations, mode, timing(actual));
}

/** Μαγαζιά γύρω από ένα σημείο: η ακτίνα μεγαλώνει μέχρι να βρεθούν αρκετά κατάλληλα */
async function findVenues(
  providers: Providers,
  center: LatLng,
  req: SuggestRequest,
  at: Date,
  radii: readonly number[],
): Promise<{ venues: Venue[]; radiusM: number }> {
  const tz = CITY_CONFIG[req.city].timeZone;
  let last: { venues: Venue[]; radiusM: number } = { venues: [], radiusM: radii[0] ?? 300 };
  for (const radiusM of radii) {
    const list = await providers.places.searchVenues(center, req.activity, radiusM, 20);
    last = { venues: list.filter((v) => passesFilters(v, req.filters, at, tz)), radiusM };
    if (last.venues.length >= SEARCH.minVenues) break;
  }
  return last;
}

export function passesFilters(v: Venue, f: SuggestRequest['filters'], at: Date, timeZone: string): boolean {
  if (v.businessStatus && v.businessStatus !== 'OPERATIONAL') return false;
  // Προεπιλογή: μόνο ανοιχτά την ώρα της συνάντησης (άγνωστο ωράριο = δεν αποκλείεται)
  if ((f?.openNow ?? true) && isOpenAt(v.openingPeriods, at, SEARCH.stayMin, timeZone) === false) return false;
  if (f?.minRating != null && (v.rating ?? 0) < f.minRating) return false;
  if (f?.maxPriceLevel != null && v.priceLevel != null && v.priceLevel > f.maxPriceLevel) return false;
  return true;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const roundTravel = (t: TravelEstimate): TravelEstimate => ({
  ...t,
  durationMin: Math.round(t.durationMin),
  distanceKm: Math.round(t.distanceKm * 10) / 10,
});
