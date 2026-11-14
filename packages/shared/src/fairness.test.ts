import { describe, expect, it } from 'vitest';
import { rankVenues, weightedCentroid, estimateTripCost, haversineKm, buildPersonalMessage, channelUrl } from './index';
import type { TravelEstimate, Venue } from './index';

const v = (id: string, rating?: number, ratingCount = 500): Venue => ({
  id,
  name: id,
  location: { lat: 0, lng: 0 },
  rating,
  ratingCount,
});
const t = (...mins: number[]): TravelEstimate[] =>
  mins.map((m, i) => ({ participantId: `p${i}`, durationMin: m, distanceKm: 1, costEur: 0 }));

describe('rankVenues', () => {
  it('προτιμά το δίκαιο μαγαζί από αυτό με χαμηλότερο μέσο όρο αλλά μεγάλη ανισότητα', () => {
    const ranked = rankVenues([
      { venue: v('unfair'), travel: t(5, 5, 45), areaId: 'a' }, // avg 18.3, max 45
      { venue: v('fair'), travel: t(20, 22, 24), areaId: 'a' }, // avg 22, max 24
    ]);
    expect(ranked[0]!.venue.id).toBe('fair');
    expect(ranked[0]!.score).toBe(100);
    expect(ranked[1]!.score).toBe(0);
  });

  it('η βαθμολογία σπάει ισοπαλίες χωρίς να υπερισχύει της δικαιοσύνης', () => {
    const ranked = rankVenues([
      { venue: v('meh', 3.8), travel: t(20, 20, 20), areaId: 'a' },
      { venue: v('great', 4.8), travel: t(20, 20, 20), areaId: 'a' },
      { venue: v('great-but-far', 5.0), travel: t(15, 15, 50), areaId: 'a' },
    ]);
    expect(ranked.map((r) => r.venue.id)).toEqual(['great', 'meh', 'great-but-far']);
  });

  it('επιστρέφει κενή λίστα χωρίς δεδομένα', () => {
    expect(rankVenues([])).toEqual([]);
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
