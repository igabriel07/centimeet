import type {
  Activity,
  LatLng,
  ParkingOption,
  PlaceSuggestion,
  ResolvedPlace,
  TransitStep,
  TransportMode,
  Venue,
} from '@centimeet/shared';

export type MatrixCell = { durationMin: number; distanceKm: number } | null; // null = δεν υπάρχει διαδρομή

export type { PlaceSuggestion, ResolvedPlace };

/** Αναζήτηση διευθύνσεων (για τις αφετηρίες) */
export interface Geocoder {
  autocomplete(input: string, bias: LatLng, sessionToken?: string): Promise<PlaceSuggestion[]>;
  resolvePlace(placeId: string, sessionToken?: string): Promise<ResolvedPlace | null>;
  /** Συντεταγμένες → διεύθυνση (για pin στον χάρτη / «η τοποθεσία μου») */
  reverse(location: LatLng): Promise<ResolvedPlace | null>;
}

export interface PlacesProvider extends Geocoder {
  /** Μαγαζιά της δραστηριότητας γύρω από ένα σημείο */
  searchVenues(center: LatLng, activity: Activity, radiusM: number, max: number): Promise<Venue[]>;
  getVenue(placeId: string): Promise<Venue | null>;
  searchParking(center: LatLng, radiusM: number): Promise<ParkingOption[]>;
}

export interface RoutingProvider {
  /** Πίνακας χρόνων: [origin][destination] — όλοι οι origins με το ίδιο μέσο */
  matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, departAt?: Date): Promise<MatrixCell[][]>;
  /** Μία διαδρομή με βήματα (για συγκοινωνίες) */
  route(
    origin: LatLng,
    destination: LatLng,
    mode: TransportMode,
    departAt?: Date,
  ): Promise<{ durationMin: number; distanceKm: number; steps?: TransitStep[] } | null>;
}

export interface Providers {
  places: PlacesProvider;
  routing: RoutingProvider;
}
