/**
 * Ψεύτικος provider για ανάπτυξη/tests: ντετερμινιστικά μαγαζιά & χρόνοι,
 * χωρίς δίκτυο και χωρίς κόστος Google.
 */
import { haversineKm, URBAN_SPEED_KMH, type Activity, type LatLng, type ParkingOption, type TransportMode, type Venue } from '@centimeet/shared';
import type { MatrixCell, PlacesProvider, RoutingProvider } from './types';
import { walkMinutes } from './google';

const NAMES: Record<Activity, string[]> = {
  coffee: ['Café Μέση', 'Κόκκος', 'Αρωμα', 'Το Μπαλκόνι', 'Flat White', 'Ρόφημα'],
  food: ['Ταβέρνα Η Μέση', 'Μεζεδοπωλείο', 'Το Στέκι', 'Ψησταριά', 'Τρατορία', 'Ουζερί'],
  drinks: ['Bar Κέντρο', 'Αυλή', 'Ταράτσα', 'Speakeasy', 'Κρασοπουλειό', 'Pub'],
  cinema: ['Σινεμά Αστέρι', 'Θερινός Κήπος', 'Cineplex Μέσης'],
  dessert: ['Ζαχαροπλαστείο', 'Gelato', 'Λουκουμάδες'],
  brunch: ['Brunch Club', 'Pancake Spot', 'Πρωινό'],
};

/** Ψευδοτυχαίο αλλά σταθερό */
function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export class MockProvider implements PlacesProvider, RoutingProvider {
  private venues = new Map<string, Venue>();

  async searchVenues(center: LatLng, activity: Activity, radiusM: number, max: number): Promise<Venue[]> {
    const names = NAMES[activity];
    const base = Math.round(center.lat * 1000) + Math.round(center.lng * 1000);
    const out: Venue[] = [];
    for (let i = 0; i < Math.min(max, names.length); i++) {
      const r = seeded(base + i);
      const angle = seeded(base + i + 100) * Math.PI * 2;
      const distDeg = (radiusM / 111_000) * r;
      const v: Venue = {
        id: `mock_${activity}_${base}_${i}`,
        name: names[i]!,
        address: 'Δοκιμαστική οδός 1',
        location: { lat: center.lat + Math.sin(angle) * distDeg, lng: center.lng + Math.cos(angle) * distDeg },
        rating: Math.round((3.8 + seeded(base + i + 7) * 1.1) * 10) / 10,
        ratingCount: Math.round(50 + seeded(base + i + 13) * 900),
        priceLevel: 1 + Math.floor(seeded(base + i + 21) * 3),
        openNow: true,
      };
      this.venues.set(v.id, v);
      out.push(v);
    }
    return out;
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

  private estimate(a: LatLng, b: LatLng, mode: TransportMode) {
    const distanceKm = haversineKm(a, b) * 1.3;
    const overhead = mode === 'transit' ? 8 : mode === 'car' || mode === 'taxi' ? 4 : 0;
    return { durationMin: (distanceKm / URBAN_SPEED_KMH[mode]) * 60 + overhead, distanceKm };
  }

  async matrix(origins: LatLng[], destinations: LatLng[], mode: TransportMode): Promise<MatrixCell[][]> {
    return origins.map((o) => destinations.map((d) => this.estimate(o, d, mode)));
  }

  async route(origin: LatLng, destination: LatLng, mode: TransportMode) {
    const e = this.estimate(origin, destination, mode);
    return {
      durationMin: Math.round(e.durationMin),
      distanceKm: e.distanceKm,
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
