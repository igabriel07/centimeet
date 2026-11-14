/**
 * Ψεύτικος provider για ανάπτυξη/tests: ντετερμινιστικά μαγαζιά & χρόνοι,
 * χωρίς δίκτυο και χωρίς κόστος Google.
 *
 * Ρεαλιστικό όσο χρειάζεται για να δοκιμάζεται ο αλγόριθμος:
 *  - σταθερό «πλέγμα» μαγαζιών γύρω από κάθε σημείο → μεγαλύτερη ακτίνα = περισσότερα μαγαζιά
 *  - ωράρια (κάποια κλείνουν νωρίς ή Δευτέρα), τηλέφωνα, goodForGroups, πολύ διαφορετικά πλήθη κριτικών
 *  - κίνηση σε ώρες αιχμής για οχήματα όταν δοθεί ώρα αναχώρησης
 */
import {
  estimateMinutes,
  haversineKm,
  walkMinutes,
  type Activity,
  type LatLng,
  type OpeningPeriod,
  type ParkingOption,
  type TransportMode,
  type Venue,
} from '@centimeet/shared';
import type { MatrixCell, PlacesProvider, RouteTiming, RoutingProvider } from './types';

const NAMES: Record<Activity, string[]> = {
  coffee: ['Café Μέση', 'Κόκκος', 'Άρωμα', 'Το Μπαλκόνι', 'Flat White', 'Ρόφημα', 'Μπρίκι', 'Espresso Lab'],
  food: ['Ταβέρνα Η Μέση', 'Μεζεδοπωλείο', 'Το Στέκι', 'Ψησταριά', 'Τρατορία', 'Ουζερί', 'Μαγειρείο', 'Σουβλάκι'],
  drinks: ['Bar Κέντρο', 'Αυλή', 'Ταράτσα', 'Speakeasy', 'Κρασοπουλειό', 'Pub', 'Cocktail Room', 'Μπυραρία'],
  cinema: ['Σινεμά Αστέρι', 'Θερινός Κήπος', 'Cineplex Μέσης', 'Studio'],
  dessert: ['Ζαχαροπλαστείο', 'Gelato', 'Λουκουμάδες', 'Cake Shop'],
  brunch: ['Brunch Club', 'Pancake Spot', 'Πρωινό', 'Eggs & Co'],
};

/** Ωράρια ανά είδος: [άνοιγμα, κλείσιμο] — κλείσιμο < άνοιγμα = την επόμενη μέρα */
const HOURS: Record<Activity, [number, number]> = {
  coffee: [8, 23],
  brunch: [9, 17],
  food: [12, 1],
  drinks: [19, 3],
  dessert: [10, 24],
  cinema: [17, 1],
};

/** Μαγαζιά που «υπάρχουν» σε ακτίνα 1 km γύρω από κάθε σημείο του πλέγματος */
const GRID_VENUES = 40;
const GRID_RADIUS_M = 1000;

/** Ψευδοτυχαίο αλλά σταθερό */
function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function periods(activity: Activity, variant: number): OpeningPeriod[] {
  let [open, close] = HOURS[activity];
  if (variant === 1 && open < 15) close = 17; // κλείνει νωρίς (μόνο για όσα ανοίγουν πρωί)
  const days = variant === 2 ? [0, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5, 6]; // κλειστό Δευτέρα
  return days.map((d) => {
    const overnight = close <= open;
    const closeHour = close === 24 ? 0 : close;
    return {
      open: { day: d, hour: open, minute: 0 },
      close: { day: overnight || close === 24 ? (d + 1) % 7 : d, hour: closeHour, minute: 0 },
    };
  });
}

/** Ώρες αιχμής κίνησης (τοπική ώρα ≈ UTC+2) */
function trafficFactor(at?: Date) {
  if (!at) return 1;
  const h = (at.getUTCHours() + 2) % 24;
  return (h >= 7 && h < 10) || (h >= 14 && h < 16) || (h >= 17 && h < 21) ? 1.35 : 1;
}

export class MockProvider implements PlacesProvider, RoutingProvider {
  private venues = new Map<string, Venue>();

