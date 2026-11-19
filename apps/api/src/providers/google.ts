/**
 * Google Maps Platform: Places API (New) + Routes API.
 * Τα κλειδιά μένουν ΜΟΝΟ στο backend.
 */
import {
  haversineKm,
  walkMinutes,
  type ActivityCategory,
  type LatLng,
  type OpeningPeriod,
  type ParkingOption,
  type PlaceSuggestion,
  type ResolvedPlace,
  type TransitStep,
  type TransportMode,
  type Venue,
  type VenueActivity,
} from '@centimeet/shared';
import { cached, geoKey, type Cache } from '../lib/cache';
import { googleSearchFor } from './categories';
import type { MatrixCell, PlacesProvider, RouteTiming, RoutingProvider } from './types';

export { walkMinutes };

const PLACES = 'https://places.googleapis.com/v1';
const ROUTES = 'https://routes.googleapis.com';

/** Αντιστοίχιση δραστηριότητας/κατηγορίας → τύποι ή κείμενο αναζήτησης: βλ. ./categories.ts */
export { ACTIVITY_GOOGLE } from './categories';

/**
 * Η μηχανή δρομολογείται ως αυτοκίνητο (ο κινητήρας εφαρμόζει μικρότερο χρόνο):
 * το TWO_WHEELER χρεώνεται ως Enterprise ($15/1000 αντί $10).
 */
const TRAVEL_MODE: Record<TransportMode, string> = {
  car: 'DRIVE',
  taxi: 'DRIVE',
  motorbike: 'DRIVE',
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
  regularOpeningHours?: { periods?: OpeningPeriod[] };
  businessStatus?: Venue['businessStatus'];
  nationalPhoneNumber?: string;
  reservable?: boolean;
  goodForGroups?: boolean;
};

const toVenue = (p: GPlace): Venue => ({
  id: p.id,
  name: p.displayName?.text ?? 'Χωρίς όνομα',
  address: p.formattedAddress,
  location: { lat: p.location?.latitude ?? 0, lng: p.location?.longitude ?? 0 },
  rating: p.rating,
  ratingCount: p.userRatingCount,
  priceLevel: p.priceLevel ? PRICE_LEVEL[p.priceLevel] : undefined,
  openingPeriods: p.regularOpeningHours?.periods,
  businessStatus: p.businessStatus,
  phone: p.nationalPhoneNumber,
  reservable: p.reservable,
  goodForGroups: p.goodForGroups,
});

/**
 * Πεδία μαγαζιού. ⚠️ Καθορίζουν τη χρέωση: rating/userRatingCount/ωράριο/τηλέφωνο = Enterprise,
 * reservable/goodForGroups = Enterprise + Atmosphere ($40/1000 κλήσεις, 1.000 δωρεάν/μήνα).
 */
