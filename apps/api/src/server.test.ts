import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AreaVenuesResponse, SuggestionsResponse, VenuePlanResponse } from '@centimeet/shared';
import { loadEnv } from './env';
import { buildServer } from './server';
import { GoogleProvider, MATRIX_MAX_ELEMENTS, mergeWalkSteps } from './providers/google';
import { MemoryCache } from './lib/cache';
import { mergeParking } from './providers/osm';
import { PhotonGeocoder } from './providers/photon';

// Σταθερή «τώρα» (Παρασκευή 20:00 ώρα Ελλάδας): τα tests χωρίς ώρα συνάντησης δεν πρέπει
// να αποτυγχάνουν όταν τρέχουν νύχτα (τα μαγαζιά «κλειστά» → καμία πρόταση).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T18:00:00Z'));
});
afterAll(() => vi.useRealTimers());

const env = loadEnv({ USE_MOCK_PROVIDERS: 'true', REQUIRE_AUTH: 'false', GEOCODER: 'mock' } as NodeJS.ProcessEnv);

// Παρέα 5 ατόμων στην Αθήνα με διαφορετικά μέσα
const participants = [
  { id: 'p1', name: 'Γιώργος', origin: { lat: 38.0736, lng: 23.8114 }, mode: 'car' }, // Κηφισιά
  { id: 'p2', name: 'Μαρία', origin: { lat: 37.9478, lng: 23.6432 }, mode: 'transit' }, // Πειραιάς
  { id: 'p3', name: 'Νίκος', origin: { lat: 37.9655, lng: 23.7247 }, mode: 'walk' }, // Κουκάκι
  { id: 'p4', name: 'Ελένη', origin: { lat: 38.0134, lng: 23.6953 }, mode: 'motorbike' }, // Περιστέρι
  { id: 'p5', name: 'Κώστας', origin: { lat: 37.8636, lng: 23.7536 }, mode: 'taxi' }, // Γλυφάδα
];

describe('API (mock providers)', () => {
  const app = buildServer(env);

  it('GET /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ ok: true, mock: true, costMode: 'lean' });
  });

  it('POST /v1/suggestions (lean): κύριες προτάσεις, εναλλακτικές περιοχές χωρίς μαγαζιά', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suggestions',
      payload: { city: 'athens', activity: 'coffee', participants },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<SuggestionsResponse>();
    expect(body.areas[0]!.isPrimary).toBe(true);
    expect(body.areas[0]!.hasVenues).toBe(true);
    expect(body.areas.length).toBeGreaterThan(1);
    expect(body.areas.slice(1).every((a) => !a.hasVenues && a.travel.length === 5)).toBe(true);
    expect(body.primary.length).toBeGreaterThan(0);
    expect(body.alternatives).toEqual([]);
    for (const s of body.primary) expect(s.travel).toHaveLength(5);
    // ταξινόμηση κατά score
    const scores = body.primary.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('POST /v1/area-venues: «Δες μαγαζιά εδώ» για εναλλακτική περιοχή', async () => {
    const s = await app.inject({ method: 'POST', url: '/v1/suggestions', payload: { city: 'athens', activity: 'coffee', participants } });
    const body = s.json<SuggestionsResponse>();
    const alt = body.areas[1]!;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/area-venues',
      payload: { city: 'athens', activity: 'coffee', participants, area: alt, excludeIds: body.primary.map((v) => v.venue.id) },
    });
    expect(res.statusCode).toBe(200);
    const out = res.json<AreaVenuesResponse>();
    expect(out.area.hasVenues).toBe(true);
    expect(out.area.radiusM).toBeGreaterThan(0);
    expect(out.venues.length).toBeGreaterThan(0);
    expect(out.venues.every((v) => v.areaId === alt.id)).toBe(true);
    const primaryIds = new Set(body.primary.map((v) => v.venue.id));
    expect(out.venues.some((v) => primaryIds.has(v.venue.id))).toBe(false);
  });

  it('growth: εναλλακτικές με μαγαζιά αμέσως', async () => {
    const growth = buildServer(loadEnv({ USE_MOCK_PROVIDERS: 'true', GEOCODER: 'mock', COST_MODE: 'growth' } as NodeJS.ProcessEnv));
    const res = await growth.inject({ method: 'POST', url: '/v1/suggestions', payload: { city: 'athens', activity: 'coffee', participants } });
    const body = res.json<SuggestionsResponse>();
    expect(body.alternatives.length).toBeGreaterThan(0);
    expect(body.areas.every((a) => a.hasVenues)).toBe(true);
  });

  it('όριο αναζητήσεων ανά χρήστη την ημέρα → 429 με φιλικό μήνυμα', async () => {
    const limited = buildServer(loadEnv({ USE_MOCK_PROVIDERS: 'true', GEOCODER: 'mock', USER_DAILY_SEARCHES: '2' } as NodeJS.ProcessEnv));
    const send = () => limited.inject({ method: 'POST', url: '/v1/suggestions', payload: { city: 'athens', activity: 'coffee', participants } });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(200);
    const third = await send();
    expect(third.statusCode).toBe(429);
    expect(third.json().message).toContain('όριο');
  });

  it('απορρίπτει αφετηρία εκτός πόλης', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/suggestions',
      payload: {
        city: 'athens',
        activity: 'food',
        participants: [participants[0], { ...participants[1], origin: { lat: 40.64, lng: 22.94 } }],
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('απορρίπτει λάθος αίτημα', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/suggestions', payload: { city: 'athens' } });
    expect(res.statusCode).toBe(400);
  });

  it('POST /v1/venue-plan δίνει πλάνο ανά άτομο με parking μόνο για οχήματα', async () => {
    const s = await app.inject({
      method: 'POST',
      url: '/v1/suggestions',
      payload: { city: 'athens', activity: 'coffee', participants },
    });
    const venueId = s.json<SuggestionsResponse>().primary[0]!.venue.id;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/venue-plan',
      payload: { city: 'athens', venueId, participants },
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json<VenuePlanResponse>();
    const byId = Object.fromEntries(plan.plans.map((p) => [p.participantId, p]));
    expect(byId.p1!.parking?.length).toBeGreaterThan(0); // αυτοκίνητο
    expect(byId.p2!.parking).toBeUndefined(); // συγκοινωνίες
    expect(byId.p2!.transitSteps?.length).toBeGreaterThan(0);
    expect(byId.p3!.costEur).toBe(0); // περπάτημα
    expect(byId.p5!.costEur).toBeGreaterThan(4); // ταξί από Γλυφάδα
  });
});