  async searchVenues(center: LatLng, activity: Activity, radiusM: number, max: number): Promise<Venue[]> {
    // Σταθερή «γειτονιά» ανά ~100 m ώστε μικρές μετακινήσεις του κέντρου να δίνουν ίδια μαγαζιά
    const base = Math.round(center.lat * 1000) * 7 + Math.round(center.lng * 1000) * 13;
    const anchor = { lat: Math.round(center.lat * 1000) / 1000, lng: Math.round(center.lng * 1000) / 1000 };
    const names = NAMES[activity];
    const all: Venue[] = [];
    for (let i = 0; i < GRID_VENUES; i++) {
      const dist = GRID_RADIUS_M * Math.sqrt(seeded(base + i)); // ομοιόμορφα στην επιφάνεια
      const angle = seeded(base + i + 100) * Math.PI * 2;
      const location = {
        lat: anchor.lat + (Math.sin(angle) * dist) / 111_000,
        lng: anchor.lng + (Math.cos(angle) * dist) / (111_000 * Math.cos((anchor.lat * Math.PI) / 180)),
      };
      const ratingCount = Math.round(5 + seeded(base + i + 13) ** 2 * 4000);
      const variantRoll = seeded(base + i + 31);
      const v: Venue = {
        id: `mock_${activity}_${base}_${i}`,
        name: `${names[i % names.length]}${i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''}`,
        address: 'Δοκιμαστική οδός 1',
        location,
        rating: Math.round((3.6 + seeded(base + i + 7) * 1.4) * 10) / 10,
        ratingCount,
        priceLevel: 1 + Math.floor(seeded(base + i + 21) * 3),
        openingPeriods: periods(activity, variantRoll < 0.12 ? 1 : variantRoll < 0.2 ? 2 : 0),
        businessStatus: seeded(base + i + 41) < 0.04 ? 'CLOSED_PERMANENTLY' : 'OPERATIONAL',
        phone: seeded(base + i + 51) < 0.85 ? `210 ${String(1000000 + Math.floor(seeded(base + i + 61) * 8999999)).slice(0, 7)}` : undefined,
        reservable: seeded(base + i + 71) < 0.4,
        goodForGroups: seeded(base + i + 81) < 0.3 ? false : seeded(base + i + 81) < 0.7 ? true : undefined,
      };
      this.venues.set(v.id, v);
      all.push(v);
    }
    // Όπως το Google με rankPreference POPULARITY: εντός ακτίνας, τα πιο δημοφιλή πρώτα
    return all
      .filter((v) => haversineKm(center, v.location) * 1000 <= radiusM)
      .sort((a, b) => (b.ratingCount ?? 0) - (a.ratingCount ?? 0))
      .slice(0, Math.min(20, max));
  }

  async getVenue(placeId: string) {
    return this.venues.get(placeId) ?? null;
  }

  async searchParking(center: LatLng): Promise<ParkingOption[]> {
    const loc = { lat: center.lat + 0.002, lng: center.lng - 0.001 };
    return [
      { id: 'mock_park_1', name: 'Parking Δοκιμής', location: loc, walkMin: walkMinutes(center, loc), kind: 'private', source: 'google' },
    ];
  }

  async autocomplete(input: string) {
    return [{ placeId: `mock_place_${encodeURIComponent(input)}`, mainText: input, secondaryText: 'Αθήνα' }];
  }

  async resolvePlace(placeId: string) {
    return { placeId, name: decodeURIComponent(placeId.replace('mock_place_', '')), location: { lat: 37.9838, lng: 23.7275 } };
  }

  async reverse(location: LatLng) {
    return { placeId: `mock_rev`, name: 'Σημείο στον χάρτη', address: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`, location };
  }

  private estimate(a: LatLng, b: LatLng, mode: TransportMode, timing?: RouteTiming) {
    const e = estimateMinutes(a, b, mode);
    const vehicle = mode === 'car' || mode === 'taxi' || mode === 'motorbike';
    return { durationMin: e.durationMin * (vehicle ? trafficFactor(timing?.departAt) : 1), distanceKm: e.distanceKm };
  }

  async matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode, timing?: RouteTiming): Promise<MatrixCell[][]> {
    return origins.map((o) => destinations.map((d) => this.estimate(o, d, mode, timing)));
  }

  async route(origin: LatLng, destination: LatLng, mode: TransportMode, timing?: RouteTiming) {
    const e = this.estimate(origin, destination, mode, timing);
    return {
      durationMin: Math.round(e.durationMin),
      distanceKm: e.distanceKm,
      tollEur: mode === 'car' && e.distanceKm > 15 ? 2.8 : undefined,
      steps:
        mode === 'transit'
          ? [
              { kind: 'walk' as const, durationMin: 4 },
              { kind: 'metro' as const, line: 'M2', from: 'Στάση Α', to: 'Στάση Β', durationMin: Math.max(1, Math.round(e.durationMin) - 8) },
              { kind: 'walk' as const, durationMin: 4 },
            ]
          : undefined,
    };
  }
}