export const VENUE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'regularOpeningHours.periods',
  'businessStatus',
  'nationalPhoneNumber',
  'reservable',
  'goodForGroups',
].join(',');

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

  async searchVenues(center: LatLng, activity: VenueActivity, radiusM: number, max: number, category?: ActivityCategory): Promise<Venue[]> {
    const key = `venues:${activity}:${category ?? '*'}:${geoKey(center.lat, center.lng)}:${radiusM}:${max}`;
    return cached(this.cache, key, 60 * 60, async () => {
      const search = googleSearchFor(activity, category);
      const fields = VENUE_FIELDS.split(',').map((f) => `places.${f}`).join(',');
      const circle = { center: { latitude: center.lat, longitude: center.lng }, radius: radiusM };
      let places: GPlace[];
      if ('types' in search) {
        const data = await this.call<{ places?: GPlace[] }>(`${PLACES}/places:searchNearby`, fields, {
          includedTypes: search.types,
          maxResultCount: Math.min(20, max),
          rankPreference: 'POPULARITY',
          languageCode: 'el',
          regionCode: 'GR',
          locationRestriction: { circle },
        });
        places = data.places ?? [];
      } else {
        // Text Search δέχεται κύκλο μόνο ως «προτίμηση» → κρατάμε όσα είναι μέσα στην ακτίνα
        const data = await this.call<{ places?: GPlace[] }>(`${PLACES}/places:searchText`, fields, {
          textQuery: search.text,
          pageSize: Math.min(20, max),
          languageCode: 'el',
          regionCode: 'GR',
          locationBias: { circle },
        });
        places = data.places ?? [];
      }
      const venues = places.map(toVenue).filter((v) => 'types' in search || haversineKm(center, v.location) * 1000 <= radiusM);
      // Το πλάνο (getVenue) βρίσκει το μαγαζί εδώ χωρίς νέα χρέωση Place Details
      await Promise.all(venues.map((v) => this.cache.set(`venue:${v.id}`, v, 60 * 60)));
      return venues;
    });
  }

  /** Είναι το μαγαζί ήδη στην cache (άρα getVenue δεν θα χρεώσει); */
  async hasCachedVenue(placeId: string): Promise<boolean> {
    return (await this.cache.get(`venue:${placeId}`)) !== undefined;
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

  timing(mode: TransportMode, t?: RouteTiming): Record<string, string> {
    return googleTiming(mode, t);
  }

  async matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, timing?: RouteTiming): Promise<MatrixCell[][]> {
    const out: MatrixCell[][] = origins.map(() => destinations.map(() => null));
    if (origins.length === 0 || destinations.length === 0) return out;

    // Σπάμε τους προορισμούς σε κομμάτια ώστε origins × chunk ≤ 100
    const chunkSize = Math.max(1, Math.floor(MATRIX_MAX_ELEMENTS / origins.length));
    for (let start = 0; start < destinations.length; start += chunkSize) {
      const chunk = destinations.slice(start, start + chunkSize);
      const when = timing?.arriveBy ? `a${timing.arriveBy.toISOString().slice(0, 15)}` : timing?.departAt ? `d${timing.departAt.toISOString().slice(0, 15)}` : 'now';
      const key = `matrix:${TRAVEL_MODE[mode]}:${when}:${origins.map((o) => geoKey(o.lat, o.lng)).join('|')}>${chunk.map((d) => geoKey(d.lat, d.lng)).join('|')}`;
      const cells = await cached(this.cache, key, 10 * 60, async () => {
        const els = await this.call<
          { originIndex?: number; destinationIndex?: number; condition?: string; duration?: string; distanceMeters?: number }[]
        >(`${ROUTES}/distanceMatrix/v2:computeRouteMatrix`, 'originIndex,destinationIndex,duration,distanceMeters,condition', {
          origins: origins.map((o) => ({ waypoint: { location: toLatLngJson(o) } })),
          destinations: chunk.map((d) => ({ waypoint: { location: toLatLngJson(d) } })),
          ...this.timing(mode, timing),
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

  async route(origin: LatLng, destination: LatLng, mode: TransportMode, timing?: RouteTiming) {
    type GStep = {
      travelMode?: string;
      staticDuration?: string;
      transitDetails?: {
        stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string } };
        transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } };
      };
    };
    const drive = TRAVEL_MODE[mode] === 'DRIVE';
    type Money = { currencyCode?: string; units?: string; nanos?: number };
    const data = await this.call<{
      routes?: {
        duration?: string;
        distanceMeters?: number;
        legs?: { steps?: GStep[] }[];
        travelAdvisory?: { tollInfo?: { estimatedPrice?: Money[] } };
      }[];
    }>(
      `${ROUTES}/directions/v2:computeRoutes`,
      [
        'routes.duration',
        'routes.distanceMeters',
        'routes.legs.steps.travelMode',
        'routes.legs.steps.staticDuration',
        'routes.legs.steps.transitDetails',
        ...(drive ? ['routes.travelAdvisory.tollInfo'] : []),
      ].join(','),
      {
        origin: { location: toLatLngJson(origin) },
        destination: { location: toLatLngJson(destination) },
        ...this.timing(mode, timing),
        ...(drive ? { extraComputations: ['TOLLS'] } : {}),
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
    const eur = r.travelAdvisory?.tollInfo?.estimatedPrice?.find((m) => m.currencyCode === 'EUR');
    const tollEur = eur ? Math.round((Number(eur.units ?? 0) + (eur.nanos ?? 0) / 1e9) * 100) / 100 : undefined;
    return {
      durationMin: Math.round(parseDurationMin(r.duration)),
      distanceKm: (r.distanceMeters ?? 0) / 1000,
      steps,
      tollEur: tollEur || undefined,
    };
  }
}

/**
 * Χρονισμός & κίνηση ανά μέσο (καθορίζει και τη χρέωση):
 *  - οχήματα με μελλοντική ώρα → TRAFFIC_AWARE_OPTIMAL + PESSIMISTIC (Pro): κανείς να μην αργήσει
 *  - οχήματα χωρίς ώρα → TRAFFIC_UNAWARE (Essentials)
 *  - συγκοινωνίες → arrivalTime (ώρα συνάντησης) ή departureTime
 *  - πόδια/ποδήλατο → χωρίς κίνηση (Essentials)
 */
export function googleTiming(mode: TransportMode, t?: RouteTiming, now = Date.now()): Record<string, string> {
  const travelMode = TRAVEL_MODE[mode];
  const future = (d?: Date) => (d && d.getTime() > now + 60_000 ? d.toISOString() : undefined);
  if (travelMode === 'TRANSIT') {
    const arrivalTime = future(t?.arriveBy);
    const departureTime = future(t?.departAt);
    return { travelMode, ...(arrivalTime ? { arrivalTime } : departureTime ? { departureTime } : {}) };
  }
  if (travelMode === 'DRIVE') {
    const departureTime = future(t?.departAt);
    return departureTime
      ? { travelMode, routingPreference: 'TRAFFIC_AWARE_OPTIMAL', trafficModel: 'PESSIMISTIC', departureTime }
      : { travelMode, routingPreference: 'TRAFFIC_UNAWARE' };
  }
  return { travelMode };
}

/** Pro (με κίνηση) ή Essentials — για τον μετρητή χρήσης */
export function routesTier(mode: TransportMode, t?: RouteTiming): 'pro' | 'essentials' {
  return googleTiming(mode, t).routingPreference === 'TRAFFIC_AWARE_OPTIMAL' ? 'pro' : 'essentials';
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

