import type { Venue } from '@centimeet/shared';
import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../lib/cache';
import { MockProvider } from './mock';
import { osmRichness, osmToVenue } from './osm';
import { HybridPlaces, normName, OsmPlaces, sameVenue } from './osmVenues';
import type { PlacesProvider } from './types';

const C = { lat: 37.9755, lng: 23.7348 };

/** Ψεύτικο Overpass: αναζήτηση γύρω από σημείο ή ένα στοιχείο με id */
function fakeOverpass() {
  const queries: string[] = [];
  const elements = [
    { type: 'node', id: 1, lat: 37.9756, lon: 23.7349, tags: { name: 'Καφέ Μέση' } },
    { type: 'node', id: 2, lat: 37.9757, lon: 23.735, tags: { name: 'Flat White', opening_hours: 'Mo-Su 08:00-22:00', website: 'https://x', 'addr:street': 'Ερμού', 'addr:housenumber': '10' } },
    { type: 'way', id: 3, center: { lat: 37.976, lon: 23.736 }, tags: { name: 'Μικρό', phone: '210 1234567' } },
    { type: 'node', id: 4, lat: 37.976, lon: 23.736, tags: { amenity: 'cafe' } }, // χωρίς όνομα → εκτός
  ];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const q = decodeURIComponent(String(init.body).replace(/^data=/, ''));
    queries.push(q);
    expect(url).toBe('https://overpass.test/api');
    if (/^\[out:json\]\[timeout:10\];way\(3\)/.test(q)) return Response.json({ elements: [elements[2]] });
    return Response.json({ elements });
  }) as unknown as typeof fetch;
  return { queries, fetchImpl };
}

const osmPlaces = (net = fakeOverpass(), cache = new MemoryCache()) => ({
  places: new OsmPlaces(cache, new MockProvider(), 'https://overpass.test/api', net.fetchImpl),
  net,
  cache,
});

describe('Overpass → Venue', () => {
  it('id «osm:node/1», διεύθυνση από addr:street + housenumber, μόνο με όνομα', () => {
    expect(osmToVenue({ type: 'node', id: 2, lat: 1, lon: 2, tags: { name: 'X', 'addr:street': 'Ερμού', 'addr:housenumber': '10' } })).toEqual({
      id: 'osm:node/2',
      name: 'X',
      location: { lat: 1, lng: 2 },
      address: 'Ερμού 10',
      phone: undefined,
      source: 'osm',
      fromOsm: true,
    });
    expect(osmToVenue({ type: 'node', id: 4, lat: 1, lon: 2, tags: {} })).toBeNull();
  });

  it('«πληρότητα»: ωράριο + website + τηλέφωνο', () => {
    expect(osmRichness({ opening_hours: 'x', website: 'y', phone: 'z' })).toBe(3);
    expect(osmRichness({})).toBe(0);
  });

  it('searchVenues: πρώτα όσα έχουν ωράριο/website/τηλέφωνο, πετάει τα χωρίς όνομα, σωστό φίλτρο', async () => {
    const { places, net } = osmPlaces();
    const venues = await places.searchVenues(C, 'coffee', 300, 20);
    expect(venues.map((v) => v.name)).toEqual(['Flat White', 'Μικρό', 'Καφέ Μέση']);
    expect(net.queries[0]).toContain('[amenity=cafe][name]');
    expect(net.queries[0]).toContain(`around:300,${C.lat},${C.lng}`);
  });

  it('getVenue: από την cache της αναζήτησης (χωρίς νέο Overpass) ή με id', async () => {
    const { places, net } = osmPlaces();
    await places.searchVenues(C, 'coffee', 300, 20);
    expect((await places.getVenue('osm:node/2'))?.name).toBe('Flat White');
    expect(net.queries).toHaveLength(1);

    const fresh = osmPlaces();
    expect((await fresh.places.getVenue('osm:way/3'))?.name).toBe('Μικρό');
    expect(fresh.net.queries[0]).toContain('way(3)');
    expect(await fresh.places.getVenue('google-id')).toBeNull();
  });
});

describe('Overpass υπερφορτωμένο', () => {
  const ok = { elements: [{ type: 'node', id: 7, lat: 37.9756, lon: 23.7349, tags: { name: 'Καφέ' } }] };
  it('502 → μία επανάληψη και μετά κανονικά', async () => {
    let n = 0;
    const fetchImpl = (async () => (++n === 1 ? new Response('busy', { status: 502 }) : Response.json(ok))) as unknown as typeof fetch;
    const p = new OsmPlaces(new MemoryCache(), new MockProvider(), 'https://overpass.test/api', fetchImpl);
    expect((await p.searchVenues(C, 'coffee', 300, 20)).map((v) => v.name)).toEqual(['Καφέ']);
    expect(n).toBe(2);
  });

  it('αποτυχία → κενό ΧΩΡΙΣ cache: μόλις ο server επανέλθει, βρίσκονται τα μαγαζιά', async () => {
    let up = false;
    const fetchImpl = (async () => (up ? Response.json(ok) : new Response('down', { status: 500 }))) as unknown as typeof fetch;
    const p = new OsmPlaces(new MemoryCache(), new MockProvider(), 'https://overpass.test/api', fetchImpl);
    expect(await p.searchVenues(C, 'coffee', 300, 20)).toEqual([]);
    up = true;
    expect(await p.searchVenues(C, 'coffee', 300, 20)).toHaveLength(1);
  });
});

