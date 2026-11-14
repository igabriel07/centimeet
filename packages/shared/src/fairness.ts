/**
 * Ο αλγόριθμος «δίκαιου» μαγαζιού του CentiMeet.
 *
 * Για κάθε υποψήφιο μαγαζί έχουμε τον χρόνο διαδρομής κάθε ατόμου.
 * Βαθμολογούμε με κόστος (μικρότερο = καλύτερο):
 *
 *   cost = W_MAX * max + W_SPREAD * (max - min) + W_AVG * avg - W_RATING * ratingBonus
 *
 * - max:    κανείς να μην ταλαιπωρείται πολύ (minimax)
 * - spread: δικαιοσύνη – όλοι περίπου ίδιο χρόνο
 * - avg:    συνολική ευκολία της παρέας
 * - rating: μικρό μπόνους για καλά μαγαζιά (δεν υπερισχύει της δικαιοσύνης)
 */
import type { ScoredVenue, TravelEstimate, Venue } from './types';

export const FAIRNESS_WEIGHTS = {
  max: 1.0,
  spread: 0.8,
  avg: 0.5,
  rating: 4.0, // ~4 λεπτά «αξίζει» ένα μαγαζί 5★ έναντι ενός 4★
} as const;

export type FairnessWeights = { [K in keyof typeof FAIRNESS_WEIGHTS]: number };

export function ratingBonus(venue: Venue): number {
  if (venue.rating == null) return 0;
  // Αξιοπιστία: λίγες κριτικές => μικρότερο μπόνους
  const confidence = Math.min(1, (venue.ratingCount ?? 0) / 100);
  return (venue.rating - 4) * confidence; // περίπου -4..+1
}

export function travelStats(travel: TravelEstimate[]) {
  if (travel.length === 0) throw new Error('travelStats: empty travel list');
  const mins = travel.map((t) => t.durationMin);
  const max = Math.max(...mins);
  const min = Math.min(...mins);
  const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
  return { max, min, avg, spread: max - min };
}

export function fairnessCost(
  venue: Venue,
  travel: TravelEstimate[],
  w: FairnessWeights = FAIRNESS_WEIGHTS,
): number {
  const s = travelStats(travel);
  return w.max * s.max + w.spread * s.spread + w.avg * s.avg - w.rating * ratingBonus(venue);
}

/**
 * Κατατάσσει μαγαζιά και τους δίνει score 0-100
 * (100 = το καλύτερο της λίστας, σχετικό με τα υπόλοιπα).
 */
export function rankVenues(
  items: { venue: Venue; travel: TravelEstimate[]; areaId: string }[],
  w: FairnessWeights = FAIRNESS_WEIGHTS,
): ScoredVenue[] {
  const withCost = items
    .filter((i) => i.travel.length > 0)
    .map((i) => ({ ...i, cost: fairnessCost(i.venue, i.travel, w), stats: travelStats(i.travel) }));
  if (withCost.length === 0) return [];

  const best = Math.min(...withCost.map((i) => i.cost));
  const worst = Math.max(...withCost.map((i) => i.cost));
  const range = worst - best || 1;

  return withCost
    .sort((a, b) => a.cost - b.cost)
    .map((i) => ({
      venue: i.venue,
      travel: i.travel,
      areaId: i.areaId,
      score: Math.round(100 - ((i.cost - best) / range) * 100),
      maxMin: Math.round(i.stats.max),
      minMin: Math.round(i.stats.min),
      avgMin: Math.round(i.stats.avg),
      spreadMin: Math.round(i.stats.spread),
    }));
}
