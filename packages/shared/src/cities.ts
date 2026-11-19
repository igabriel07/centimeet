/**
 * Ρυθμίσεις ανά πόλη. Νέα πόλη = νέα εγγραφή εδώ, χωρίς αλλαγές στον κώδικα.
 *
 * ⚠️ Τιμές εισιτηρίων / ταξί / καυσίμων είναι ΕΝΔΕΙΚΤΙΚΕΣ για το MVP.
 *    Επαληθεύστε τες πριν το launch (ΟΑΣΑ, ΟΑΣΘ, ταρίφα ταξί) και, ιδανικά,
 *    μεταφέρετέ τες σε πίνακα της βάσης ώστε να αλλάζουν χωρίς νέο build.
 */
import { haversineKm } from './geo';
import type { CityId, LatLng, TransportMode } from './types';

export type TransitHub = { id: string; label: string; location: LatLng };

/** Ζώνη όπου το parking θέλει περισσότερο ψάξιμο (π.χ. κέντρο) */
export type ParkingZone = { label: string; center: LatLng; radiusKm: number; carMin: number; motorbikeMin: number };

export type CityConfig = {
  id: CityId;
  label: string;
  center: LatLng;
  /** Ζώνη ώρας (για ωράρια μαγαζιών και ώρες αιχμής) */
  timeZone: string;
  /** Ακτίνα (km) γύρω από το κέντρο όπου δεχόμαστε πάντα αφετηρίες */
  serviceRadiusKm: number;
  /**
   * Νομός/περιφέρεια: δεχόμαστε και αφετηρίες μέσα σε αυτό το (χοντρικό) πολύγωνο,
   * π.χ. ένα χωριό της Θεσσαλονίκης μετράει σαν Θεσσαλονίκη.
   */
  region: { label: string; polygon: LatLng[] };
  /** Γνωστοί κόμβοι – χρησιμοποιούνται ως «εναλλακτικές περιοχές» */
  hubs: TransitHub[];
  transit: { singleTicketEur: number; note: string };
  taxi: { startEur: number; perKmEur: number; perHourWaitingEur: number; minimumEur: number };
  /** Εκτίμηση λεπτών για εύρεση parking (προστίθεται στον χρόνο οδηγών). ⚠️ Ενδεικτικά. */
  parking: { zones: ParkingZone[]; carMin: number; motorbikeMin: number };
};