describe('Αντιστοίχιση OSM ↔ Google', () => {
  const v = (name: string, lat: number, lng: number): Venue => ({ id: name, name, location: { lat, lng } });
  it('ονόματα χωρίς τόνους/κεφαλαία/σύμβολα', () => {
    expect(normName('Καφέ «Μέση»')).toBe(normName('ΚΑΦΕ ΜΕΣΗ'));
  });
  it('ίδιο μαγαζί: < 60 m και το ένα όνομα περιέχει το άλλο', () => {
    expect(sameVenue(v('Flat White', 37.9757, 23.735), v('Flat White Coffee', 37.9758, 23.7351))).toBe(true);
    expect(sameVenue(v('Flat White', 37.9757, 23.735), v('Flat White', 37.9777, 23.735))).toBe(false); // ~220 m
    expect(sameVenue(v('Flat White', 37.9757, 23.735), v('Μικρό', 37.9757, 23.735))).toBe(false);
  });
});

describe('HybridPlaces (OSM + μία κλήση Google)', () => {
  /** Ψεύτικο Google (σαν GuardedProvider): μετρά κλήσεις */
  function fakeGoogle(opts: { fail?: boolean; budgetReached?: boolean } = {}) {
    let calls = 0;
    const m = new MockProvider();
    const google: PlacesProvider = {
      searchParking: m.searchParking.bind(m),
      autocomplete: m.autocomplete.bind(m),
      resolvePlace: m.resolvePlace.bind(m),
      reverse: m.reverse.bind(m),
      searchVenues: async () => {
        calls++;
        if (opts.fail) throw new Error('google down');
        if (opts.budgetReached) return [{ id: 'osm:node/9', name: 'Εφεδρικό', location: C, source: 'osm' }];
        return [
          { id: 'g-flat', name: 'Flat White Coffee', location: { lat: 37.9758, lng: 23.7351 }, rating: 4.7, ratingCount: 1200, priceLevel: 2, source: 'google' },
          { id: 'g-only', name: 'Μόνο στο Google', location: { lat: 37.9759, lng: 23.7352 }, rating: 4.4, ratingCount: 300, source: 'google' },
        ];
      },
      getVenue: async () => null,
    };
    return { google, calls: () => calls };
  }

  it('εμπλουτίζει τα OSM με βαθμολογίες Google και προσθέτει όσα έχει μόνο το Google', async () => {
    const { places, cache } = osmPlaces();
    const g = fakeGoogle();
    const hybrid = new HybridPlaces(places, g.google, cache);
    const venues = await hybrid.searchVenues(C, 'coffee', 300, 20);
    const flat = venues.find((x) => x.name === 'Flat White')!;
    expect(flat).toMatchObject({ id: 'osm:node/2', rating: 4.7, ratingCount: 1200, priceLevel: 2, source: 'google', fromOsm: true });
    expect(venues.find((x) => x.name === 'Καφέ Μέση')!.rating).toBeUndefined();
    expect(venues.some((x) => x.id === 'g-only')).toBe(true);
    expect(g.calls()).toBe(1);
    // Το πλάνο βρίσκει το εμπλουτισμένο μαγαζί
    expect((await hybrid.getVenue('osm:node/2'))?.rating).toBe(4.7);
  });

  it('αντιστοιχίσεις στην cache 7 ημερών → η επόμενη ίδια αναζήτηση ΔΕΝ καλεί Google', async () => {
    const { places, cache } = osmPlaces();
    const g = fakeGoogle();
    const hybrid = new HybridPlaces(places, g.google, cache);
    await hybrid.searchVenues(C, 'coffee', 300, 20);
    const again = await hybrid.searchVenues(C, 'coffee', 300, 20);
    expect(g.calls()).toBe(1);
    expect(again.find((x) => x.name === 'Flat White')!.rating).toBe(4.7);
  });

  it('αποτυχία Google → συνεχίζει με OSM χωρίς βαθμολογία', async () => {
    const { places, cache } = osmPlaces();
    const hybrid = new HybridPlaces(places, fakeGoogle({ fail: true }).google, cache);
    const venues = await hybrid.searchVenues(C, 'coffee', 300, 20);
    expect(venues.map((x) => x.name)).toEqual(['Flat White', 'Μικρό', 'Καφέ Μέση']);
    expect(venues.every((x) => x.rating == null && x.source === 'osm')).toBe(true);
  });

  it('εξαντλημένο όριο Google (το φρένο δίνει μαγαζιά OSM) → αγνοούνται, χωρίς διπλότυπα', async () => {
    const { places, cache } = osmPlaces();
    const hybrid = new HybridPlaces(places, fakeGoogle({ budgetReached: true }).google, cache);
    const venues = await hybrid.searchVenues(C, 'coffee', 300, 20);
    expect(venues).toHaveLength(3);
    expect(venues.some((x) => x.name === 'Εφεδρικό')).toBe(false);
  });
});
