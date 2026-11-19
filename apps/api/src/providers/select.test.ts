import { describe, expect, it } from 'vitest';
import { loadEnv, routingProvider, usesGoogle, venuesProvider } from '../env';
import { venueNotices } from '../engine/suggest';
import { MemoryCache } from '../lib/cache';
import { MemoryUsageStore } from '../lib/usage';
import { buildProviders } from '../server';
import { GuardedProvider } from './guarded';
import { MockProvider } from './mock';
import { HybridPlaces, OsmPlaces } from './osmVenues';
import { OsrmRouting } from './osrm';

const base = { USE_MOCK_PROVIDERS: 'false', ALLOW_MEMORY_USAGE_STORE: 'true' };
const build = (vars: Record<string, string>) => buildProviders(loadEnv(vars), new MemoryCache(), new MemoryUsageStore()).providers;

describe('Επιλογή πηγών από το .env', () => {
  it('auto χωρίς κλειδί Google → osrm + osm (εντελώς δωρεάν, χωρίς μετρητή κόστους)', () => {
    const env = loadEnv({ USE_MOCK_PROVIDERS: 'false' });
    expect(routingProvider(env)).toBe('osrm');
    expect(venuesProvider(env)).toBe('osm');
    expect(usesGoogle(env)).toBe(false);
    const p = build({ USE_MOCK_PROVIDERS: 'false' });
    expect(p.routing).toBeInstanceOf(OsrmRouting);
    expect(p.places).toBeInstanceOf(OsmPlaces);
  });

  it('auto με κλειδί → google (όπως πριν)', () => {
    const p = build({ ...base, GOOGLE_MAPS_API_KEY: 'k' });
    expect(p.routing).toBeInstanceOf(GuardedProvider);
    expect(p.places).toBeInstanceOf(GuardedProvider);
  });

  it('hybrid + osrm με κλειδί', () => {
    const p = build({ ...base, GOOGLE_MAPS_API_KEY: 'k', ROUTING_PROVIDER: 'osrm', VENUES_PROVIDER: 'hybrid' });
    expect(p.routing).toBeInstanceOf(OsrmRouting);
    expect(p.places).toBeInstanceOf(HybridPlaces);
  });

  it('USE_MOCK_PROVIDERS=true → όλα mock (tests / τοπική ανάπτυξη)', () => {
    const p = build({ USE_MOCK_PROVIDERS: 'true', ROUTING_PROVIDER: 'osrm', VENUES_PROVIDER: 'osm' });
    expect(p.routing).toBeInstanceOf(MockProvider);
  });

  it('google / hybrid χωρίς κλειδί → σαφές σφάλμα κατά την εκκίνηση', () => {
    expect(() => loadEnv({ USE_MOCK_PROVIDERS: 'false', VENUES_PROVIDER: 'hybrid' })).toThrow(/GOOGLE_MAPS_API_KEY/);
    expect(() => loadEnv({ USE_MOCK_PROVIDERS: 'false', ROUTING_PROVIDER: 'google' })).toThrow(/GOOGLE_MAPS_API_KEY/);
  });

  it('με Google (έστω και μόνο για συγκοινωνίες) χρειάζεται μετρητής κόστους', () => {
    expect(() => loadEnv({ USE_MOCK_PROVIDERS: 'false', GOOGLE_MAPS_API_KEY: 'k', ROUTING_PROVIDER: 'osrm', VENUES_PROVIDER: 'osm' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});

describe('Ειδοποιήσεις αποτελεσμάτων', () => {
  const at = { lat: 1, lng: 1 };
  it('«χωρίς βαθμολογίες» μόνο όταν ΚΑΝΕΝΑ δεν έχει · «© OpenStreetMap» όταν κάποιο είναι από OSM', () => {
    expect(venueNotices([{ id: 'a', name: 'A', location: at, source: 'osm', fromOsm: true }])).toEqual({ basicVenues: true, osmData: true });
    expect(venueNotices([{ id: 'a', name: 'A', location: at, rating: 4.5, source: 'google', fromOsm: true }])).toEqual({ osmData: true });
    expect(venueNotices([{ id: 'a', name: 'A', location: at, rating: 4.5, source: 'google' }])).toEqual({});
  });
});
