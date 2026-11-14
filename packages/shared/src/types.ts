// Κοινοί τύποι για app και backend.

export type LatLng = { lat: number; lng: number };

export const TRANSPORT_MODES = ['car', 'motorbike', 'transit', 'walk', 'bike', 'taxi'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const ACTIVITIES = ['coffee', 'food', 'drinks', 'cinema', 'dessert', 'brunch'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const CITIES = ['athens', 'thessaloniki'] as const;
export type CityId = (typeof CITIES)[number];

export type Participant = {
  /** id χρήστη (αν έχει λογαριασμό) ή τοπικό id για «επισκέπτη» */
  id: string;
  name: string;
  origin: LatLng;
  mode: TransportMode;
};

export type Venue = {
  id: string; // Google place id
  name: string;
  location: LatLng;
  address?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number; // 0-4
  openNow?: boolean;
};

export type TravelEstimate = {
  participantId: string;
  durationMin: number;
  distanceKm: number;
  costEur: number;
};

export type ScoredVenue = {
  venue: Venue;
  /** 0-100, μεγαλύτερο = καλύτερο */
  score: number;
  maxMin: number;
  minMin: number;
  avgMin: number;
  /** Διαφορά πιο αργού – πιο γρήγορου (λεπτά) */
  spreadMin: number;
  travel: TravelEstimate[];
  /** Σε ποια υποψήφια περιοχή ανήκει */
  areaId: string;
};

export type SuggestionArea = {
  id: string;
  label: string;
  center: LatLng;
  isPrimary: boolean;
};

export type SuggestionsResponse = {
  areas: SuggestionArea[];
  primary: ScoredVenue[];
  alternatives: ScoredVenue[];
};

export type TransitStep = {
  kind: 'walk' | 'bus' | 'metro' | 'tram' | 'train' | 'trolley' | 'other';
  line?: string;
  from?: string;
  to?: string;
  durationMin: number;
};

export type ParkingOption = {
  id: string;
  name: string;
  location: LatLng;
  walkMin: number;
  kind: 'public' | 'private' | 'street' | 'unknown';
  source: 'google' | 'osm';
};

export type ParticipantPlan = {
  participantId: string;
  name: string;
  mode: TransportMode;
  durationMin: number;
  distanceKm: number;
  costEur: number;
  costNote: string;
  transitSteps?: TransitStep[];
  parking?: ParkingOption[];
  /** Deep link για πλοήγηση (Google Maps) */
  navigationUrl: string;
};

/** Αποτέλεσμα αναζήτησης διεύθυνσης (autocomplete) */
export type PlaceSuggestion = {
  placeId: string;
  /** π.χ. «Ερμού 10» */
  mainText: string;
  /** π.χ. «Αθήνα 105 63» */
  secondaryText?: string;
};

/** Διεύθυνση με συντεταγμένες (μετά την επιλογή ή από reverse geocoding) */
export type ResolvedPlace = {
  placeId: string;
  name: string;
  address?: string;
  location: LatLng;
};

export type VenuePlanResponse = {
  venue: Venue;
  plans: ParticipantPlan[];
};
