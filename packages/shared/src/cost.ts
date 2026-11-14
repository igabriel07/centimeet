import { CITY_CONFIG } from './cities';
import type { CityId, TransportMode } from './types';

/** Παράμετροι κόστους που μπορεί να αλλάξει ο χρήστης στο προφίλ του */
export type CostSettings = {
  fuelPriceEurPerL: number; // αμόλυβδη
  carLPer100Km: number;
  motorbikeLPer100Km: number;
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  fuelPriceEurPerL: 1.8, // ενδεικτική – να ενημερώνεται από το backend
  carLPer100Km: 7.5, // αστική κατανάλωση
  motorbikeLPer100Km: 4.0,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Εκτιμώμενο κόστος ΜΟΝΟ μετάβασης για ένα άτομο.
 * Δεν περιλαμβάνει πάρκινγκ (εμφανίζεται ξεχωριστά στις επιλογές parking).
 */
export function estimateTripCost(
  city: CityId,
  mode: TransportMode,
  distanceKm: number,
  durationMin: number,
  settings: CostSettings = DEFAULT_COST_SETTINGS,
): { costEur: number; note: string } {
  const cfg = CITY_CONFIG[city];
  switch (mode) {
    case 'car':
      return {
        costEur: round2((distanceKm * settings.carLPer100Km * settings.fuelPriceEurPerL) / 100),
        note: 'Καύσιμα (εκτίμηση)',
      };
    case 'motorbike':
      return {
        costEur: round2((distanceKm * settings.motorbikeLPer100Km * settings.fuelPriceEurPerL) / 100),
        note: 'Καύσιμα (εκτίμηση)',
      };
    case 'transit':
      return { costEur: cfg.transit.singleTicketEur, note: cfg.transit.note };
    case 'taxi': {
      // Χονδρική εκτίμηση: ~20% του χρόνου σε στάση/κίνηση
      const waitingEur = ((durationMin * 0.2) / 60) * cfg.taxi.perHourWaitingEur;
      const fare = cfg.taxi.startEur + distanceKm * cfg.taxi.perKmEur + waitingEur;
      return { costEur: round2(Math.max(cfg.taxi.minimumEur, fare)), note: 'Ταξί (εκτίμηση)' };
    }
    case 'walk':
    case 'bike':
      return { costEur: 0, note: 'Δωρεάν' };
  }
}