describe('GoogleProvider', () => {
  it('σπάει τον πίνακα σε κομμάτια ≤100 στοιχείων και συναρμολογεί σωστά', async () => {
    const calls: number[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body.origins.length * body.destinations.length);
      const els = [];
      for (let o = 0; o < body.origins.length; o++)
        for (let d = 0; d < body.destinations.length; d++)
          els.push({
            originIndex: o,
            destinationIndex: d,
            condition: 'ROUTE_EXISTS',
            duration: `${(o + 1) * 60}s`,
            distanceMeters: body.destinations[d].waypoint.location.latLng.longitude * 1000,
          });
      return new Response(JSON.stringify(els), { status: 200 });
    }) as unknown as typeof fetch;

    const g = new GoogleProvider('k', new MemoryCache(), fakeFetch);
    const origins = Array.from({ length: 6 }, (_, i) => ({ lat: 37.9 + i * 0.01, lng: 23.7 }));
    const dests = Array.from({ length: 40 }, (_, i) => ({ lat: 37.95, lng: i }));
    const m = await g.matrix(origins, dests, 'transit');

    expect(calls.every((c) => c <= MATRIX_MAX_ELEMENTS)).toBe(true);
    expect(m).toHaveLength(6);
    expect(m[5]![39]).toEqual({ durationMin: 6, distanceKm: 39 });
  });

  /** Καταγράφει τα requests προς το Google και απαντά με το `reply` */
  const recorder = (reply: unknown) => {
    const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify(reply), { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, g: new GoogleProvider('k', new MemoryCache(), fetchImpl) };
  };
  const inTwoDays = new Date(Date.now() + 2 * 24 * 3600_000);
  const A = { lat: 37.97, lng: 23.73 };
  const B = { lat: 38.07, lng: 23.81 };

  it('χρονισμός & κίνηση ανά μέσο (καθορίζει και τη χρέωση)', () => {
    const { g } = recorder([]);
    expect(g.timing('car', { departAt: inTwoDays })).toEqual({
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      trafficModel: 'PESSIMISTIC',
      departureTime: inTwoDays.toISOString(),
    });
    expect(g.timing('car')).toEqual({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
    expect(g.timing('motorbike', { departAt: inTwoDays }).travelMode).toBe('DRIVE'); // όχι TWO_WHEELER (Enterprise)
    expect(g.timing('transit', { arriveBy: inTwoDays })).toEqual({ travelMode: 'TRANSIT', arrivalTime: inTwoDays.toISOString() });
    expect(g.timing('walk', { departAt: inTwoDays })).toEqual({ travelMode: 'WALK' });
    // Ώρα στο παρελθόν → σαν «τώρα» (το Google απορρίπτει παλιές ώρες)
    expect(g.timing('car', { departAt: new Date(Date.now() - 3600_000) })).toEqual({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
  });

  it('αναζήτηση μαγαζιών: σωστά πεδία, ακτίνα, και αντιστοίχιση ωραρίου/τηλεφώνου/παρέας', async () => {
    const { g, calls } = recorder({
      places: [
        {
          id: 'ChIJ1',
          displayName: { text: 'Καφέ Α' },
          location: { latitude: 37.971, longitude: 23.731 },
          rating: 4.6,
          userRatingCount: 1200,
          priceLevel: 'PRICE_LEVEL_MODERATE',
          regularOpeningHours: { periods: [{ open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }] },
          businessStatus: 'OPERATIONAL',
          nationalPhoneNumber: '210 1234567',
          reservable: true,
          goodForGroups: false,
        },
      ],
    });
    const [v] = await g.searchVenues(A, 'coffee', 300, 20);
    const mask = calls[0]!.headers['X-Goog-FieldMask']!;
    for (const f of ['rating', 'userRatingCount', 'regularOpeningHours.periods', 'nationalPhoneNumber', 'goodForGroups', 'reservable', 'businessStatus']) {
      expect(mask).toContain(`places.${f}`);
    }
    expect(calls[0]!.body).toMatchObject({ includedTypes: ['cafe', 'coffee_shop'], locationRestriction: { circle: { radius: 300 } } });
    expect(v).toMatchObject({ id: 'ChIJ1', rating: 4.6, ratingCount: 1200, priceLevel: 2, phone: '210 1234567', reservable: true, goodForGroups: false });
    expect(v!.openingPeriods).toHaveLength(1);
  });

  it('διαδρομή αυτοκινήτου: ζητά διόδια και τα διαβάζει σε €', async () => {
    const { g, calls } = recorder({
      routes: [{ duration: '1500s', distanceMeters: 18000, travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: 'EUR', units: '2', nanos: 800000000 }] } } }],
    });
    const r = await g.route(B, A, 'car', { departAt: inTwoDays });
    expect(calls[0]!.body.extraComputations).toEqual(['TOLLS']);
    expect(calls[0]!.headers['X-Goog-FieldMask']).toContain('routes.travelAdvisory.tollInfo');
    expect(r).toMatchObject({ durationMin: 25, distanceKm: 18, tollEur: 2.8 });
  });

  it('ενώνει διαδοχικά βήματα περπατήματος', () => {
    expect(
      mergeWalkSteps([
        { kind: 'walk', durationMin: 2 },
        { kind: 'walk', durationMin: 3 },
        { kind: 'metro', line: 'M1', durationMin: 10 },
      ]),
    ).toEqual([
      { kind: 'walk', durationMin: 5 },
      { kind: 'metro', line: 'M1', durationMin: 10 },
    ]);
  });
});

