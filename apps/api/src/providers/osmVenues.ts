/**
 * Μαγαζιά χωρίς (ή με λίγο) Google:
 *
 *  - OsmPlaces   (VENUES_PROVIDER=osm): μαγαζιά & parking από Overpass, διευθύνσεις από τον geocoder (Photon).
 *                 Εντελώς δωρεάν, χωρίς βαθμολογίες.
 *  - HybridPlaces (VENUES_PROVIDER=hybrid): υποψήφια από OSM + ΜΙΑ κλήση Google Nearby Search ανά περιοχή
 *                 για βαθμολογίες, αντιστοιχισμένες με όνομα & απόσταση (< 60 m).
 *
 * 💶 Κόστος hybrid ανά αναζήτηση: όσο το `google` — 1 Nearby Search Enterprise (+1 αν μεγαλώσει η ακτίνα),
 *    $35/1000 με 1.000 δωρεάν/μήνα, πίσω από το φρένο κόστους (GuardedProvider).
 *    Τα αποτελέσματα αντιστοίχισης κρατιούνται 7 ημέρες ανά μαγαζί OSM: αν όλα τα μαγαζιά μιας
 *    περιοχής είναι ήδη γνωστά, ΔΕΝ γίνεται καμία κλήση Google (€0).
 *    (Η εναλλακτική «ένα Text Search ανά μαγαζί» θα κόστιζε 6–9 κλήσεις ανά αναζήτηση.)
 *    Αν το Google αποτύχει ή εξαντληθεί το όριο → συνεχίζουμε με τα OSM χωρίς βαθμολογία.
 */
import { haversineKm, type ActivityCategory, type LatLng, type ParkingOption, type Venue, type VenueActivity } from '@centimeet/shared';
import type { Cache } from '../lib/cache';
import { DEFAULT_OVERPASS_URL, osmParking, osmVenueById, osmVenues } from './osm';
import type { Geocoder, PlacesProvider } from './types';

export class OsmPlaces implements PlacesProvider {
  constructor(
    private cache: Cache,
    private geocoder: Geocoder,
    private overpassUrl = DEFAULT_OVERPASS_URL,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async searchVenues(center: LatLng, activity: VenueActivity, radiusM: number, max: number, category?: ActivityCategory): Promise<Venue[]> {
    const venues = (await osmVenues(center, activity, radiusM, this.cache, this.fetchImpl, category, this.overpassUrl).catch(() => [])).slice(0, max);
    // Το πλάνο (getVenue) τα βρίσκει εδώ χωρίς νέο Overpass
    await Promise.all(venues.map((v) => this.cache.set(`venue:${v.id}`, v, 24 * 60 * 60)));
    return venues;
  }

  async getVenue(placeId: string): Promise<Venue | null> {
    const hit = await this.cache.get<Venue>(`venue:${placeId}`);
    if (hit) return hit;
    return osmVenueById(placeId, this.cache, this.fetchImpl, this.overpassUrl).catch(() => null);
  }

  searchParking(center: LatLng, radiusM: number): Promise<ParkingOption[]> {
    return osmParking(center, radiusM, this.cache, this.fetchImpl, this.overpassUrl).catch(() => []);
  }

  autocomplete(input: string, bias: LatLng, sessionToken?: string) {
    return this.geocoder.autocomplete(input, bias, sessionToken);
  }
  resolvePlace(placeId: string, sessionToken?: string) {
    return this.geocoder.resolvePlace(placeId, sessionToken);
  }
  reverse(location: LatLng) {
    return this.geocoder.reverse(location);
  }
}

/** Μέγιστη απόσταση για να θεωρηθούν ίδιο μαγαζί OSM & Google */
export const MATCH_METERS = 60;
/** Πόσο κρατάμε την αντιστοίχιση OSM → Google (βαθμολογία κ.λπ.) */
export const ENRICH_TTL_SEC = 7 * 24 * 60 * 60;

/** «Καφέ Μέση» / «CAFÉ ΜΕΣΗ» → «καφεμεση»: πεζά, χωρίς τόνους & σύμβολα */
export function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Ίδιο μαγαζί; θέση < 60 m και όνομα που ταιριάζει (το ένα περιέχει το άλλο) */
export function sameVenue(a: Venue, b: Venue): boolean {
  if (haversineKm(a.location, b.location) * 1000 > MATCH_METERS) return false;
  const x = normName(a.name);
  const y = normName(b.name);
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
}

/** Τα στοιχεία Google που κρατάμε πάνω στο μαγαζί OSM */
type Enrichment = Pick<Venue, 'rating' | 'ratingCount' | 'priceLevel' | 'openingPeriods' | 'businessStatus' | 'reservable' | 'goodForGroups'> & {
  googleId: string;
  phone?: string;
};
/** null = ψάξαμε και δεν βρέθηκε στο Google (επίσης κρατιέται, για να μην ξαναπληρώσουμε) */
type CachedEnrichment = Enrichment | null;

function enrich(osm: Venue, e: Enrichment): Venue {
  return {
    ...osm,
    rating: e.rating,
    ratingCount: e.ratingCount,
    priceLevel: e.priceLevel,
    openingPeriods: e.openingPeriods,
    businessStatus: e.businessStatus,
    reservable: e.reservable,
    goodForGroups: e.goodForGroups,
    phone: osm.phone ?? e.phone,
    source: 'google', // έχει βαθμολογίες
    fromOsm: true, // όνομα & θέση από OSM → attribution
  };
}

const toEnrichment = (g: Venue): Enrichment => ({
  googleId: g.id,
  rating: g.rating,
  ratingCount: g.ratingCount,
  priceLevel: g.priceLevel,
  openingPeriods: g.openingPeriods,
  businessStatus: g.businessStatus,
  reservable: g.reservable,
  goodForGroups: g.goodForGroups,
  phone: g.phone,
});

export class HybridPlaces implements PlacesProvider {
  constructor(
    private osm: OsmPlaces,
    /** Google πίσω από το φρένο κόστους (GuardedProvider) — στο όριο επιστρέφει μαγαζιά OSM, που αγνοούνται */
    private google: PlacesProvider,
    private cache: Cache,
    private log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
  ) {}

