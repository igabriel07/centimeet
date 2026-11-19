import {
  CITY_CONFIG,
  estimateMinutes,
  haversineKm,
  inServiceArea,
  pointFairnessCost,
  preferenceWeight,
  weightedCentroid,
  type CityId,
  type LatLng,
  type Participant,
  type TravelEstimate,
} from '@centimeet/shared';
import { personTrip } from './modes';

export type CandidatePoint = { id: string; label: string; center: LatLng };

export const CANDIDATES = {
  /** Πόσα σημεία στέλνουμε στο Routes API (άτομα × σημεία = χρεώσιμα στοιχεία) */
  maxRealPoints: 8,
  /** Κόμβοι της πόλης σε αυτή την απόσταση από το κέντρο της παρέας γίνονται υποψήφιοι */
  hubMaxKm: 8,
  /** Ελάχιστη απόσταση μεταξύ σημείων που ελέγχουμε (για ποικιλία) */
  minSeparationKm: 0.6,
  /** Ελάχιστη απόσταση εναλλακτικής περιοχής από την κύρια και μεταξύ τους */
  altMinSeparationKm: 1.2,
} as const;

/**
 * Υποψήφια σημεία συνάντησης:
 *  - το σταθμισμένο κέντρο της παρέας (όποιος πάει με τα πόδια «τραβάει» το κέντρο)
 *  - πλέγμα 3×3 γύρω του (βήμα ανάλογο με το πόσο απλωμένη είναι η παρέα)
 *  - γνωστοί κόμβοι της πόλης κοντά στο κέντρο (σταθμοί, πλατείες — εκεί «δουλεύουν» οι συγκοινωνίες)
 */
export function generateCandidates(city: CityId, participants: Participant[]): CandidatePoint[] {
  const cfg = CITY_CONFIG[city];
  const center = weightedCentroid(participants);
  const spreadKm = Math.max(...participants.map((p) => haversineKm(p.origin, center)));
  const stepKm = Math.min(2, Math.max(0.6, spreadKm * 0.12));
  const dLat = stepKm / 111;
  const dLng = stepKm / (111 * Math.cos((center.lat * Math.PI) / 180));

  const points: CandidatePoint[] = [{ id: 'center', label: '', center }];
  for (const i of [-1, 0, 1]) {
    for (const j of [-1, 0, 1]) {
      if (i === 0 && j === 0) continue;
      points.push({ id: `grid_${i}_${j}`, label: '', center: { lat: center.lat + i * dLat, lng: center.lng + j * dLng } });
    }
  }
  for (const hub of cfg.hubs) {
    if (haversineKm(hub.location, center) <= Math.max(CANDIDATES.hubMaxKm, spreadKm * 0.6)) {
      points.push({ id: hub.id, label: hub.label, center: hub.location });
    }
  }
  return points.map((p) => ({ ...p, label: p.label || labelFor(city, p.center) }));
}

/** Όνομα περιοχής: ο κοντινότερος κόμβος (αν είναι κοντά), αλλιώς «Κέντρο παρέας» */
export function labelFor(city: CityId, at: LatLng): string {
  const nearest = [...CITY_CONFIG[city].hubs].sort((a, b) => haversineKm(a.location, at) - haversineKm(b.location, at))[0];
  if (!nearest) return 'Κέντρο παρέας';
  const d = haversineKm(nearest.location, at);
  if (d < 0.8) return nearest.label;
  if (d < 2.5) return `Κοντά σε ${nearest.label}`;
  return 'Κέντρο παρέας';
}

/** Εκτιμώμενοι χρόνοι χωρίς API (ευθεία × 1.3) — μόνο για το προ-φιλτράρισμα */
export function estimatedTravel(city: CityId, participants: Participant[], point: LatLng): TravelEstimate[] {
  return participants.map((p) => {
    const trip = personTrip(city, p.mode, estimateMinutes(p.origin, point, p.mode), point);
    return { participantId: p.id, durationMin: trip.durationMin, distanceKm: trip.distanceKm, costEur: trip.costEur };
  });
}

/**
 * Κρατά τα `k` πιο υποσχόμενα σημεία (με εκτίμηση χρόνου), με ελάχιστη απόσταση μεταξύ τους.
 * Έτσι στέλνουμε στο Google λίγα σημεία αντί για 20+ → μικρότερο κόστος.
 */
export function prefilterCandidates(
  city: CityId,
  participants: Participant[],
  candidates: CandidatePoint[],
  k: number = CANDIDATES.maxRealPoints,
): CandidatePoint[] {
  const ranked = candidates
    .map((c) => ({ c, cost: pointFairnessCost(estimatedTravel(city, participants, c.center), undefined, participants.map((p) => preferenceWeight(p.preference))) }))
    .sort((a, b) => a.cost - b.cost);
  const picked: CandidatePoint[] = [];
  for (const { c } of ranked) {
    if (picked.length >= k) break;
    if (picked.every((p) => haversineKm(p.center, c.center) >= CANDIDATES.minSeparationKm)) picked.push(c);
  }
  return picked;
}

/** Ελέγχει ότι όλες οι αφετηρίες είναι μέσα στην περιοχή εξυπηρέτησης */
export function outOfServiceArea(city: CityId, participants: Participant[]): Participant[] {
  return participants.filter((p) => !inServiceArea(city, p.origin));
}
