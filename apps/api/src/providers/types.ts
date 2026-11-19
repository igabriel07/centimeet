import type {
  ActivityCategory,
  LatLng,
  ParkingOption,
  PlaceSuggestion,
  ResolvedPlace,
  TransitStep,
  TransportMode,
  Venue,
  VenueActivity,
} from '@centimeet/shared';

/** null = δεν υπάρχει διαδρομή · estimated = εκτίμηση απόστασης (εφεδρική λειτουργία), όχι πραγματική διαδρομή */
export type MatrixCell = { durationMin: number; distanceKm: number; estimated?: boolean } | null;

/**
 * Πότε γίνεται η διαδρομή:
 *  - departAt: ώρα αναχώρησης (οχήματα: κίνηση εκείνης της ώρας)
 *  - arriveBy: ώρα άφιξης (μόνο συγκοινωνίες — το Google δεν το δέχεται για οδήγηση)
 * Χωρίς timing: «τώρα», χωρίς κίνηση (φθηνότερο).
 */
export type RouteTiming = { departAt?: Date; arriveBy?: Date };

export type { PlaceSuggestion, ResolvedPlace };

/** Αναζήτηση διευθύνσεων (για τις αφετηρίες) */
export interface Geocoder {
  autocomplete(input: string, bias: LatLng, sessionToken?: string): Promise<PlaceSuggestion[]>;
  resolvePlace(placeId: string, sessionToken?: string): Promise<ResolvedPlace | null>;
  /** Συντεταγμένες → διεύθυνση (για pin στον χάρτη / «η τοποθεσία μου») */
  reverse(location: LatLng): Promise<ResolvedPlace | null>;
}

export interface PlacesProvider extends Geocoder {
  /** Μαγαζιά της δραστηριότητας (και προαιρετικά της κατηγορίας, π.χ. πίτσα) γύρω από ένα σημείο */
  searchVenues(center: LatLng, activity: VenueActivity, radiusM: number, max: number, category?: ActivityCategory): Promise<Venue[]>;
  getVenue(placeId: string): Promise<Venue | null>;
  searchParking(center: LatLng, radiusM: number): Promise<ParkingOption[]>;
}

export interface RoutingProvider {
  /** Πίνακας χρόνων: [origin][destination] — όλοι οι origins με το ίδιο μέσο */
  matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, timing?: RouteTiming): Promise<MatrixCell[][]>;
  /** Μία διαδρομή με βήματα (για συγκοινωνίες) */
  route(
    origin: LatLng,
    destination: LatLng,
    mode: TransportMode,
    timing?: RouteTiming,
  ): Promise<{ durationMin: number; distanceKm: number; steps?: TransitStep[]; tollEur?: number; estimated?: boolean } | null>;
}

export interface Providers {
  places: PlacesProvider;
  routing: RoutingProvider;
}
