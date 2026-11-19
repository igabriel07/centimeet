import { haversineKm, spotRankKey, SuggestRequestSchema, type ActivityCategory, type LatLng, type SuggestRequest, type VenueActivity } from '@centimeet/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../lib/cache';
import { defaultLimits, MemoryUsageStore, UsageGuard, type GoogleSku } from '../lib/usage';
import { CATEGORY_GOOGLE, CATEGORY_OSM } from '../providers/categories';
import { GoogleProvider } from '../providers/google';
import { GuardedProvider } from '../providers/guarded';
import { MockProvider } from '../providers/mock';
import { osmVenues } from '../providers/osm';
import type { MatrixCell, Providers } from '../providers/types';
import { areaVenues, suggest } from './suggest';

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T18:00:00Z')); // Παρασκευή 20:00 Ελλάδα
});
afterAll(() => vi.useRealTimers());

const group: SuggestRequest['participants'] = [
  { id: 'a', name: 'Άννα', origin: { lat: 38.0736, lng: 23.8114 }, mode: 'walk' }, // Κηφισιά
  { id: 'b', name: 'Βασίλης', origin: { lat: 37.9478, lng: 23.6432 }, mode: 'walk' }, // Πειραιάς
  { id: 'c', name: 'Γιώτα', origin: { lat: 37.8636, lng: 23.7536 }, mode: 'walk' }, // Γλυφάδα
];
const req = (p: Partial<SuggestRequest>): SuggestRequest => ({ city: 'athens', activity: 'coffee', participants: group, ...p });

/** Mock που καταγράφει τις αναζητήσεις μαγαζιών (δραστηριότητα + κατηγορία) */
function recording(matrix?: Providers['routing']['matrix']) {
  const mock = new MockProvider();
  const searches: { activity: VenueActivity; category?: ActivityCategory }[] = [];
  const providers: Providers = {
    routing: { matrix: matrix ?? mock.matrix.bind(mock), route: mock.route.bind(mock) },
    places: {
      searchVenues: async (center, activity, radiusM, max, category) => {
        searches.push({ activity, category });
        return mock.searchVenues(center, activity, radiusM, max, category);
      },
      getVenue: mock.getVenue.bind(mock),
      searchParking: mock.searchParking.bind(mock),
      autocomplete: mock.autocomplete.bind(mock),
      resolvePlace: mock.resolvePlace.bind(mock),
      reverse: mock.reverse.bind(mock),
    },
  };
  return { providers, searches };
}

describe('«Σημείο» (spot)', () => {
  it('δίνει μόνο σημείο συνάντησης: χωρίς αναζήτηση μαγαζιών (κανένα κόστος Places)', async () => {
    const { providers, searches } = recording();
    const res = await suggest(req({ activity: 'spot' }), providers);
    expect(searches).toEqual([]);
    expect(res.primary).toEqual([]);
    expect(res.alternatives).toEqual([]);
    expect(res.areas.length).toBeGreaterThanOrEqual(1);
    expect(res.areas[0]).toMatchObject({ id: 'primary', isPrimary: true, hasVenues: false, radiusM: 0 });
    expect(res.areas[0]!.travel).toHaveLength(3);
  });

  it('1ο κριτήριο η απόσταση: όταν το πιο γρήγορο σημείο είναι πιο μακριά, προτιμά το πιο κοντινό', async () => {
    // Αντίστροφος κόσμος: όσο πιο μακριά, τόσο πιο γρήγορα (π.χ. αυτοκινητόδρομος)
    const adversarial = async (origins: LatLng[], destinations: LatLng[]): Promise<MatrixCell[][]> =>
      origins.map((o) => destinations.map((d) => ({ distanceKm: haversineKm(o, d), durationMin: Math.max(5, 60 - haversineKm(o, d) * 3) })));
    const drivers = group.map((p) => ({ ...p, mode: 'car' as const }));
    const spot = await suggest(req({ activity: 'spot', participants: drivers }), recording(adversarial).providers);
    const coffee = await suggest(req({ activity: 'coffee', participants: drivers }), recording(adversarial).providers);

    const [spotDist] = spotRankKey(spot.areas[0]!.travel);
    const [coffeeDist] = spotRankKey(coffee.areas[0]!.travel);
    expect(spotDist).toBeLessThan(coffeeDist); // το «Σημείο» βγάζει δικαιότερη απόσταση
    expect(coffee.areas[0]!.maxMin).toBeLessThanOrEqual(spot.areas[0]!.maxMin); // ο καφές κοιτά τον χρόνο
  });

  it('τα εναλλακτικά είναι κι αυτά σημεία χωρίς μαγαζιά, κατά σειρά κατάταξης', async () => {
    const res = await suggest(req({ activity: 'spot' }), recording().providers);
    expect(res.areas.slice(1).every((a) => !a.isPrimary && !a.hasVenues)).toBe(true);
    const keys = res.areas.map((a) => spotRankKey(a.travel));
    // το κύριο δεν είναι χειρότερο από κανένα εναλλακτικό στην απόσταση
    expect(keys.every((k) => keys[0]![0] <= k[0])).toBe(true);
  });

  it('«Δες μαγαζιά εδώ» για σημείο: τίποτα, χωρίς κλήσεις', async () => {
    const { providers, searches } = recording();
    const area = { id: 'x', label: 'Χ', center: { lat: 37.98, lng: 23.73 }, travel: [{ participantId: 'a', durationMin: 10, distanceKm: 1, costEur: 0 }] };
    const res = await areaVenues({ ...req({ activity: 'spot' }), area }, providers);
    expect(res.venues).toEqual([]);
    expect(searches).toEqual([]);
  });
});

