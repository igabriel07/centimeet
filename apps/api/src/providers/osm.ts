/**
 * Δωρεάν πηγή για parking: OpenStreetMap μέσω Overpass API.
 * Συμπληρώνει το Google με πληροφορία δημόσιο/ιδιωτικό/υπόγειο.
 */
import type { LatLng, ParkingOption } from '@centimeet/shared';
import { cached, geoKey, type Cache } from '../lib/cache';
import { walkMinutes } from './google';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

type OsmEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export async function osmParking(
  center: LatLng,
  radiusM: number,
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
): Promise<ParkingOption[]> {
  const key = `parking:osm:${geoKey(center.lat, center.lng)}:${radiusM}`;
  return cached(cache, key, 24 * 60 * 60, async () => {
    const q = `[out:json][timeout:10];nwr(around:${radiusM},${center.lat},${center.lng})[amenity=parking];out center 25;`;
    const res = await fetchImpl(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CentiMeet/0.1' },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements?: OsmEl[] };
    return (data.elements ?? [])
      .map((e): ParkingOption | null => {
        const lat = e.lat ?? e.center?.lat;
        const lng = e.lon ?? e.center?.lon;
        if (lat == null || lng == null) return null;
        const t = e.tags ?? {};
        if (t.access === 'private' || t.access === 'customers') return null; // όχι για το κοινό
        const loc = { lat, lng };
        return {
          id: `osm:${e.type}/${e.id}`,
          name: t.name ?? parkingLabel(t),
          location: loc,
          walkMin: walkMinutes(center, loc),
          kind: parkingKind(t),
          source: 'osm',
        };
      })
      .filter((p): p is ParkingOption => p !== null);
  });
}

function parkingKind(t: Record<string, string>): ParkingOption['kind'] {
  if (t.parking === 'street_side' || t.parking === 'lane' || t.parking === 'on_street') return 'street';
  if (t.fee === 'yes' || t.operator) return 'private';
  if (t.fee === 'no' || t.access === 'yes') return 'public';
  return 'unknown';
}

function parkingLabel(t: Record<string, string>): string {
  if (t.parking === 'underground') return 'Υπόγειο parking';
  if (t.parking === 'multi-storey') return 'Πολυώροφο parking';
  if (t.parking === 'street_side' || t.parking === 'lane') return 'Θέσεις στον δρόμο';
  return 'Parking';
}

/** Ενώνει Google + OSM, πετάει διπλότυπα (<40 m), ταξινομεί κατά απόσταση */
export function mergeParking(lists: ParkingOption[][], limit = 5): ParkingOption[] {
  const all = lists.flat().sort((a, b) => a.walkMin - b.walkMin);
  const out: ParkingOption[] = [];
  for (const p of all) {
    const dup = out.find(
      (o) => Math.abs(o.location.lat - p.location.lat) < 0.00036 && Math.abs(o.location.lng - p.location.lng) < 0.00045,
    );
    if (dup) {
      // Κρατάμε το όνομα του Google αλλά τον τύπο του OSM αν είναι πιο συγκεκριμένος
      if (dup.kind === 'unknown' && p.kind !== 'unknown') dup.kind = p.kind;
      continue;
    }
    out.push({ ...p });
    if (out.length >= limit) break;
  }
  return out;
}
