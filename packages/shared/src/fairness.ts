/**
 * Ο αλγόριθμος «δίκαιου» σημείου του CentiMeet — σε δύο στάδια:
 *
 * 1) ΣΗΜΕΙΟ: για κάθε υποψήφιο σημείο έχουμε τον πραγματικό χρόνο (και κόστος) κάθε ατόμου.
 *      cost = W_MAX·max + W_SPREAD·(max − min) + W_AVG·avg + W_COST·μέσο κόστος(€)
 *    - max:    κανείς να μην ταλαιπωρείται πολύ (minimax)
 *    - spread: δικαιοσύνη – όλοι περίπου ίδιο χρόνο
 *    - avg:    συνολική ευκολία της παρέας
 *    - κόστος: δευτερεύον κριτήριο (1€ ≈ 2.5 λεπτά), ώστε π.χ. το ταξί να μη «σπρώχνει» την παρέα
 *
 * 2) ΜΑΓΑΖΙΑ γύρω από το σημείο: η διαφορά χρόνου μέσα σε λίγες εκατοντάδες μέτρα είναι αμελητέα,
 *    οπότε η σειρά βγαίνει από την ΠΟΙΟΤΗΤΑ: σταθμισμένη βαθμολογία (Bayesian) μείον ποινή «ίσως γεμάτο»
 *    για μεγάλες παρέες.
 */
import type { CrowdHint, ScoredVenue, TravelEstimate, Venue } from './types';

export const POINT_WEIGHTS = {
  max: 1.0,
  spread: 0.8,
  avg: 0.5,
  costMinPerEur: 2.5,
} as const;

export type PointWeights = { [K in keyof typeof POINT_WEIGHTS]: number };

export function travelStats(travel: TravelEstimate[]) {
  if (travel.length === 0) throw new Error('travelStats: empty travel list');
  const mins = travel.map((t) => t.durationMin);
  const max = Math.max(...mins);
  const min = Math.min(...mins);
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
  const avgCost = travel.reduce((a, t) => a + t.costEur, 0) / travel.length;
  return { max, min, avg, spread: max - min, avgCost };
}

/** Κόστος «αδικίας» ενός σημείου (μικρότερο = καλύτερο) */
export function pointFairnessCost(travel: TravelEstimate[], w: PointWeights = POINT_WEIGHTS): number {
  const s = travelStats(travel);
  return w.max * s.max + w.spread * s.spread + w.avg * s.avg + w.costMinPerEur * s.avgCost;
}

/** Μέση βαθμολογία πόλης και «βάρος» της (σε κριτικές) για τη σταθμισμένη βαθμολογία */
export const RATING_PRIOR = { mean: 4.2, weight: 50 } as const;

/**
 * Σταθμισμένη βαθμολογία: με λίγες κριτικές «τραβιέται» προς τον μέσο όρο,
 * ώστε ένα 5.0 με 3 κριτικές να μην περνάει ένα 4.7 με 2.000.
 * Χωρίς βαθμολογία → λίγο κάτω από τον μέσο όρο.
 */
export function bayesianRating(rating: number | undefined, count: number | undefined, prior = RATING_PRIOR): number {
  if (rating == null) return prior.mean - 0.3;
  const n = Math.max(0, count ?? 0);
  return (n * rating + prior.weight * prior.mean) / (n + prior.weight);
}

/** Μέγιστη ποινή (σε αστέρια) για «ίσως γεμάτο» — risk 1 → −0.5★ */
export const CROWD_PENALTY_STARS = 0.5;

export function venueQuality(venue: Venue, crowd?: CrowdHint): number {
  return bayesianRating(venue.rating, venue.ratingCount) - CROWD_PENALTY_STARS * (crowd?.risk ?? 0);
}

/**
 * Κατατάσσει τα μαγαζιά ΜΙΑΣ περιοχής κατά ποιότητα και δίνει score 0-100
 * (100 = το καλύτερο της περιοχής). Ισοπαλία → το πιο κοντινό στο σημείο.
 */
export function rankVenuesByQuality(
  items: {
    venue: Venue;
    travel: TravelEstimate[];
    areaId: string;
    distanceM: number;
    crowd?: CrowdHint;
  }[],
): ScoredVenue[] {
  const withQ = items
    .filter((i) => i.travel.length > 0)
    .map((i) => ({ ...i, quality: venueQuality(i.venue, i.crowd), stats: travelStats(i.travel) }));
  if (withQ.length === 0) return [];

  const best = Math.max(...withQ.map((i) => i.quality));
  const worst = Math.min(...withQ.map((i) => i.quality));
  const range = best - worst || 1;

  return withQ
    .sort((a, b) => b.quality - a.quality || a.distanceM - b.distanceM)
    .map((i) => ({
      venue: i.venue,
      travel: i.travel,
      areaId: i.areaId,
      distanceM: Math.round(i.distanceM),
      crowd: i.crowd,
      quality: Math.round(i.quality * 100) / 100,
      score: Math.round(100 - ((best - i.quality) / range) * 100),
      maxMin: Math.round(i.stats.max),
      minMin: Math.round(i.stats.min),
      avgMin: Math.round(i.stats.avg),
      spreadMin: Math.round(i.stats.spread),
    }));
}