describe('κατηγορίες', () => {
  it('η κατηγορία φτάνει στον provider και τα μαγαζιά είναι της κατηγορίας', async () => {
    const { providers, searches } = recording();
    const res = await suggest(req({ activity: 'food', category: 'pizza' }), providers);
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((s) => s.activity === 'food' && s.category === 'pizza')).toBe(true);
    expect(res.primary.length).toBeGreaterThan(0);
    expect(res.primary.every((s) => s.venue.id.startsWith('mock_food-pizza_'))).toBe(true);
  });

  it('χωρίς κατηγορία = «Όλα» (όπως πριν)', async () => {
    const { providers, searches } = recording();
    await suggest(req({ activity: 'food' }), providers);
    expect(searches.every((s) => s.category === undefined)).toBe(true);
  });

  it('κάθε κατηγορία έχει αντιστοίχιση σε Google και OSM', () => {
    for (const [cat, g] of Object.entries(CATEGORY_GOOGLE)) {
      expect('types' in g ? g.types.length : g.text.length, cat).toBeGreaterThan(0);
      expect(CATEGORY_OSM[cat as ActivityCategory].length, cat).toBeGreaterThan(0);
    }
  });
});

describe('Google: τύπος ή κείμενο ανά κατηγορία', () => {
  const center = { lat: 37.97, lng: 23.73 };
  const record = (places: unknown[]) => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body ?? '{}')) });
      return Response.json({ places });
    }) as unknown as typeof fetch;
    return { calls, g: new GoogleProvider('k', new MemoryCache(), fetchImpl) };
  };
  const place = (id: string, lat: number, lng: number) => ({ id, displayName: { text: id }, location: { latitude: lat, longitude: lng } });

  it('πίτσα → Nearby Search με τύπο pizza_restaurant', async () => {
    const { g, calls } = record([place('p1', 37.9705, 23.7305)]);
    await g.searchVenues(center, 'food', 300, 20, 'pizza');
    expect(calls[0]!.url).toContain('places:searchNearby');
    expect(calls[0]!.body.includedTypes).toEqual(['pizza_restaurant']);
  });

  it('σουβλάκι → Text Search «σουβλάκι» και κρατά μόνο όσα είναι μέσα στην ακτίνα', async () => {
    const { g, calls } = record([place('near', 37.9705, 23.7305), place('far', 38.05, 23.8)]);
    const venues = await g.searchVenues(center, 'food', 300, 20, 'souvlaki');
    expect(calls[0]!.url).toContain('places:searchText');
    expect(calls[0]!.body.textQuery).toBe('σουβλάκι');
    expect(venues.map((v) => v.id)).toEqual(['near']);
  });

  it('η cache ξεχωρίζει κατηγορίες (πίτσα ≠ σουβλάκι ≠ όλα)', async () => {
    const { g, calls } = record([]);
    await g.searchVenues(center, 'food', 300, 20, 'pizza');
    await g.searchVenues(center, 'food', 300, 20, 'souvlaki');
    await g.searchVenues(center, 'food', 300, 20);
    await g.searchVenues(center, 'food', 300, 20, 'pizza'); // από cache
    expect(calls).toHaveLength(3);
  });
});

