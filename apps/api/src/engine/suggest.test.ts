import { haversineKm, pointFairnessCost, type LatLng, type SuggestRequest, type TransportMode, type Venue } from '@centimeet/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockProvider } from '../providers/mock';
import type { MatrixCell, PlacesProvider, Providers, RouteTiming, RoutingProvider } from '../providers/types';
import { venuePlan } from './plan';
import { ENGINE_PROFILES } from './config';
import { SEARCH, suggest } from './suggest';

// Σταθερή «τώρα» (Παρασκευή 20:00 ώρα Ελλάδας): τα tests χωρίς ώρα συνάντησης δεν πρέπει
// να αποτυγχάνουν όταν τρέχουν νύχτα (τα μαγαζιά «κλειστά» → καμία πρόταση).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T18:00:00Z'));
});
afterAll(() => vi.useRealTimers());

const ATHENS = {
  kifisia: { lat: 38.0736, lng: 23.8114 },
  piraeus: { lat: 37.9478, lng: 23.6432 },
  koukaki: { lat: 37.9655, lng: 23.7247 },
  peristeri: { lat: 38.0134, lng: 23.6953 },
  glyfada: { lat: 37.8636, lng: 23.7536 },
  syntagma: { lat: 37.9755, lng: 23.7348 },
};

const group = [
  { id: 'p1', name: 'Γιώργος', origin: ATHENS.kifisia, mode: 'car' as const },
  { id: 'p2', name: 'Μαρία', origin: ATHENS.piraeus, mode: 'transit' as const },
  { id: 'p3', name: 'Νίκος', origin: ATHENS.koukaki, mode: 'walk' as const },
  { id: 'p4', name: 'Ελένη', origin: ATHENS.peristeri, mode: 'motorbike' as const },
  { id: 'p5', name: 'Κώστας', origin: ATHENS.glyfada, mode: 'taxi' as const },
];

/** Παρασκευή 20/11/2026 21:00 ώρα Ελλάδας */
const FRIDAY_9PM = '2026-11-20T21:00:00+02:00';

type MatrixCall = { mode: TransportMode; origins: number; destinations: number; timing?: RouteTiming };

/** Mock που καταγράφει τις κλήσεις, για να ελέγχουμε τι θα πληρώναμε στο Google */
function spy(overrides: { matrix?: RoutingProvider['matrix']; searchVenues?: PlacesProvider['searchVenues'] } = {}) {
  const mock = new MockProvider();
  const matrixCalls: MatrixCall[] = [];
  const searches: { center: LatLng; radiusM: number }[] = [];
  const routing: RoutingProvider = {
    matrix: async (origins, destinations, mode, timing) => {
      matrixCalls.push({ mode, origins: origins.length, destinations: destinations.length, timing });
      return (overrides.matrix ?? mock.matrix.bind(mock))(origins, destinations, mode, timing);
    },
    route: mock.route.bind(mock),
  };
  const places: PlacesProvider = {
    ...mock,
    searchVenues: async (center, activity, radiusM, max) => {
      searches.push({ center, radiusM });
      return (overrides.searchVenues ?? mock.searchVenues.bind(mock))(center, activity, radiusM, max);
    },
    getVenue: mock.getVenue.bind(mock),
    searchParking: mock.searchParking.bind(mock),
    autocomplete: mock.autocomplete.bind(mock),
    resolvePlace: mock.resolvePlace.bind(mock),
    reverse: mock.reverse.bind(mock),
  };
  const providers: Providers = { places, routing };
  return { providers, matrixCalls, searches };
}

const req = (p: Partial<SuggestRequest> = {}): SuggestRequest => ({ city: 'athens', activity: 'coffee', participants: group, ...p });

