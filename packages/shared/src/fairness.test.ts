import { describe, expect, it } from 'vitest';
import {
  bayesianRating,
  buildPersonalMessage,
  channelUrl,
  estimateTripCost,
  haversineKm,
  pointFairnessCost,
  rankVenuesByQuality,
  weightedCentroid,
} from './index';
import type { CrowdHint, TravelEstimate, Venue } from './index';

const v = (id: string, rating?: number, ratingCount = 500): Venue => ({
  id,
  name: id,
  location: { lat: 0, lng: 0 },
  rating,
  ratingCount,
});
const t = (...mins: number[]): TravelEstimate[] =>
  mins.map((m, i) => ({ participantId: `p${i}`, durationMin: m, distanceKm: 1, costEur: 0 }));

describe('pointFairnessCost', () => {
  it('προτιμά το δίκαιο σημείο από αυτό με χαμηλότερο μέσο όρο αλλά μεγάλη ανισότητα', () => {
    const unfair = pointFairnessCost(t(5, 5, 45)); // avg 18.3, max 45
    const fair = pointFairnessCost(t(20, 22, 24)); // avg 22, max 24
    expect(fair).toBeLessThan(unfair);
  });

  it('το κόστος μετράει, αλλά δευτερευόντως', () => {
    const cheap = t(20, 20, 20);
    const pricey = t(20, 20, 20).map((x) => ({ ...x, costEur: 6 })); // +6€/άτομο ≈ +15′
    expect(pointFairnessCost(cheap)).toBeLessThan(pointFairnessCost(pricey));
    // …όμως 2€ παραπάνω δεν νικούν 15 λεπτά λιγότερης ταλαιπωρίας για τον πιο αργό
    const slowButCheap = t(20, 20, 35);
    const fastButDearer = t(20, 20, 20).map((x) => ({ ...x, costEur: 2 }));
    expect(pointFairnessCost(fastButDearer)).toBeLessThan(pointFairnessCost(slowButCheap));
  });
});

describe('bayesianRating', () => {
  it('ένα 5.0 με 3 κριτικές δεν περνάει ένα 4.7 με 2.000', () => {
    expect(bayesianRating(4.7, 2000)).toBeGreaterThan(bayesianRating(5.0, 3));
  });
  it('χωρίς κριτικές = μέσος όρος πόλης, χωρίς βαθμολογία = λίγο κάτω', () => {
    expect(bayesianRating(5, 0)).toBeCloseTo(4.2);
    expect(bayesianRating(undefined, undefined)).toBeCloseTo(3.9);
  });
});

describe('rankVenuesByQuality', () => {
  const item = (venue: Venue, distanceM = 100, crowd?: CrowdHint) => ({ venue, travel: t(20, 22), areaId: 'a', distanceM, crowd });

  it('σειρά κατά σταθμισμένη βαθμολογία, score 100 → 0', () => {
    const ranked = rankVenuesByQuality([item(v('meh', 3.9, 800)), item(v('great', 4.8, 1500)), item(v('few', 5.0, 4))]);
    expect(ranked.map((r) => r.venue.id)).toEqual(['great', 'few', 'meh']);
    expect(ranked[0]!.score).toBe(100);
    expect(ranked.at(-1)!.score).toBe(0);
  });

  it('το «ίσως γεμάτο» κατεβάζει ένα μαγαζί κάτω από ένα ελαφρώς χειρότερο', () => {
    const busy: CrowdHint = { risk: 0.9, callAhead: true, reasons: ['peak_time'] };
    const ranked = rankVenuesByQuality([item(v('busy', 4.7, 2000), 100, busy), item(v('calm', 4.5, 1500))]);
    expect(ranked.map((r) => r.venue.id)).toEqual(['calm', 'busy']);
    expect(ranked[1]!.crowd?.callAhead).toBe(true);
  });

  it('ισοπαλία → το πιο κοντινό στο σημείο', () => {
    const ranked = rankVenuesByQuality([item(v('far', 4.5, 500), 280), item(v('near', 4.5, 500), 40)]);
    expect(ranked[0]!.venue.id).toBe('near');
  });

  it('επιστρέφει κενή λίστα χωρίς δεδομένα', () => {
    expect(rankVenuesByQuality([])).toEqual([]);
  });
});

describe('weightedCentroid', () => {
  it('τραβάει το κέντρο προς αυτόν που περπατάει', () => {
    const c = weightedCentroid([
      { origin: { lat: 0, lng: 0 }, mode: 'walk' },
      { origin: { lat: 0, lng: 1 }, mode: 'car' },
    ]);
    expect(c.lng).toBeLessThan(0.5);
  });
});

describe('estimateTripCost', () => {
  it('υπολογίζει καύσιμα για αυτοκίνητο', () => {
    const { costEur } = estimateTripCost('athens', 'car', 10, 20, {
      fuelPriceEurPerL: 2,
      carLPer100Km: 10,
      motorbikeLPer100Km: 4,
    });
    expect(costEur).toBe(2);
  });
  it('ταξί έχει ελάχιστη χρέωση', () => {
    expect(estimateTripCost('athens', 'taxi', 0.3, 2).costEur).toBeGreaterThanOrEqual(4);
  });
  it('περπάτημα δωρεάν', () => {
    expect(estimateTripCost('thessaloniki', 'walk', 2, 25).costEur).toBe(0);
  });
});

describe('geo', () => {
  it('Σύνταγμα → Κηφισιά ≈ 14 km', () => {
    const d = haversineKm({ lat: 37.9755, lng: 23.7348 }, { lat: 38.0736, lng: 23.8114 });
    expect(d).toBeGreaterThan(12);
    expect(d).toBeLessThan(15);
  });
});

describe('share', () => {
  it('φτιάχνει προσωπικό μήνυμα και viber link', () => {
    const msg = buildPersonalMessage({
      venue: v('Café Μέση'),
      plan: {
        participantId: 'p1',
        name: 'Μαρία',
        mode: 'transit',
        durationMin: 18,
        distanceKm: 6,
        costEur: 1.2,
        costNote: '',
        transitSteps: [{ kind: 'metro', line: 'M3', durationMin: 12 }],
        navigationUrl: 'https://maps.example',
      },
    });
    expect(msg).toContain('Μαρία');
    expect(msg).toContain('M3');
    expect(channelUrl('viber', msg)).toMatch(/^viber:\/\/forward\?text=/);
  });
});