describe('μετρητής κόστους & OSM', () => {
  const center = { lat: 37.97, lng: 23.73 };
  const net = (overpass: (q: string) => unknown[]) => {
    const calls = { nearby: 0, text: 0, overpass: [] as string[] };
    const fetchImpl = (async (url: string, init: RequestInit) => {
      if (url.includes('overpass')) {
        const q = decodeURIComponent(String(init.body).slice(5));
        calls.overpass.push(q);
        return Response.json({ elements: overpass(q) });
      }
      if (url.includes('searchText')) calls.text++;
      else calls.nearby++;
      return Response.json({ places: [] });
    }) as unknown as typeof fetch;
    return { calls, fetchImpl };
  };
  const guarded = (limits: Partial<Record<GoogleSku, number>>, n: ReturnType<typeof net>) => {
    const store = new MemoryUsageStore();
    const cache = new MemoryCache();
    const guard = new UsageGuard(store, { ...defaultLimits(), ...limits }, () => new Date('2026-11-15T10:00:00Z'));
    return { p: new GuardedProvider(new GoogleProvider('k', cache, n.fetchImpl), guard, new MockProvider(), cache, () => {}, n.fetchImpl), store };
  };

  it('Text Search μετρά στο δικό του όριο (text_search), όχι στο places_search', async () => {
    const n = net(() => []);
    const { p, store } = guarded({}, n);
    await p.searchVenues(center, 'food', 300, 20, 'souvlaki');
    await p.searchVenues(center, 'food', 300, 20, 'pizza');
    expect(await store.get('2026-11', 'google:text_search')).toBe(1);
    expect(await store.get('2026-11', 'google:places_search')).toBe(1);
  });

  it('όριο Text Search εξαντλημένο → OSM για σουβλάκι, ενώ η πίτσα συνεχίζει στο Google', async () => {
    const n = net(() => [{ type: 'node', id: 7, lat: 37.9701, lon: 23.7301, tags: { name: 'Σουβλάκι OSM', cuisine: 'souvlaki' } }]);
    const { p } = guarded({ text_search: 0 }, n);
    const souvlaki = await p.searchVenues(center, 'food', 300, 20, 'souvlaki');
    expect(n.calls.text).toBe(0);
    expect(souvlaki[0]).toMatchObject({ name: 'Σουβλάκι OSM', source: 'osm' });
    expect(n.calls.overpass[0]).toContain('souvlaki');
    await p.searchVenues(center, 'food', 300, 20, 'pizza');
    expect(n.calls.nearby).toBe(1);
  });

  it('OSM: αν η κατηγορία δεν βρει τίποτα, ψάχνει όλη τη δραστηριότητα', async () => {
    const n = net((q) => (q.includes('cuisine') ? [] : [{ type: 'node', id: 9, lat: 37.9701, lon: 23.7301, tags: { name: 'Εστιατόριο' } }]));
    const venues = await osmVenues(center, 'food', 300, new MemoryCache(), n.fetchImpl, 'pizza');
    expect(n.calls.overpass).toHaveLength(2);
    expect(n.calls.overpass[0]).toContain('pizza');
    expect(venues.map((v) => v.name)).toEqual(['Εστιατόριο']);
  });
});

describe('«Πού θέλεις να πάμε;» στο πλήρες σενάριο', () => {
  it('«κοντά μου» φέρνει το κύριο σημείο πιο κοντά σε αυτό το άτομο', async () => {
    const fair = await suggest(req({ activity: 'coffee' }), recording().providers);
    const near = await suggest(
      req({ activity: 'coffee', participants: group.map((p) => ({ ...p, preference: p.id === 'a' ? ('near' as const) : ('anywhere' as const) })) }),
      recording().providers,
    );
    const annaMin = (r: typeof fair) => r.areas[0]!.travel.find((t) => t.participantId === 'a')!.durationMin;
    expect(annaMin(near)).toBeLessThan(annaMin(fair));
  });

  it('το schema δέχεται προτίμηση και απορρίπτει άγνωστη', () => {
    const p = { ...group[0]!, preference: 'near' as const };
    expect(SuggestRequestSchema.safeParse(req({ participants: [p, group[1]!] })).success).toBe(true);
    expect(SuggestRequestSchema.safeParse(req({ participants: [{ ...p, preference: 'far' } as never, group[1]!] })).success).toBe(false);
  });
});
