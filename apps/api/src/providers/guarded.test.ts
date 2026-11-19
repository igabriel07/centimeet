import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env';
import { buildServer } from '../server';
import { ENGINE_PROFILES } from '../engine/config';
import { suggest } from '../engine/suggest';
import { MemoryCache } from '../lib/cache';
import { defaultLimits, MemoryUsageStore, UsageGuard, type GoogleSku, type UsageStore } from '../lib/usage';
import { GoogleProvider } from './google';
import { GuardedProvider } from './guarded';
import { MockProvider } from './mock';
import type { Providers } from './types';

const A = { lat: 37.97, lng: 23.73 };
const B = { lat: 38.07, lng: 23.81 };
const NOV = () => new Date('2026-11-15T10:00:00Z');

/** Ψεύτικο Google: μετρά τις κλήσεις και απαντά σαν τα Places/Routes · το Overpass (OSM) απαντά με 1 καφέ */
function fakeNetwork() {
  const calls = { google: 0, overpass: 0 };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    if (url.includes('overpass')) {
      calls.overpass++;
      return Response.json({ elements: [{ type: 'node', id: 1, lat: 37.9701, lon: 23.7301, tags: { name: 'Καφέ OSM', phone: '210 0000000' } }] });
    }
    calls.google++;
    const body = JSON.parse(String(init.body ?? '{}'));
    if (url.includes('searchNearby')) {
      return Response.json({ places: [{ id: 'g1', displayName: { text: 'Καφέ Google' }, location: { latitude: 37.9702, longitude: 23.7302 }, rating: 4.5, userRatingCount: 900 }] });
    }
    if (url.includes('computeRouteMatrix')) {
      const els = [];
      for (let o = 0; o < body.origins.length; o++)
        for (let d = 0; d < body.destinations.length; d++)
          els.push({ originIndex: o, destinationIndex: d, condition: 'ROUTE_EXISTS', duration: '900s', distanceMeters: 5000 });
      return Response.json(els);
    }
    return Response.json({ routes: [{ duration: '900s', distanceMeters: 5000 }] });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

function guarded(limits: Partial<Record<GoogleSku, number>>, store: UsageStore = new MemoryUsageStore()) {
  const net = fakeNetwork();
  const cache = new MemoryCache();
  const google = new GoogleProvider('k', cache, net.fetchImpl);
  const guard = new UsageGuard(store, { ...defaultLimits(), ...limits }, NOV);
  const mock = new MockProvider();
  const p = new GuardedProvider(google, guard, mock, cache, () => {}, net.fetchImpl);
  return { p, net, store };
}

describe('UsageGuard', () => {
  it('σταματά ακριβώς στο όριο και δεν μετρά κλήσεις που δεν χωράνε', async () => {
    const store = new MemoryUsageStore();
    const g = new UsageGuard(store, { ...defaultLimits(), matrix_pro: 50 }, NOV);
    expect(await g.tryConsume('matrix_pro', 40)).toBe(true);
    expect(await g.tryConsume('matrix_pro', 20)).toBe(false); // 60 > 50 → ολόκληρη απορρίπτεται
    expect(await g.tryConsume('matrix_pro', 10)).toBe(true);
    expect((await g.report()).matrix_pro).toEqual({ used: 50, limit: 50 });
  });

  it('προεπιλογή: 90% των δωρεάν ορίων του Google', () => {
    expect(defaultLimits()).toMatchObject({ places_search: 900, matrix_pro: 4500, matrix_essentials: 9000 });
  });

  it('αν ο μετρητής δεν απαντά, ΔΕΝ επιτρέπει κλήση Google (ασφαλές)', async () => {
    const broken: UsageStore = { consume: async () => { throw new Error('db down'); }, get: async () => 0 };
    expect(await new UsageGuard(broken, defaultLimits(), NOV).tryConsume('places_search')).toBe(false);
  });
});

describe('GuardedProvider', () => {
  it('μέσα στο όριο → Google· μετρά στοιχεία matrix = origins × destinations', async () => {
    const { p, net, store } = guarded({});
    const m = await p.matrix([A, B], [A, B, A], 'walk');
    expect(net.calls.google).toBe(1);
    expect(m[0]![0]!.estimated).toBeUndefined();
    expect(await store.get('2026-11', 'google:matrix_essentials')).toBe(6);
  });

  it('οχήματα με μελλοντική ώρα μετρούν στο Pro (με κίνηση), χωρίς ώρα στο Essentials', async () => {
    const { p, store } = guarded({});
    await p.matrix([A], [B], 'car', { departAt: new Date(Date.now() + 86_400_000) });
    await p.matrix([A], [B], 'car');
    expect(await store.get('2026-11', 'google:matrix_pro')).toBe(1);
    expect(await store.get('2026-11', 'google:matrix_essentials')).toBe(1);
  });

  it('πέρα από το όριο → εκτίμηση απόστασης, χωρίς καμία κλήση Google', async () => {
    const { p, net } = guarded({ matrix_essentials: 0, routes_essentials: 0 });
    const m = await p.matrix([A], [B], 'walk');
    const r = await p.route(A, B, 'walk');
    expect(net.calls.google).toBe(0);
    expect(m[0]![0]!.estimated).toBe(true);
    expect(r?.estimated).toBe(true);
  });

  it('μαγαζιά πέρα από το όριο → OpenStreetMap, και το πλάνο τα βρίσκει μετά', async () => {
    const { p, net } = guarded({ places_search: 0 });
    const venues = await p.searchVenues(A, 'coffee', 300, 20);
    expect(net.calls.google).toBe(0);
    expect(venues[0]).toMatchObject({ name: 'Καφέ OSM', source: 'osm', phone: '210 0000000' });
    expect(await p.getVenue(venues[0]!.id)).toMatchObject({ name: 'Καφέ OSM' });
  });

  it('το πλάνο βρίσκει μαγαζί Google από την cache χωρίς δεύτερη χρέωση (Place Details)', async () => {
    const { p, net, store } = guarded({});
    const [v] = await p.searchVenues(A, 'coffee', 300, 20);
    const callsAfterSearch = net.calls.google;
    expect(await p.getVenue(v!.id)).toMatchObject({ name: 'Καφέ Google' });
    expect(net.calls.google).toBe(callsAfterSearch);
    expect(await store.get('2026-11', 'google:place_details')).toBe(0);
  });

  it('η αναζήτηση δηλώνει «εκτιμώμενοι χρόνοι» / «χωρίς βαθμολογίες» όταν εξαντληθεί το όριο', async () => {
    const { p } = guarded({ matrix_essentials: 0, matrix_pro: 0, places_search: 0 });
    const providers: Providers = { places: p, routing: p };
    const res = await suggest(
      {
        city: 'athens',
        activity: 'coffee',
        participants: [
          { id: 'a', name: 'Α', origin: A, mode: 'walk' },
          { id: 'b', name: 'Β', origin: B, mode: 'car' },
        ],
      },
      providers,
      { config: ENGINE_PROFILES.lean },
    );
    expect(res.notices).toEqual({ estimatedTimes: true, basicVenues: true, osmData: true });
    expect(res.primary[0]!.venue.source).toBe('osm');
  });
});

describe('ρυθμίσεις κόστους', () => {
  it('με πραγματικό Google απαιτείται μετρητής στη βάση (ή ρητή άδεια για μνήμη)', () => {
    const base = { USE_MOCK_PROVIDERS: 'false', GOOGLE_MAPS_API_KEY: 'k' };
    expect(() => loadEnv(base as NodeJS.ProcessEnv)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(() => loadEnv({ ...base, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => loadEnv({ ...base, ALLOW_MEMORY_USAGE_STORE: 'true' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it('προεπιλογή: λιτή λειτουργία', () => {
    expect(loadEnv({} as NodeJS.ProcessEnv).COST_MODE).toBe('lean');
  });
});

describe('ασφάλεια παραγωγής', () => {
  it('στην παραγωγή ο server αρνείται να ξεκινήσει χωρίς REQUIRE_AUTH', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/REQUIRE_AUTH/);
    expect(() =>
      loadEnv({ NODE_ENV: 'production', REQUIRE_AUTH: 'true', SUPABASE_URL: 'https://x.supabase.co' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('εσωτερικό σφάλμα (π.χ. από Google) δεν φτάνει στον χρήστη', async () => {
    const boom = new MockProvider();
    const providers: Providers = {
      places: boom,
      routing: { matrix: async () => { throw new Error('Google API 403: API key AIza-secret not valid'); }, route: boom.route.bind(boom) },
    };
    const app = buildServer(loadEnv({ USE_MOCK_PROVIDERS: 'true', GEOCODER: 'mock' } as NodeJS.ProcessEnv), { providers });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suggestions',
      payload: {
        city: 'athens',
        activity: 'coffee',
        participants: [
          { id: 'a', name: 'Α', origin: A, mode: 'walk' },
          { id: 'b', name: 'Β', origin: B, mode: 'car' },
        ],
      },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal' });
    expect(res.body).not.toContain('AIza');
  });
});
