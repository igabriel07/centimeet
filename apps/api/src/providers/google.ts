/**
 * Google Maps Platform: Places API (New) + Routes API.
 * Τα κλειδιά μένουν ΜΟΝΟ στο backend.
 */
import {
  haversineKm,
  type Activity,
  type LatLng,
  type ParkingOption,
  type PlaceSuggestion,
  type ResolvedPlace,
  type TransitStep,
  type TransportMode,
  type Venue,
} from '@centimeet/shared';
import { cached, geoKey, type Cache } from '../lib/cache';
import type { MatrixCell, PlacesProvider, RoutingProvider } from './types';

const PLACES = 'https://places.googleapis.com/v1';
const ROUTES = 'https://routes.googleapis.com';

export const ACTIVITY_TYPES: Record<Activity, string[]> = {
  coffee: ['cafe', 'coffee_shop'],
  food: ['restaurant'],
  drinks: ['bar', 'pub', 'wine_bar'],
  cinema: ['movie_theater'],
  dessert: ['dessert_shop', 'bakery', 'ice_cream_shop'],
  brunch: ['brunch_restaurant', 'breakfast_restaurant', 'cafe'],
};

const TRAVEL_MODE: Record<TransportMode, string> = {
  car: 'DRIVE',
  taxi: 'DRIVE',
  motorbike: 'TWO_WHEELER',
  transit: 'TRANSIT',
  walk: 'WALK',
  bike: 'BICYCLE',
};

const PRICE_LEVEL: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Τα όρια της Routes API: TRANSIT & TRAFFIC_AWARE → max 100 στοιχεία ανά κλήση */
export const MATRIX_MAX_ELEMENTS = 100;

const parseDurationMin = (d?: string) => (d ? Number(d.replace('s', '')) / 60 : NaN);
const toLatLngJson = (p: LatLng) => ({ latLng: { latitude: p.lat, longitude: p.lng } });

type GPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
};

const toVenue = (p: GPlace): Venue => ({
  id: p.id,
  name: p.displayName?.text ?? 'Χωρίς όνομα',
  address: p.formattedAddress,
  location: { lat: p.location?.latitude ?? 0, lng: p.location?.longitude ?? 0 },
  rating: p.rating,
  ratingCount: p.userRatingCount,
  priceLevel: p.priceLevel ? PRICE_LEVEL[p.priceLevel] : undefined,
  openNow: p.currentOpeningHours?.openNow,
});

const VENUE_FIELDS =
  'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,currentOpeningHours.openNow';

export class GoogleProvider implements PlacesProvider, RoutingProvider {
  constructor(
    private apiKey: string,
    private cache: Cache,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(url: string, fieldMask: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const res = await this.fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': fieldMask,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  // ---------- Places ----------

  async searchVenues(center: LatLng, activity: Activity, radiusM: number, max: number): Promise<Venue[]> {
    const key = `venues:${activity}:${geoKey(center.lat, center.lng)}:${radiusM}:${max}`;
    return cached(this.cache, key, 60 * 60, async () => {
      const data = await this.call<{ places?: GPlace[] }>(
        `${PLACES}/places:searchNearby`,
        VENUE_FIELDS.split(',').map((f) => `places.${f}`).join(','),
        {
          includedTypes: ACTIVITY_TYPES[activity],
          maxResultCount: Math.min(20, max),
          rankPreference: 'POPULARITY',
          languageCode: 'el',
          regionCode: 'GR',
          locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
        },
      );
      return (data.places ?? []).map(toVenue);
    });
  }

  async getVenue(placeId: string): Promise<Venue | null> {
    return cached(this.cache, `venue:${placeId}`, 60 * 60, async () => {
      const p = await this.call<GPlace>(`${PLACES}/places/${encodeURIComponent(placeId)}?languageCode=el`, VENUE_FIELDS);
      return p?.id ? toVenue(p) : null;
    });
  }

  async searchParking(center: LatLng, radiusM: number): Promise<ParkingOption[]> {
    const key = `parking:g:${geoKey(center.lat, center.lng)}:${radiusM}`;
    return cached(this.cache, key, 24 * 60 * 60, async () => {
      const data = await this.call<{ places?: GPlace[] }>(
        `${PLACES}/places:searchNearby`,
        'places.id,places.displayName,places.location',
        {
          includedTypes: ['parking'],
          maxResultCount: 10,
          rankPreference: 'DISTANCE',
          languageCode: 'el',
          locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM } },
        },
      );
      return (data.places ?? []).map((p) => {
        const loc = { lat: p.location?.latitude ?? 0, lng: p.location?.longitude ?? 0 };
        return {
          id: `g:${p.id}`,
          name: p.displayName?.text ?? 'Parking',
          location: loc,
          walkMin: walkMinutes(center, loc),
          kind: 'unknown' as const,
          source: 'google' as const,
        };
      });
    });
  }