  async searchVenues(center: LatLng, activity: VenueActivity, radiusM: number, max: number, category?: ActivityCategory): Promise<Venue[]> {
    const osm = await this.osm.searchVenues(center, activity, radiusM, max, category);
    const known = await Promise.all(osm.map((v) => this.cache.get<CachedEnrichment>(`enrich:${v.id}`)));

    // Όλα ήδη γνωστά (με ή χωρίς αντιστοίχιση) → καμία κλήση Google
    let google: Venue[] = [];
    if (osm.length === 0 || known.some((k) => k === undefined)) {
      try {
        google = (await this.google.searchVenues(center, activity, radiusM, 20, category)).filter((v) => v.source !== 'osm');
      } catch (e) {
        this.log('hybrid: google enrichment failed → OSM only', { err: String(e) });
      }
    }

    const usedGoogle = new Set<string>();
    const out: Venue[] = [];
    for (let i = 0; i < osm.length; i++) {
      const v = osm[i]!;
      let e = known[i];
      if (e === undefined && google.length) {
        const g = google.find((x) => !usedGoogle.has(x.id) && sameVenue(v, x));
        e = g ? toEnrichment(g) : null;
        await this.cache.set(`enrich:${v.id}`, e, ENRICH_TTL_SEC);
      }
      if (e) usedGoogle.add(e.googleId);
      out.push(e ? enrich(v, e) : v);
    }
    // Μαγαζιά που έχει μόνο το Google (λείπουν από το OSM): δωρεάν προσθήκη, ήρθαν με την ίδια κλήση
    for (const g of google) if (!usedGoogle.has(g.id) && !out.some((v) => sameVenue(v, g))) out.push(g);

    await Promise.all(out.map((v) => this.cache.set(`venue:${v.id}`, v, 24 * 60 * 60)));
    return out.slice(0, Math.max(max, osm.length));
  }

  async getVenue(placeId: string): Promise<Venue | null> {
    const hit = await this.cache.get<Venue>(`venue:${placeId}`);
    if (hit) return hit;
    if (!placeId.startsWith('osm:')) return this.google.getVenue(placeId);
    const v = await this.osm.getVenue(placeId);
    if (!v) return null;
    const e = await this.cache.get<CachedEnrichment>(`enrich:${placeId}`);
    return e ? enrich(v, e) : v;
  }

  searchParking(center: LatLng, radiusM: number): Promise<ParkingOption[]> {
    return this.osm.searchParking(center, radiusM);
  }
  autocomplete(input: string, bias: LatLng, sessionToken?: string) {
    return this.osm.autocomplete(input, bias, sessionToken);
  }
  resolvePlace(placeId: string, sessionToken?: string) {
    return this.osm.resolvePlace(placeId, sessionToken);
  }
  reverse(location: LatLng) {
    return this.osm.reverse(location);
  }
}