describe('suggest — σημείο συνάντησης', () => {
  it('μία κλήση matrix ανά ομάδα μέσου (αυτοκίνητο, ταξί, μηχανή μαζί) και ≤ 8 σημεία', async () => {
    const { providers, matrixCalls } = spy();
    await suggest(req(), providers);
    expect(matrixCalls.map((c) => c.mode).sort()).toEqual(['car', 'transit', 'walk']);
    expect(matrixCalls.find((c) => c.mode === 'car')!.origins).toBe(3);
    expect(matrixCalls.every((c) => c.destinations <= 8)).toBe(true);
  });

  it('χωρίς ώρα: «τώρα», χωρίς κίνηση (φθηνότερο)', async () => {
    const { providers, matrixCalls } = spy();
    await suggest(req(), providers);
    expect(matrixCalls.every((c) => c.timing === undefined)).toBe(true);
  });

  it('με ώρα συνάντησης: συγκοινωνίες με ώρα άφιξης· οχήματα & πόδια ΧΩΡΙΣ κίνηση (Essentials)', async () => {
    const { providers, matrixCalls } = spy();
    await suggest(req({ departAt: FRIDAY_9PM }), providers);
    expect(matrixCalls.find((c) => c.mode === 'transit')!.timing).toEqual({ arriveBy: new Date(FRIDAY_9PM) });
    const car = matrixCalls.filter((c) => c.mode === 'car');
    expect(car).toHaveLength(1);
    expect(car[0]!.timing).toBeUndefined();
    expect(matrixCalls.find((c) => c.mode === 'walk')!.timing).toBeUndefined();
  });

  it('μία μόνο κλήση matrix ανά μέσο (καμία δεύτερη «διόρθωση κίνησης»)', async () => {
    const slowTraffic: RoutingProvider['matrix'] = async (origins, destinations) =>
      origins.map(() => destinations.map(() => ({ durationMin: 75, distanceKm: 20 })));
    const { providers, matrixCalls } = spy({ matrix: slowTraffic });
    await suggest(req({ departAt: FRIDAY_9PM }), providers);
    expect(matrixCalls.filter((c) => c.mode === 'car')).toHaveLength(1);
  });

  it('εκτιμώμενοι χρόνοι σημειώνονται ανά άτομο (για «~» στην εφαρμογή)', async () => {
    const est: RoutingProvider['matrix'] = async (origins, destinations) =>
      origins.map(() => destinations.map(() => ({ durationMin: 20, distanceKm: 5, estimated: true })));
    const { providers } = spy({ matrix: est });
    const res = await suggest(req(), providers);
    expect(res.notices?.estimatedTimes).toBe(true);
    expect(res.areas[0]!.travel.every((t) => t.estimated)).toBe(true);
  });

  it('το κύριο σημείο είναι το πιο δίκαιο· τα εναλλακτικά απέχουν ≥ 1.2 km', async () => {
    const { providers } = spy();
    const res = await suggest(req(), providers);
    const [primary, ...alts] = res.areas;
    expect(primary!.isPrimary).toBe(true);
    for (const a of alts) {
      expect(pointFairnessCost(primary!.travel)).toBeLessThanOrEqual(pointFairnessCost(a.travel));
      expect(haversineKm(primary!.center, a.center)).toBeGreaterThanOrEqual(1.2);
    }
    expect(primary!.travel).toHaveLength(5);
  });

  it('σημείο που κάποιος δεν μπορεί να φτάσει απορρίπτεται', async () => {
    const mock = new MockProvider();
    // Ο πεζός «δεν φτάνει» σε κανένα σημείο ανατολικά του Συντάγματος
    const matrix: RoutingProvider['matrix'] = async (origins, destinations, mode, timing) => {
      const m = await mock.matrix(origins, destinations, mode, timing);
      return mode === 'walk' ? m.map((row) => row.map((c, i): MatrixCell => (destinations[i]!.lng > 23.735 ? null : c))) : m;
    };
    const { providers } = spy({ matrix });
    const res = await suggest(req(), providers);
    for (const a of res.areas) expect(a.center.lng).toBeLessThanOrEqual(23.735);
  });

  it('ο πεζός «τραβάει» το σημείο προς τη μεριά του', async () => {
    const { providers } = spy();
    const walker = [
      { id: 'w', name: 'Πεζός', origin: ATHENS.syntagma, mode: 'walk' as const },
      { id: 'c', name: 'Οδηγός', origin: ATHENS.kifisia, mode: 'car' as const },
    ];
    const res = await suggest(req({ participants: walker }), providers);
    const c = res.areas[0]!.center;
    expect(haversineKm(c, ATHENS.syntagma)).toBeLessThan(haversineKm(c, ATHENS.kifisia));
  });
});