  async autocomplete(input: string, bias: LatLng, sessionToken?: string): Promise<PlaceSuggestion[]> {
    const data = await this.call<{
      suggestions?: {
        placePrediction?: {
          placeId: string;
          text: { text: string };
          structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        };
      }[];
    }>(
      `${PLACES}/places:autocomplete`,
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
      {
        input,
        sessionToken,
        languageCode: 'el',
        includedRegionCodes: ['gr'],
        locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 30000 } },
      },
    );
    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        placeId: p.placeId,
        mainText: p.structuredFormat?.mainText?.text ?? p.text.text,
        secondaryText: p.structuredFormat?.secondaryText?.text,
      }));
  }

  /** Συντεταγμένες → διεύθυνση (Geocoding API — ενεργοποιήστε το στο Google Cloud) */
  async reverse(location: LatLng): Promise<ResolvedPlace | null> {
    return cached(this.cache, `rev:${geoKey(location.lat, location.lng)}`, 24 * 60 * 60, async () => {
      const qs = new URLSearchParams({
        latlng: `${location.lat},${location.lng}`,
        language: 'el',
        result_type: 'street_address|premise|route|point_of_interest',
        key: this.apiKey,
      });
      const res = await this.fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
      if (!res.ok) throw new Error(`Geocoding ${res.status}`);
      const data = (await res.json()) as {
        status: string;
        results?: { place_id: string; formatted_address: string; address_components?: { long_name: string; types: string[] }[] }[];
      };
      const r = data.results?.[0];
      if (!r) return null;
      const comp = (t: string) => r.address_components?.find((c) => c.types.includes(t))?.long_name;
      const street = [comp('route'), comp('street_number')].filter(Boolean).join(' ');
      return {
        placeId: r.place_id,
        name: street || r.formatted_address.split(',')[0]!,
        address: r.formatted_address,
        location, // η ακριβής θέση του pin
      };
    });
  }

  async resolvePlace(placeId: string, sessionToken?: string): Promise<ResolvedPlace | null> {
    const qs = new URLSearchParams({ languageCode: 'el', ...(sessionToken ? { sessionToken } : {}) });
    const p = await this.call<GPlace>(
      `${PLACES}/places/${encodeURIComponent(placeId)}?${qs}`,
      'id,displayName,formattedAddress,location',
    );
    if (!p?.location) return null;
    return {
      placeId: p.id,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress,
      location: { lat: p.location.latitude, lng: p.location.longitude },
    };
  }

  // ---------- Routes ----------

  private timing(mode: TransportMode, departAt?: Date) {
    const travelMode = TRAVEL_MODE[mode];
    const future = departAt && departAt.getTime() > Date.now() + 60_000 ? departAt.toISOString() : undefined;
    const drive = travelMode === 'DRIVE' || travelMode === 'TWO_WHEELER';
    return {
      travelMode,
      ...(drive ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
      ...(future ? { departureTime: future } : {}),
    };
  }

  async matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, departAt?: Date): Promise<MatrixCell[][]> {
    const out: MatrixCell[][] = origins.map(() => destinations.map(() => null));
    if (origins.length === 0 || destinations.length === 0) return out;

    // Σπάμε τους προορισμούς σε κομμάτια ώστε origins × chunk ≤ 100
    const chunkSize = Math.max(1, Math.floor(MATRIX_MAX_ELEMENTS / origins.length));
    for (let start = 0; start < destinations.length; start += chunkSize) {
      const chunk = destinations.slice(start, start + chunkSize);
      const key = `matrix:${mode}:${departAt?.toISOString().slice(0, 15) ?? 'now'}:${origins.map((o) => geoKey(o.lat, o.lng)).join('|')}>${chunk.map((d) => geoKey(d.lat, d.lng)).join('|')}`;
      const cells = await cached(this.cache, key, 10 * 60, async () => {
        const els = await this.call<
          { originIndex?: number; destinationIndex?: number; condition?: string; duration?: string; distanceMeters?: number }[]
        >(`${ROUTES}/distanceMatrix/v2:computeRouteMatrix`, 'originIndex,destinationIndex,duration,distanceMeters,condition', {
          origins: origins.map((o) => ({ waypoint: { location: toLatLngJson(o) } })),
          destinations: chunk.map((d) => ({ waypoint: { location: toLatLngJson(d) } })),
          ...this.timing(mode, departAt),
          languageCode: 'el',
        });
        return els.map((e) => ({
          o: e.originIndex ?? 0,
          d: e.destinationIndex ?? 0,
          cell:
            e.condition === 'ROUTE_EXISTS'
              ? { durationMin: parseDurationMin(e.duration), distanceKm: (e.distanceMeters ?? 0) / 1000 }
              : null,
        }));
      });
      for (const c of cells) out[c.o]![start + c.d] = c.cell;
    }
    return out;
  }

  async route(origin: LatLng, destination: LatLng, mode: TransportMode, departAt?: Date) {
    type GStep = {
      travelMode?: string;
      staticDuration?: string;
      transitDetails?: {
        stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
        transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } };
      };
    };
    const data = await this.call<{ routes?: { duration?: string; distanceMeters?: number; legs?: { steps?: GStep[] }[] }[] }>(
      `${ROUTES}/directions/v2:computeRoutes`,
      'routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails',
      {
        origin: { location: toLatLngJson(origin) },
        destination: { location: toLatLngJson(destination) },
        ...this.timing(mode, departAt),
        languageCode: 'el',
        units: 'METRIC',
      },
    );
    const r = data.routes?.[0];
    if (!r) return null;

    let steps: TransitStep[] | undefined;
    if (mode === 'transit') {
      steps = mergeWalkSteps(
        (r.legs ?? []).flatMap((l) => l.steps ?? []).map((s): TransitStep => {
          const t = s.transitDetails;
          return {
            kind: t ? vehicleKind(t.transitLine?.vehicle?.type) : 'walk',
            line: t?.transitLine?.nameShort ?? t?.transitLine?.name,
            from: t?.stopDetails?.departureStop?.name,
            to: t?.stopDetails?.arrivalStop?.name,
            durationMin: Math.round(parseDurationMin(s.staticDuration) || 0),
          };
        }),
      );
    }
    return { durationMin: Math.round(parseDurationMin(r.duration)), distanceKm: (r.distanceMeters ?? 0) / 1000, steps };
  }
}

function vehicleKind(type?: string): TransitStep['kind'] {
  switch (type) {
    case 'BUS':
    case 'INTERCITY_BUS':
      return 'bus';
    case 'SUBWAY':
    case 'METRO_RAIL':
      return 'metro';
    case 'TRAM':
    case 'LIGHT_RAIL':
      return 'tram';
    case 'TROLLEYBUS':
      return 'trolley';
    case 'RAIL':
    case 'HEAVY_RAIL':
    case 'COMMUTER_TRAIN':
      return 'train';
    default:
      return 'other';
  }
}

/** Ενώνει διαδοχικά βήματα περπατήματος σε ένα */
export function mergeWalkSteps(steps: TransitStep[]): TransitStep[] {
  const out: TransitStep[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (s.kind === 'walk' && last?.kind === 'walk') last.durationMin += s.durationMin;
    else out.push({ ...s });
  }
  return out;
}

/** Περπάτημα: ευθεία απόσταση × 1.3 (δρόμοι) με 4.8 km/h */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round(((haversineKm(a, b) * 1.3) / 4.8) * 60));
}
