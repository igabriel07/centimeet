/**
 * Δωρεάν πηγή OpenStreetMap μέσω Overpass API:
 *  - parking (συμπληρώνει το Google με πληροφορία δημόσιο/ιδιωτικό/υπόγειο)
 *  - μαγαζιά: κύρια πηγή με VENUES_PROVIDER=osm/hybrid, ή εφεδρική όταν εξαντληθεί το δωρεάν όριο Google
 *    (χωρίς βαθμολογίες — προτιμώνται όσα έχουν ωράριο / website / τηλέφωνο).
 * ⚠️ Τα δεδομένα απαιτούν «© OpenStreetMap contributors» (ODbL) — βλ. Venue.fromOsm.
 */
import type { ActivityCategory, LatLng, ParkingOption, Venue, VenueActivity } from '@centimeet/shared';
import { ACTIVITY_OSM, CATEGORY_OSM } from './categories';
import { cached, geoKey, type Cache } from '../lib/cache';
import { haversineKm, walkMinutes } from '@centimeet/shared';

/** Δημόσιος server: μόνο για ανάπτυξη — στην παραγωγή OVERPASS_URL σε δικό μας */
export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export type OsmEl = {
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
  overpassUrl = DEFAULT_OVERPASS_URL,
): Promise<ParkingOption[]> {
  const key = `parking:osm:${geoKey(center.lat, center.lng)}:${radiusM}`;
  return cached(cache, key, 24 * 60 * 60, async () => {
    const q = `[out:json][timeout:10];nwr(around:${radiusM},${center.lat},${center.lng})[amenity=parking];out center 25;`;
    const data = await overpass(q, fetchImpl, overpassUrl);
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


/** Ο server είναι απασχολημένος (ο δημόσιος συχνά) → αξίζει μία ακόμη προσπάθεια */
const BUSY = new Set([429, 502, 503, 504]);

/**
 * Ένα ερώτημα Overpass (POST). Αποτυχία → σφάλμα (ΟΧΙ κενό αποτέλεσμα), ώστε να μη μπει στην cache:
 * αλλιώς μια στιγμιαία υπερφόρτωση θα «έκρυβε» τα μαγαζιά μιας περιοχής για 24 ώρες.
 */
async function overpass(q: string, fetchImpl: typeof fetch, url: string, retryDelayMs = 1000): Promise<{ elements?: OsmEl[] }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'CentiMeet/0.1' },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (res.ok) return (await res.json()) as { elements?: OsmEl[] };
    if (attempt >= 1 || !BUSY.has(res.status)) throw new Error(`Overpass ${res.status}`);
    await new Promise((r) => setTimeout(r, retryDelayMs));
  }
}

/** «Πληρότητα» μαγαζιού OSM χωρίς βαθμολογίες: ωράριο / website / τηλέφωνο → πιθανότατα ενεργό */
export function osmRichness(t: Record<string, string>): number {
  return (
    (t.opening_hours ? 1 : 0) +
    (t.website || t['contact:website'] ? 1 : 0) +
    (t.phone || t['contact:phone'] ? 1 : 0)
  );
}

/** Στοιχείο OSM → Venue (μόνο με όνομα) */
export function osmToVenue(e: OsmEl): Venue | null {
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  const t = e.tags ?? {};
  if (lat == null || lng == null || !t.name) return null;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `osm:${e.type}/${e.id}`,
    name: t['name:el'] ?? t.name,
    location: { lat, lng },
    address: street || undefined,
    phone: t.phone ?? t['contact:phone'],
    source: 'osm',
    fromOsm: true,
  };
}

/** Μαγαζιά από OSM: όνομα, θέση, τηλέφωνο — χωρίς βαθμολογίες/ωράρια */
export async function osmVenues(
  center: LatLng,
  activity: VenueActivity,
  radiusM: number,
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
  category?: ActivityCategory,
  overpassUrl = DEFAULT_OVERPASS_URL,
): Promise<Venue[]> {
  if (category) {
    // Οι ετικέτες cuisine κ.λπ. λείπουν συχνά στο OSM → αν η κατηγορία δεν βρει τίποτα, όλη η δραστηριότητα
    const byCategory = await overpassVenues(center, CATEGORY_OSM[category], `${activity}:${category}`, radiusM, cache, fetchImpl, overpassUrl);
    if (byCategory.length > 0) return byCategory;
  }
  return overpassVenues(center, ACTIVITY_OSM[activity], activity, radiusM, cache, fetchImpl, overpassUrl);
}

async function overpassVenues(
  center: LatLng,
  filters: string[],
  cacheTag: string,
  radiusM: number,
  cache: Cache,
  fetchImpl: typeof fetch,
  overpassUrl: string,
): Promise<Venue[]> {
  const key = `venues:osm:${cacheTag}:${geoKey(center.lat, center.lng)}:${radiusM}`;
  return cached(cache, key, 24 * 60 * 60, async () => {
    const around = `(around:${radiusM},${center.lat},${center.lng})`;
    const q = `[out:json][timeout:10];(${filters.map((f) => `nwr${around}${f}[name];`).join('')});out center 60;`;
    const data = await overpass(q, fetchImpl, overpassUrl);
    // Πρώτα όσα έχουν ωράριο / website / τηλέφωνο, μετά τα πιο κοντινά
    return (data.elements ?? [])
      .map((e) => ({ v: osmToVenue(e), rich: osmRichness(e.tags ?? {}) }))
      .filter((x): x is { v: Venue; rich: number } => x.v !== null)
      .sort((a, b) => b.rich - a.rich || haversineKm(center, a.v.location) - haversineKm(center, b.v.location))
      .map((x) => x.v);
  });
}

/** Ένα μαγαζί με το id του («osm:node/123»), για το πλάνο όταν δεν είναι στην cache */
export async function osmVenueById(
  id: string,
  cache: Cache,
  fetchImpl: typeof fetch = fetch,
  overpassUrl = DEFAULT_OVERPASS_URL,
): Promise<Venue | null> {
  const m = /^osm:(node|way|relation)\/(\d+)$/.exec(id);
  if (!m) return null;
  return cached(cache, `venue:${id}`, 24 * 60 * 60, async () => {
    const data = await overpass(`[out:json][timeout:10];${m[1]}(${m[2]});out center tags;`, fetchImpl, overpassUrl);
    const el = data.elements?.[0];
    return el ? osmToVenue(el) : null;
  });
}