describe('suggest — μαγαζιά', () => {
  const venueAt = (id: string, center: LatLng, extra: Partial<Venue> = {}): Venue => ({
    id,
    name: id,
    location: { lat: center.lat + 0.0005, lng: center.lng },
    rating: 4.5,
    ratingCount: 300,
    ...extra,
  });

  it('ξεκινά από 300 m και μεγαλώνει την ακτίνα όταν δεν φτάνουν τα μαγαζιά', async () => {
    const searchVenues: PlacesProvider['searchVenues'] = async (center, _a, radiusM) =>
      Array.from({ length: radiusM <= 300 ? 2 : 10 }, (_, i) => venueAt(`v${radiusM}_${i}`, center));
    const { providers, searches } = spy({ searchVenues });
    const res = await suggest(req(), providers);
    const primarySearches = searches.filter((s) => s.center === res.areas[0]!.center);
    expect(primarySearches.map((s) => s.radiusM)).toEqual([300, 500]);
    expect(res.areas[0]!.radiusM).toBe(500);
    expect(res.primary.length).toBe(SEARCH.primaryResults);
  });

  it('δεν φτάνει ποτέ πέρα από 800 m', async () => {
    const searchVenues: PlacesProvider['searchVenues'] = async (center) => [venueAt('lonely', center)];
    const { providers, searches } = spy({ searchVenues });
    await suggest(req(), providers);
    expect(Math.max(...searches.map((s) => s.radiusM))).toBe(800);
  });

  it('πετάει κλειστά την ώρα της συνάντησης και μόνιμα κλειστά', async () => {
    const morningOnly = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 8, minute: 0 }, close: { day: d, hour: 14, minute: 0 } }));
    const searchVenues: PlacesProvider['searchVenues'] = async (center) => [
      venueAt('open', center),
      venueAt('morning', center, { openingPeriods: morningOnly }),
      venueAt('gone', center, { businessStatus: 'CLOSED_PERMANENTLY' }),
    ];
    const { providers } = spy({ searchVenues });
    const res = await suggest(req({ departAt: FRIDAY_9PM }), providers);
    const ids = [...res.primary, ...res.alternatives].map((s) => s.venue.id);
    expect(ids).toContain('open');
    expect(ids).not.toContain('morning');
    expect(ids).not.toContain('gone');
  });

  it('σειρά κατά σταθμισμένη βαθμολογία (όχι κατά απόσταση)', async () => {
    const { providers } = spy();
    const res = await suggest(req(), providers);
    const q = res.primary.map((s) => s.quality);
    expect([...q].sort((a, b) => b - a)).toEqual(q);
    expect(res.primary[0]!.score).toBe(100);
  });

  it('ο χρόνος ανά άτομο = ως το σημείο + περπάτημα ως το μαγαζί', async () => {
    const { providers } = spy();
    const res = await suggest(req(), providers);
    const area = res.areas[0]!;
    for (const s of res.primary) {
      s.travel.forEach((t, i) => expect(t.durationMin).toBeGreaterThanOrEqual(area.travel[i]!.durationMin));
      expect(s.distanceM).toBeLessThanOrEqual(area.radiusM + 1);
    }
  });

  it('15 άτομα για ποτό Παρασκευή βράδυ → μαγαζιά με «πάρτε τηλέφωνο», 3 άτομα → καμία ένδειξη', async () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`,
      name: `Άτομο ${i + 1}`,
      origin: { lat: 37.96 + (i % 5) * 0.01, lng: 23.7 + Math.floor(i / 5) * 0.015 },
      mode: (['walk', 'transit', 'car'] as const)[i % 3]!,
    }));
    const big = await suggest(req({ activity: 'drinks', participants: many, departAt: '2026-11-20T23:00:00+02:00' }), spy().providers);
    expect(big.primary.some((s) => s.crowd?.callAhead)).toBe(true);

    const small = await suggest(req({ activity: 'drinks', participants: many.slice(0, 3), departAt: '2026-11-20T23:00:00+02:00' }), spy().providers);
    expect(small.primary.every((s) => !s.crowd)).toBe(true);
  });
});

describe('venuePlan', () => {
  it('οδηγοί: χρόνος εύρεσης parking στο κέντρο, διόδια στο κόστος· ταξί χωρίς parking', async () => {
    const { providers } = spy();
    const res = await suggest(req(), providers);
    const venueId = res.primary[0]!.venue.id;
    const plan = await venuePlan({ city: 'athens', venueId, participants: group, departAt: FRIDAY_9PM }, providers);
    const byId = Object.fromEntries(plan!.plans.map((p) => [p.participantId, p]));
    expect(byId.p1!.parkingSearchMin).toBeGreaterThan(0); // αυτοκίνητο
    expect(byId.p1!.tollEur).toBe(2.8); // Κηφισιά → κέντρο, mock διόδια
    expect(byId.p1!.costNote).toContain('διόδια');
    expect(byId.p5!.parkingSearchMin).toBeUndefined(); // ταξί
    expect(byId.p4!.parkingSearchMin).toBeGreaterThan(0); // μηχανή
  });
});

describe('προφίλ κόστους', () => {
  it('lean: ≤ 5 σημεία, χωρίς δεύτερη κλήση κίνησης, ακτίνες 300 → 600, εναλλακτικές χωρίς μαγαζιά', async () => {
    const slowTraffic: RoutingProvider['matrix'] = async (origins, destinations) =>
      origins.map(() => destinations.map(() => ({ durationMin: 75, distanceKm: 20 })));
    const searchVenues: PlacesProvider['searchVenues'] = async () => [];
    const { providers, matrixCalls, searches } = spy({ matrix: slowTraffic, searchVenues });
    const res = await suggest(req({ departAt: FRIDAY_9PM }), providers, { config: ENGINE_PROFILES.lean });
    expect(matrixCalls.every((c) => c.destinations <= 5)).toBe(true);
    expect(matrixCalls.filter((c) => c.mode === 'car')).toHaveLength(1);
    expect(searches.map((s) => s.radiusM)).toEqual([300, 600]); // μόνο το κύριο σημείο
    expect(res.areas.slice(1).every((a) => !a.hasVenues && a.radiusM === 0)).toBe(true);
    expect(res.alternatives).toEqual([]);
  });

  it('lean με 4 άτομα: ≤ 20 χρεώσιμα στοιχεία matrix ανά αναζήτηση', async () => {
    const { providers, matrixCalls } = spy();
    await suggest(req({ participants: group.slice(0, 4) }), providers, { config: ENGINE_PROFILES.lean });
    expect(matrixCalls.reduce((n, c) => n + c.origins * c.destinations, 0)).toBeLessThanOrEqual(20);
  });
});