describe('διευθύνσεις', () => {
  const app = buildServer(env);

  it('autocomplete επιστρέφει κύριο + δευτερεύον κείμενο', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/autocomplete?q=Ερμού&city=athens' });
    expect(res.json().suggestions[0]).toMatchObject({ mainText: 'Ερμού' });
  });

  it('reverse δίνει διεύθυνση και κρατά την ακριβή θέση του pin', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/reverse?lat=37.97&lng=23.73' });
    expect(res.statusCode).toBe(200);
    expect(res.json().location).toEqual({ lat: 37.97, lng: 23.73 });
  });

  it('reverse απορρίπτει άκυρες συντεταγμένες', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/reverse?lat=999&lng=0' });
    expect(res.statusCode).toBe(400);
  });

  it('δέχεται μεγάλα ids (Photon με ελληνική ετικέτα) — όχι 414', async () => {
    const id = encodeURIComponent(`photon:37.974425,23.735410:${'Wy'.padEnd(300, 'x')}`);
    const res = await app.inject({ method: 'GET', url: `/v1/places/${id}` });
    expect(res.statusCode).not.toBe(414);
  });
});

describe('δημοφιλή μαγαζιά («Διαλέγω εγώ το μέρος»)', () => {
  const app = buildServer(env);

  it('επιστρέφει κατάταξη μαγαζιών της κατηγορίας', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/popular?city=athens&activity=food&category=pizza' });
    expect(res.statusCode).toBe(200);
    const { venues } = res.json();
    expect(venues.length).toBeGreaterThan(0);
    expect(venues.length).toBeLessThanOrEqual(10);
  });

  it('απορρίπτει κατηγορία άλλης δραστηριότητας', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/popular?city=athens&activity=coffee&category=pizza' });
    expect(res.statusCode).toBe(400);
  });
});

