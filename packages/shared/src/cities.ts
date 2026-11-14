/**
 * Ρυθμίσεις ανά πόλη. Νέα πόλη = νέα εγγραφή εδώ, χωρίς αλλαγές στον κώδικα.
 *
 * ⚠️ Τιμές εισιτηρίων / ταξί / καυσίμων είναι ΕΝΔΕΙΚΤΙΚΕΣ για το MVP.
 *    Επαληθεύστε τες πριν το launch (ΟΑΣΑ, ΟΑΣΘ, ταρίφα ταξί) και, ιδανικά,
 *    μεταφέρετέ τες σε πίνακα της βάσης ώστε να αλλάζουν χωρίς νέο build.
 */
import type { CityId, LatLng } from './types';

export type TransitHub = { id: string; label: string; location: LatLng };

export type CityConfig = {
  id: CityId;
  label: string;
  center: LatLng;
  /** Ακτίνα (km) εντός της οποίας δεχόμαστε αφετηρίες */
  serviceRadiusKm: number;
  /** Γνωστοί κόμβοι – χρησιμοποιούνται ως «εναλλακτικές περιοχές» */
  hubs: TransitHub[];
  transit: { singleTicketEur: number; note: string };
  taxi: { startEur: number; perKmEur: number; perHourWaitingEur: number; minimumEur: number };
};

export const CITY_CONFIG: Record<CityId, CityConfig> = {
  athens: {
    id: 'athens',
    label: 'Αθήνα',
    center: { lat: 37.9838, lng: 23.7275 },
    serviceRadiusKm: 35,
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
  },
  thessaloniki: {
    id: 'thessaloniki',
    label: 'Θεσσαλονίκη',
    center: { lat: 40.6401, lng: 22.9444 },
    serviceRadiusKm: 25,
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
  },
};
