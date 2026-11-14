/**
 * Δωρεάν αναζήτηση διευθύνσεων με Photon (OpenStreetMap) — χωρίς κλειδί.
 * Χρησιμοποιείται όταν δεν υπάρχει κλειδί Google (ανάπτυξη / δοκιμές).
 *
 * ⚠️ Το δημόσιο photon.komoot.io είναι για λογικό όγκο αιτημάτων, χωρίς εγγυήσεις.
 *    Στην παραγωγή: Google (ήδη υλοποιημένο) ή δικός σας Photon server (PHOTON_URL).
 */
import type { LatLng, PlaceSuggestion, ResolvedPlace } from '@centimeet/shared';
import { cached, geoKey, type Cache } from '../lib/cache';
import type { Geocoder } from './types';

type PhotonFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lon, lat]
  properties: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    locality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
  };
};

/** Μορφή placeId: photon:<lat>,<lng>:<base64url(label)> — περιέχει ό,τι χρειάζεται, χωρίς δεύτερη κλήση */
export function encodePhotonId(loc: LatLng, main: string, secondary?: string): string {
  const label = Buffer.from(JSON.stringify([main, secondary ?? ''])).toString('base64url');
  return `photon:${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}:${label}`;
}

export function decodePhotonId(id: string): ResolvedPlace | null {
  const m = /^photon:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?):(.+)$/.exec(id);
  if (!m) return null;
  try {
    const [main, secondary] = JSON.parse(Buffer.from(m[3]!, 'base64url').toString()) as [string, string];
    return {
      placeId: id,
      name: main,
      address: [main, secondary].filter(Boolean).join(', '),
      location: { lat: Number(m[1]), lng: Number(m[2]) },
    };
  } catch {
    return null;
  }
}

/** «Ερμού 10» / «Πλατεία Συντάγματος» + «Σύνταγμα, Αθήνα 105 63» */
export function formatPhoton(p: PhotonFeature['properties']): { main: string; secondary?: string } {
  const streetLine = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : undefined;
  const isAddress = p.osm_key === 'place' && p.osm_value === 'house';
  const main = (isAddress ? streetLine : p.name) ?? streetLine ?? p.name ?? p.city ?? '—';
  const area = [p.district ?? p.locality, p.city ?? p.county, p.postcode].filter(Boolean);
  const secondary = [main !== streetLine ? streetLine : undefined, ...area]
    .filter((x, i, arr) => x && x !== main && arr.indexOf(x) === i)
    .join(', ');
  return { main, secondary: secondary || undefined };
}

export class PhotonGeocoder implements Geocoder {
  constructor(
    private cache: Cache,
    private baseUrl = 'https://photon.komoot.io',
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<PhotonFeature[]> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': 'CentiMeet/0.1 (dev)', 'Accept-Language': 'el' },
    });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return data.features ?? [];
  }

  private toPlace(f: PhotonFeature): ResolvedPlace & { secondary?: string } {
    const [lng, lat] = f.geometry.coordinates;
    const { main, secondary } = formatPhoton(f.properties);
    const location = { lat, lng };
    return {
      placeId: encodePhotonId(location, main, secondary),
      name: main,
      address: [main, secondary].filter(Boolean).join(', '),
      location,
      secondary,
    };
  }

  async autocomplete(input: string, bias: LatLng): Promise<PlaceSuggestion[]> {
    const key = `photon:ac:${input.toLowerCase()}:${geoKey(bias.lat, bias.lng)}`;
    return cached(this.cache, key, 60 * 60, async () => {
      const features = await this.get('/api', {
        q: input,
        lat: String(bias.lat),
        lon: String(bias.lng),
        zoom: '11',
        location_bias_scale: '0.6',
        limit: '8',
        // Ελλάδα (περίπου) – για να μη βγάζει «Ερμού» στην Κύπρο
        bbox: '19.3,34.7,29.7,41.8',
      });
      const seen = new Set<string>();
      return features
        .filter((f) => !f.properties.countrycode || f.properties.countrycode.toUpperCase() === 'GR')
        .map((f) => this.toPlace(f))
        .filter((p) => {
          const k = `${p.name}|${p.secondary}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 6)
        .map((p) => ({ placeId: p.placeId, mainText: p.name, secondaryText: p.secondary }));
    });
  }

  async resolvePlace(placeId: string): Promise<ResolvedPlace | null> {
    return decodePhotonId(placeId);
  }

  async reverse(location: LatLng): Promise<ResolvedPlace | null> {
    const key = `photon:rev:${geoKey(location.lat, location.lng)}`;
    return cached(this.cache, key, 24 * 60 * 60, async () => {
      const [f] = await this.get('/reverse', {
        lat: String(location.lat),
        lon: String(location.lng),
        radius: '0.3',
        limit: '1',
      });
      if (!f) return null;
      const p = this.toPlace(f);
      // Κρατάμε την ακριβή θέση του pin, όχι του κοντινότερου κτιρίου
      return { placeId: encodePhotonId(location, p.name, p.secondary), name: p.name, address: p.address, location };
    });
  }
}