describe('PhotonGeocoder', () => {
  const feature = (props: Record<string, unknown>, lon = 23.7303, lat = 37.9763) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: props,
  });
  const fakeFetch = (features: unknown[], seen?: string[]) =>
    (async (url: string) => {
      seen?.push(url);
      return new Response(JSON.stringify({ type: 'FeatureCollection', features }), { status: 200 });
    }) as unknown as typeof fetch;

  it('μορφοποιεί διευθύνσεις, πετάει εκτός Ελλάδας και διπλότυπα', async () => {
    const urls: string[] = [];
    const g = new PhotonGeocoder(
      new MemoryCache(),
      'https://photon.test',
      fakeFetch(
        [
          feature({ osm_key: 'place', osm_value: 'house', street: 'Ερμού', housenumber: '10', postcode: '105 63', city: 'Αθήνα', district: 'Σύνταγμα', countrycode: 'GR' }),
          feature({ osm_key: 'place', osm_value: 'house', street: 'Ερμού', housenumber: '10', postcode: '105 63', city: 'Αθήνα', district: 'Σύνταγμα', countrycode: 'GR' }),
          feature({ name: 'Ερμού', city: 'Λευκωσία', countrycode: 'CY' }),
          feature({ osm_key: 'amenity', osm_value: 'cafe', name: 'Café Ερμού', street: 'Ερμού', housenumber: '2', city: 'Αθήνα', countrycode: 'GR' }),
        ],
        urls,
      ),
    );
    const res = await g.autocomplete('Ερμού', { lat: 37.98, lng: 23.72 });
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ mainText: 'Ερμού 10', secondaryText: 'Σύνταγμα, Αθήνα, 105 63' });
    expect(res[1]).toMatchObject({ mainText: 'Café Ερμού', secondaryText: 'Ερμού 2, Αθήνα' });
    expect(urls[0]).toContain('lat=37.98');

    // Το placeId περιέχει τις συντεταγμένες → resolve χωρίς δεύτερη κλήση
    const place = await g.resolvePlace(res[0]!.placeId);
    expect(place?.location).toEqual({ lat: 37.9763, lng: 23.7303 });
    expect(place?.name).toBe('Ερμού 10');
    expect(urls).toHaveLength(1);
  });

  it('reverse κρατά τη θέση του pin', async () => {
    const g = new PhotonGeocoder(
      new MemoryCache(),
      'https://photon.test',
      fakeFetch([feature({ osm_key: 'place', osm_value: 'house', street: 'Μητροπόλεως', housenumber: '3', city: 'Αθήνα' })]),
    );
    const r = await g.reverse({ lat: 37.975, lng: 23.731 });
    expect(r?.name).toBe('Μητροπόλεως 3');
    expect(r?.location).toEqual({ lat: 37.975, lng: 23.731 });
  });
});

describe('mergeParking', () => {
  it('πετάει διπλότυπα και κρατά τον πιο συγκεκριμένο τύπο', () => {
    const loc = { lat: 37.97, lng: 23.73 };
    const merged = mergeParking([
      [{ id: 'g1', name: 'Parking Α', location: loc, walkMin: 3, kind: 'unknown', source: 'google' }],
      [{ id: 'o1', name: 'Parking', location: { lat: 37.97001, lng: 23.73001 }, walkMin: 3, kind: 'private', source: 'osm' }],
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe('Parking Α');
    expect(merged[0]!.kind).toBe('private');
  });
});
