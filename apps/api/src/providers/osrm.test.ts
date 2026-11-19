import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../lib/cache';
import { OSRM_MAX_COORDS, osrmChunks, osrmCoord, osrmProfile, OsrmRouting } from './osrm';
import type { RoutingProvider } from './types';

const A = { lat: 37.9755, lng: 23.7348 };
const B = { lat: 38.0561, lng: 23.8053 };

/** Ψεύτικο OSRM: καταγράφει τα URL και απαντά με διάρκεια = 60·(i+1)·(j+1) s, απόσταση 1000·(j+1) m */
function fakeOsrm(opts: { fail?: boolean; nullCell?: [number, number] } = {}) {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    if (opts.fail) return new Response('down', { status: 503 });
    const u = new URL(url);
    if (u.pathname.includes('/route/')) return Response.json({ code: 'Ok', routes: [{ duration: 600, distance: 4200 }] });
    const sources = u.searchParams.get('sources')!.split(';');
    const dests = u.searchParams.get('destinations')!.split(';');
    const durations = sources.map((_, i) =>
      dests.map((_, j) => (opts.nullCell && opts.nullCell[0] === i && opts.nullCell[1] === j ? null : 60 * (i + 1) * (j + 1))),
    );
    const distances = sources.map(() => dests.map((_, j) => 1000 * (j + 1)));
    return Response.json({ code: 'Ok', durations, distances });
  }) as unknown as typeof fetch;
  return { urls, fetchImpl };
}

describe('OSRM — βοηθητικά', () => {
  it('συντεταγμένες «lon,lat» (ανάποδα από το Google)', () => {
    expect(osrmCoord(A)).toBe('23.734800,37.975500');
  });

  it('προφίλ: αυτοκίνητο/ταξί/μηχανή → car · πόδια → foot · ποδήλατο → bike · συγκοινωνίες → κανένα', () => {
    expect(osrmProfile('car')).toBe('car');
    expect(osrmProfile('taxi')).toBe('car');
    expect(osrmProfile('motorbike')).toBe('car');
    expect(osrmProfile('walk')).toBe('foot');
    expect(osrmProfile('bike')).toBe('bike');
    expect(osrmProfile('transit')).toBeNull();
  });

  it('κομμάτια: κάθε κλήση ≤ 100 συντεταγμένες και καλύπτονται όλα τα ζεύγη', () => {
    for (const [no, nd] of [
      [3, 5],
      [4, 250],
      [120, 30],
    ] as const) {
      const chunks = osrmChunks(no, nd);
      const covered = new Set<string>();
      for (const c of chunks) {
        expect(c.o[1] - c.o[0] + (c.d[1] - c.d[0])).toBeLessThanOrEqual(OSRM_MAX_COORDS);
        for (let o = c.o[0]; o < c.o[1]; o++) for (let d = c.d[0]; d < c.d[1]; d++) covered.add(`${o}:${d}`);
      }
      expect(covered.size).toBe(no * nd);
    }
    expect(osrmChunks(3, 5)).toHaveLength(1);
  });
});

describe('OsrmRouting', () => {
  it('matrix: σωστό URL (προφίλ, lon,lat, sources/destinations) και χρόνοι σε λεπτά', async () => {
    const net = fakeOsrm();
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', net.fetchImpl);
    const m = await r.matrix([A, B], [B], 'walk');
    expect(net.urls).toHaveLength(1);
    expect(net.urls[0]).toBe(
      'https://osrm.test/routed-foot/table/v1/driving/23.734800,37.975500;23.805300,38.056100;23.805300,38.056100' +
        '?sources=0;1&destinations=2&annotations=duration,distance',
    );
    expect(m[0]![0]).toEqual({ durationMin: 1, distanceKm: 1 });
    expect(m[1]![0]).toEqual({ durationMin: 2, distanceKm: 1 });
  });

  it('matrix: πολλοί προορισμοί → πολλές κλήσεις ≤ 100 συντεταγμένες, σωστή θέση κάθε κελιού', async () => {
    const net = fakeOsrm();
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', net.fetchImpl);
    const dests = Array.from({ length: 150 }, (_, i) => ({ lat: 37.9 + i * 0.001, lng: 23.7 }));
    const m = await r.matrix([A, B], dests, 'car');
    expect(net.urls.length).toBe(2);
    for (const u of net.urls) expect(new URL(u).pathname.split('/').pop()!.split(';').length).toBeLessThanOrEqual(100);
    // 2ος προορισμός του 2ου κομματιού (θέση 99): j = 1 μέσα στο κομμάτι → απόσταση 2 km
    expect(m[0]![99]).toEqual({ durationMin: 2, distanceKm: 2 });
    expect(m[1]![149]!.durationMin).toBeGreaterThan(0);
  });

  it('matrix: null όπου δεν υπάρχει διαδρομή', async () => {
    const net = fakeOsrm({ nullCell: [1, 0] });
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', net.fetchImpl);
    const m = await r.matrix([A, B], [B], 'car');
    expect(m[1]![0]).toBeNull();
    expect(m[0]![0]).not.toBeNull();
  });

  it('matrix: cache 10 λεπτών — η ίδια ερώτηση δεν ξαναπάει στον server', async () => {
    const net = fakeOsrm();
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', net.fetchImpl);
    await r.matrix([A], [B], 'car');
    await r.matrix([A], [B], 'car');
    expect(net.urls).toHaveLength(1);
  });

  it('συγκοινωνίες → στον provider συγκοινωνιών (π.χ. Google), όχι στο OSRM', async () => {
    const net = fakeOsrm();
    const calls: string[] = [];
    const transit: RoutingProvider = {
      matrix: async (o, d) => (calls.push('matrix'), o.map(() => d.map(() => ({ durationMin: 30, distanceKm: 8 })))),
      route: async () => (calls.push('route'), { durationMin: 30, distanceKm: 8, steps: [{ kind: 'metro', durationMin: 20 }] }),
    };
    const r = new OsrmRouting(new MemoryCache(), transit, 'https://osrm.test', net.fetchImpl);
    expect((await r.matrix([A], [B], 'transit'))[0]![0]).toEqual({ durationMin: 30, distanceKm: 8 });
    expect((await r.route(A, B, 'transit'))?.steps).toHaveLength(1);
    expect(calls).toEqual(['matrix', 'route']);
    expect(net.urls).toHaveLength(0);
  });

  it('συγκοινωνίες χωρίς Google → εκτίμηση, σημειωμένη estimated', async () => {
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', fakeOsrm().fetchImpl);
    expect((await r.matrix([A], [B], 'transit'))[0]![0]!.estimated).toBe(true);
    expect((await r.route(A, B, 'transit'))!.estimated).toBe(true);
  });

  it('route: /route/v1 με lon,lat και διάρκεια σε λεπτά', async () => {
    const net = fakeOsrm();
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', net.fetchImpl);
    expect(await r.route(A, B, 'bike')).toEqual({ durationMin: 10, distanceKm: 4.2 });
    expect(net.urls[0]).toBe('https://osrm.test/routed-bike/route/v1/driving/23.734800,37.975500;23.805300,38.056100?overview=false');
  });

  it('αν ο server πέσει → εκτίμηση (ποτέ σφάλμα στον χρήστη)', async () => {
    const r = new OsrmRouting(new MemoryCache(), undefined, 'https://osrm.test', fakeOsrm({ fail: true }).fetchImpl);
    expect((await r.matrix([A], [B], 'car'))[0]![0]!.estimated).toBe(true);
    expect((await r.route(A, B, 'car'))!.estimated).toBe(true);
  });
});