export const CITY_CONFIG: Record<CityId, CityConfig> = {
  athens: {
    id: 'athens',
    label: 'Αθήνα',
    center: { lat: 37.9838, lng: 23.7275 },
    timeZone: 'Europe/Athens',
    serviceRadiusKm: 35,
    // Αττική (ηπειρωτική + Σαλαμίνα) — όχι Εύβοια / Κορινθία
    region: {
      label: 'Αττικής',
      polygon: [
        { lat: 38.33, lng: 23.62 },
        { lat: 38.36, lng: 23.85 },
        { lat: 38.25, lng: 24.08 },
        { lat: 38.0, lng: 24.1 },
        { lat: 37.62, lng: 24.08 },
        { lat: 37.6, lng: 23.95 },
        { lat: 37.8, lng: 23.7 },
        { lat: 37.85, lng: 23.4 },
        { lat: 37.92, lng: 23.3 },
        { lat: 37.95, lng: 23.1 },
        { lat: 38.1, lng: 23.1 },
        { lat: 38.25, lng: 23.25 },
        { lat: 38.3, lng: 23.45 },
      ],
    },
    hubs: [
      { id: 'syntagma', label: 'Σύνταγμα', location: { lat: 37.9755, lng: 23.7348 } },
      { id: 'monastiraki', label: 'Μοναστηράκι', location: { lat: 37.9761, lng: 23.7257 } },
      { id: 'omonia', label: 'Ομόνοια', location: { lat: 37.9841, lng: 23.728 } },
      { id: 'koukaki', label: 'Κουκάκι', location: { lat: 37.9655, lng: 23.7247 } },
      { id: 'kolonaki', label: 'Κολωνάκι', location: { lat: 37.9779, lng: 23.7433 } },
      { id: 'kifisia', label: 'Κηφισιά', location: { lat: 38.0736, lng: 23.8114 } },
      { id: 'marousi', label: 'Μαρούσι', location: { lat: 38.0561, lng: 23.8053 } },
      { id: 'chalandri', label: 'Χαλάνδρι', location: { lat: 38.0213, lng: 23.7985 } },
      { id: 'peristeri', label: 'Περιστέρι', location: { lat: 38.0134, lng: 23.6953 } },
      { id: 'kallithea', label: 'Καλλιθέα', location: { lat: 37.9558, lng: 23.7016 } },
      { id: 'piraeus', label: 'Πειραιάς', location: { lat: 37.9478, lng: 23.6432 } },
      { id: 'glyfada', label: 'Γλυφάδα', location: { lat: 37.8636, lng: 23.7536 } },
      { id: 'nea-smyrni', label: 'Νέα Σμύρνη', location: { lat: 37.9437, lng: 23.7139 } },
      { id: 'ampelokipoi', label: 'Αμπελόκηποι', location: { lat: 37.9873, lng: 23.7573 } },
    ],
    transit: { singleTicketEur: 1.2, note: 'Ενιαίο εισιτήριο ΟΑΣΑ 90′ (επαληθεύστε)' },
    taxi: { startEur: 1.85, perKmEur: 0.9, perHourWaitingEur: 12, minimumEur: 4.0 },
    parking: {
      zones: [
        { label: 'Κέντρο', center: { lat: 37.9785, lng: 23.7305 }, radiusKm: 2.5, carMin: 12, motorbikeMin: 3 },
        { label: 'Κηφισιά', center: { lat: 38.0736, lng: 23.8114 }, radiusKm: 1.0, carMin: 8, motorbikeMin: 2 },
        { label: 'Γλυφάδα', center: { lat: 37.8636, lng: 23.7536 }, radiusKm: 1.0, carMin: 8, motorbikeMin: 2 },
      ],
      carMin: 5,
      motorbikeMin: 1,
    },
  },
  thessaloniki: {
    id: 'thessaloniki',
    label: 'Θεσσαλονίκη',
    center: { lat: 40.6401, lng: 22.9444 },
    timeZone: 'Europe/Athens',
    serviceRadiusKm: 25,
    // Νομός Θεσσαλονίκης — όχι Χαλκιδική / Κιλκίς / Ημαθία
    region: {
      label: 'ν. Θεσσαλονίκης',
      polygon: [
        { lat: 40.95, lng: 22.55 },
        { lat: 40.97, lng: 23.1 },
        { lat: 40.9, lng: 23.45 },
        { lat: 40.8, lng: 23.75 },
        { lat: 40.7, lng: 23.8 },
        { lat: 40.62, lng: 23.4 },
        { lat: 40.55, lng: 23.2 },
        { lat: 40.4, lng: 23.05 },
        { lat: 40.4, lng: 22.85 },
        { lat: 40.52, lng: 22.8 },
        { lat: 40.58, lng: 22.62 },
        { lat: 40.7, lng: 22.48 },
      ],
    },
    hubs: [
      { id: 'aristotelous', label: 'Πλ. Αριστοτέλους', location: { lat: 40.6325, lng: 22.9408 } },
      { id: 'ladadika', label: 'Λαδάδικα', location: { lat: 40.6357, lng: 22.9358 } },
      { id: 'kamara', label: 'Καμάρα', location: { lat: 40.6326, lng: 22.9518 } },
      { id: 'kalamaria', label: 'Καλαμαριά', location: { lat: 40.5826, lng: 22.9506 } },
      { id: 'toumpa', label: 'Τούμπα', location: { lat: 40.6122, lng: 22.9682 } },
      { id: 'neapoli', label: 'Νεάπολη', location: { lat: 40.6533, lng: 22.9425 } },
      { id: 'evosmos', label: 'Εύοσμος', location: { lat: 40.6676, lng: 22.9086 } },
      { id: 'panorama', label: 'Πανόραμα', location: { lat: 40.5876, lng: 23.0303 } },
    ],
    transit: { singleTicketEur: 1.0, note: 'Εισιτήριο ΟΑΣΘ (επαληθεύστε)' },
    taxi: { startEur: 1.85, perKmEur: 0.9, perHourWaitingEur: 12, minimumEur: 4.0 },
    parking: {
      zones: [{ label: 'Κέντρο', center: { lat: 40.6345, lng: 22.9425 }, radiusKm: 2.0, carMin: 12, motorbikeMin: 3 }],
      carMin: 5,
      motorbikeMin: 1,
    },
  },
};

/** Λεπτά εύρεσης parking στο σημείο για αυτό το μέσο (0 για ταξί/πόδια/συγκοινωνίες) */
export function parkingSearchMinutes(city: CityId, mode: TransportMode, at: LatLng): number {
  if (mode !== 'car' && mode !== 'motorbike') return 0;
  const p = CITY_CONFIG[city].parking;
  const zone = p.zones.find((z) => haversineKm(z.center, at) <= z.radiusKm);
  if (mode === 'car') return zone?.carMin ?? p.carMin;
  return zone?.motorbikeMin ?? p.motorbikeMin;
}

/** Σημείο μέσα σε πολύγωνο (ray casting) */
export function pointInPolygon(p: LatLng, poly: readonly LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

/** Αφετηρία αποδεκτή για την πόλη: κοντά στο κέντρο ή μέσα στον νομό */
export function inServiceArea(city: CityId, p: LatLng): boolean {
  const cfg = CITY_CONFIG[city];
  return haversineKm(p, cfg.center) <= cfg.serviceRadiusKm || pointInPolygon(p, cfg.region.polygon);
}
