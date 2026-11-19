// Κοινοί τύποι για app και backend.

export type LatLng = { lat: number; lng: number };

export const TRANSPORT_MODES = ['car', 'motorbike', 'transit', 'walk', 'bike', 'taxi'] as const;

/**
 * «Πού θέλεις να πάμε;» ανά άτομο:
 *  fair     → κάπου στη μέση (προεπιλογή)
 *  anywhere → δεν με νοιάζει (ο χρόνος μου μετρά λιγότερο στη δικαιοσύνη)
 *  near     → κοντά μου (ο χρόνος μου μετρά περισσότερο)
 */
export const PLACE_PREFERENCES = ['fair', 'anywhere', 'near'] as const;
export type PlacePreference = (typeof PLACE_PREFERENCES)[number];
/** Πόσο «μετρά» ο χρόνος (και η απόσταση/κόστος) κάθε ατόμου στον αλγόριθμο */
export const PREFERENCE_WEIGHT: Record<PlacePreference, number> = { fair: 1, anywhere: 0.25, near: 2 };
export const preferenceWeight = (p?: PlacePreference | null) => PREFERENCE_WEIGHT[p ?? 'fair'];
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** 'spot' = μόνο σημείο συνάντησης (χωρίς μαγαζιά) */
export const ACTIVITIES = ['spot', 'coffee', 'food', 'drinks', 'cinema', 'theater'] as const;
export type Activity = (typeof ACTIVITIES)[number];
/** Δραστηριότητες που ψάχνουν μαγαζιά */
export type VenueActivity = Exclude<Activity, 'spot'>;
export const isVenueActivity = (a: Activity): a is VenueActivity => a !== 'spot';

export const CITIES = ['athens', 'thessaloniki'] as const;
export type CityId = (typeof CITIES)[number];

export type Participant = {
  /** id χρήστη (αν έχει λογαριασμό) ή τοπικό id για «επισκέπτη» */
  id: string;
  name: string;
  origin: LatLng;
  mode: TransportMode;
  /** «Πού θέλεις να πάμε;» — χωρίς = στη μέση */
  preference?: PlacePreference;
};

/** Διάστημα λειτουργίας όπως το δίνει το Google (day: 0 = Κυριακή) */
export type OpeningPeriod = {
  open: { day: number; hour: number; minute: number };
  /** Λείπει όταν το μαγαζί είναι ανοιχτό 24/7 */
  close?: { day: number; hour: number; minute: number };
};

export type Venue = {
  id: string; // Google place id
  name: string;
  location: LatLng;
  address?: string;
  rating?: number;
  ratingCount?: number;
  priceLevel?: number; // 0-4
  /** Εβδομαδιαίο ωράριο (για έλεγχο «ανοιχτό την ώρα της συνάντησης») */
  openingPeriods?: OpeningPeriod[];
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  phone?: string;
  /** Δέχεται κρατήσεις */
  reservable?: boolean;
  /** Κατάλληλο για παρέες */
  goodForGroups?: boolean;
  /** 'osm' = εφεδρική πηγή χωρίς βαθμολογίες (όταν εξαντληθεί το δωρεάν όριο Google) */
  source?: 'google' | 'osm';
};

export type TravelEstimate = {
  participantId: string;
  durationMin: number;
  distanceKm: number;
  costEur: number;
};

export type CrowdReason = 'peak_time' | 'very_popular' | 'large_group' | 'not_group_friendly';

/** Εκτίμηση (όχι μέτρηση) ότι το μαγαζί μπορεί να είναι γεμάτο για τόσα άτομα */
export type CrowdHint = {
  /** 0-1 */
  risk: number;
  /** Να προτείνουμε τηλέφωνο για τραπέζι */
  callAhead: boolean;
  reasons: CrowdReason[];
};

export type ScoredVenue = {
  venue: Venue;
  /** 0-100, σχετικό με τα υπόλοιπα της ίδιας περιοχής (100 = το καλύτερο) */
  score: number;
  /** Σταθμισμένη βαθμολογία (Bayesian) που χρησιμοποιήθηκε στην κατάταξη */
  quality: number;
  /** Απόσταση από το σημείο συνάντησης (m) */
  distanceM: number;
  crowd?: CrowdHint;
  maxMin: number;
  minMin: number;
  avgMin: number;
  /** Διαφορά πιο αργού – πιο γρήγορου (λεπτά) */
  spreadMin: number;
  /** Εκτίμηση: χρόνος ως το σημείο + περπάτημα ως το μαγαζί */
  travel: TravelEstimate[];
  /** Σε ποια υποψήφια περιοχή ανήκει */
  areaId: string;
};

export type SuggestionArea = {
  id: string;
  label: string;
  center: LatLng;
  isPrimary: boolean;
  /** Χρόνοι κάθε ατόμου ως το σημείο (με κίνηση, αν δόθηκε ώρα) */
  travel: TravelEstimate[];
  maxMin: number;
  minMin: number;
  /** Ακτίνα (m) στην οποία βρέθηκαν τα μαγαζιά (0 αν δεν έχουν φορτωθεί ακόμη) */
  radiusM: number;
  /** false = τα μαγαζιά φορτώνουν «κατά παραγγελία» (POST /v1/area-venues) */
  hasVenues: boolean;
};

/** Ενημερώσεις για τον χρήστη όταν η απάντηση είναι «φτωχότερη» (π.χ. εξαντλήθηκε το δωρεάν όριο) */
export type ResultNotices = {
  /** Κάποιοι χρόνοι είναι εκτίμηση απόστασης, όχι πραγματική διαδρομή */
  estimatedTimes?: boolean;
  /** Τα μαγαζιά είναι από OpenStreetMap, χωρίς βαθμολογίες */
  basicVenues?: boolean;
};

export type SuggestionsResponse = {
  areas: SuggestionArea[];
  primary: ScoredVenue[];
  alternatives: ScoredVenue[];
  notices?: ResultNotices;
};

export type AreaVenuesResponse = {
  area: SuggestionArea;
  venues: ScoredVenue[];
  notices?: ResultNotices;
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
  /** Διόδια που περιλαμβάνονται στο κόστος (αν υπάρχουν) */
  tollEur?: number;
  /** Εκτίμηση χρόνου εύρεσης parking (περιλαμβάνεται στο durationMin) */
  parkingSearchMin?: number;
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
