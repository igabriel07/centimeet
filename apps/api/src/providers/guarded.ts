/**
 * Google με «φρένο» κόστους: πριν από κάθε χρεώσιμη κλήση ρωτά τον μετρητή χρήσης.
 * Αν δεν χωράει στο μηνιαίο όριο (κάτω από το δωρεάν του Google), χρησιμοποιεί δωρεάν εφεδρική πηγή:
 *  - χρόνοι → εκτίμηση απόστασης (σημειώνονται `estimated`)
 *  - μαγαζιά → OpenStreetMap (χωρίς βαθμολογίες)
 *  - parking → μόνο OpenStreetMap
 * Αν το Google αποτύχει (π.χ. quota από την κονσόλα), πάλι εφεδρική πηγή αντί για σφάλμα.
 */
import type { ActivityCategory, LatLng, ParkingOption, TransportMode, Venue, VenueActivity } from '@centimeet/shared';
import type { Cache } from '../lib/cache';
import type { GoogleSku, UsageGuard } from '../lib/usage';
import { usesTextSearch } from './categories';
import { EstimateRouting } from './estimate';
import { routesTier, type GoogleProvider } from './google';
import { osmParking, osmVenues } from './osm';
import type { Geocoder, MatrixCell, PlacesProvider, RouteTiming, RoutingProvider } from './types';

export class GuardedProvider implements PlacesProvider, RoutingProvider {
  private estimate = new EstimateRouting();

  constructor(
    private google: GoogleProvider,
    private guard: UsageGuard,
    private geocoder: Geocoder,
    private cache: Cache,
    private log: (msg: string, extra?: Record<string, unknown>) => void = () => {},
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async withBudget<T>(sku: GoogleSku, units: number, paid: () => Promise<T>, free: () => Promise<T>): Promise<T> {
    if (!(await this.guard.tryConsume(sku, units))) {
      this.log('google budget reached → fallback', { sku, units });
      return free();
    }
    try {
      return await paid();
    } catch (e) {
      this.log('google call failed → fallback', { sku, err: String(e) });
      return free();
    }
  }

  // ---------- Routing ----------

  matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, timing?: RouteTiming): Promise<MatrixCell[][]> {
    const sku: GoogleSku = routesTier(mode, timing) === 'pro' ? 'matrix_pro' : 'matrix_essentials';
    return this.withBudget(
      sku,
      origins.length * destinations.length,
      () => this.google.matrix(origins, destinations, mode, timing),
      () => this.estimate.matrix(origins, destinations, mode),
    );
  }

  route(origin: LatLng, destination: LatLng, mode: TransportMode, timing?: RouteTiming): ReturnType<RoutingProvider['route']> {
    const sku: GoogleSku = routesTier(mode, timing) === 'pro' ? 'routes_pro' : 'routes_essentials';
    return this.withBudget<Awaited<ReturnType<RoutingProvider['route']>>>(
      sku,
      1,
      () => this.google.route(origin, destination, mode, timing),
      () => this.estimate.route(origin, destination, mode),
    );
  }

  // ---------- Places ----------

  searchVenues(center: LatLng, activity: VenueActivity, radiusM: number, max: number, category?: ActivityCategory): Promise<Venue[]> {
    return this.withBudget(
      usesTextSearch(activity, category) ? 'text_search' : 'places_search',
      1,
      () => this.google.searchVenues(center, activity, radiusM, max, category),
      async () => {
        const venues = await osmVenues(center, activity, radiusM, this.cache, this.fetchImpl, category).catch(() => []);
        await Promise.all(venues.map((v) => this.cache.set(`venue:${v.id}`, v, 60 * 60)));
        return venues;
      },
    );
  }

  async getVenue(placeId: string): Promise<Venue | null> {
    if (placeId.startsWith('osm:')) return (await this.cache.get<Venue>(`venue:${placeId}`)) ?? null;
    // Συνήθως είναι ήδη στην cache από την αναζήτηση → δωρεάν
    if (await this.google.hasCachedVenue(placeId)) return this.google.getVenue(placeId);
    return this.withBudget(
      'place_details',
      1,
      () => this.google.getVenue(placeId),
      async () => null,
    );
  }

  searchParking(center: LatLng, radiusM: number): Promise<ParkingOption[]> {
    return this.withBudget(
      'parking_search',
      1,
      () => this.google.searchParking(center, radiusM),
      () => osmParking(center, radiusM, this.cache, this.fetchImpl).catch(() => []),
    );
  }

  // ---------- Διευθύνσεις (Photon δωρεάν στη λιτή λειτουργία) ----------

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
