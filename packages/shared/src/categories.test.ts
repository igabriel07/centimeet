import { describe, expect, it } from 'vitest';
import { ACTIVITY_CATEGORIES, ALL_CATEGORIES, CATEGORY_EMOJI, categoriesFor, isValidCategory } from './categories';
import { compareSpotKeys, spotRankKey } from './fairness';
import { AreaVenuesRequestSchema, SuggestRequestSchema } from './schemas';
import { ACTIVITIES, isVenueActivity, type TravelEstimate } from './types';

describe('κατηγορίες', () => {
  it('οι δραστηριότητες με μαγαζιά έχουν κατηγορίες, εκτός από τον καφέ· το «Σημείο» όχι', () => {
    for (const a of ACTIVITIES) {
      if (isVenueActivity(a) && a !== 'coffee') expect(categoriesFor(a).length, a).toBeGreaterThan(0);
      else expect(categoriesFor(a), a).toEqual([]);
    }
  });
  it('τα ids είναι μοναδικά σε όλες τις δραστηριότητες', () => {
    expect(new Set(ALL_CATEGORIES).size).toBe(ALL_CATEGORIES.length);
  });
  it('κάθε κατηγορία έχει εικονίδιο', () => {
    for (const c of ALL_CATEGORIES) expect(CATEGORY_EMOJI[c], c).toBeTruthy();
  });
  it('το φαγητό έχει πίτσα και σουβλάκι', () => {
    expect(ACTIVITY_CATEGORIES.food).toContain('pizza');
    expect(ACTIVITY_CATEGORIES.food).toContain('souvlaki');
  });
  it('ενιαίο φαγητό: περιλαμβάνει brunch, γλυκά και μπουγάτσα· δεν υπάρχουν πια «γλυκό»/«brunch»', () => {
    for (const c of ['brunch', 'breakfast', 'bougatsa', 'pastry', 'icecream', 'loukoumades'] as const) {
      expect(ACTIVITY_CATEGORIES.food, c).toContain(c);
    }
    expect(ACTIVITIES).not.toContain('dessert');
    expect(ACTIVITIES).not.toContain('brunch');
  });
  it('το θέατρο είναι δραστηριότητα με κατηγορίες', () => {
    expect(ACTIVITIES).toContain('theater');
    expect(isVenueActivity('theater')).toBe(true);
    expect(isValidCategory('theater', 'standup')).toBe(true);
    expect(isValidCategory('theater', 'pizza')).toBe(false);
  });
  it('isValidCategory', () => {
    expect(isValidCategory('food', 'pizza')).toBe(true);
    expect(isValidCategory('food', undefined)).toBe(true); // «Όλα»
    expect(isValidCategory('food', null)).toBe(true);
    expect(isValidCategory('coffee', 'pizza')).toBe(false);
    expect(isValidCategory('coffee', undefined)).toBe(true);
    expect(isValidCategory('spot', 'pizza')).toBe(false);
    expect(isValidCategory('food', 'nope')).toBe(false);
  });
});

describe('αιτήματα με κατηγορία', () => {
  const base = {
    city: 'athens',
    participants: [
      { id: 'a', name: 'Α', origin: { lat: 37.97, lng: 23.73 }, mode: 'walk' },
      { id: 'b', name: 'Β', origin: { lat: 38.0, lng: 23.76 }, mode: 'car' },
    ],
  };
  it('δέχεται έγκυρο ζεύγος και «Όλα»', () => {
    expect(SuggestRequestSchema.safeParse({ ...base, activity: 'food', category: 'pizza' }).success).toBe(true);
    expect(SuggestRequestSchema.safeParse({ ...base, activity: 'food' }).success).toBe(true);
    expect(SuggestRequestSchema.safeParse({ ...base, activity: 'spot' }).success).toBe(true);
  });
  it('απορρίπτει κατηγορία άλλης δραστηριότητας ή άγνωστη', () => {
    expect(SuggestRequestSchema.safeParse({ ...base, activity: 'coffee', category: 'pizza' }).success).toBe(false);
    expect(SuggestRequestSchema.safeParse({ ...base, activity: 'spot', category: 'pizza' }).success).toBe(false);
    expect(SuggestRequestSchema.safeParse({ ...base, activity: 'food', category: 'kebab' }).success).toBe(false);
  });
  it('το ίδιο και στο «Δες μαγαζιά εδώ»', () => {
    const area = { id: 'x', label: 'Χ', center: { lat: 37.98, lng: 23.74 }, travel: [{ participantId: 'a', durationMin: 10, distanceKm: 1, costEur: 0 }] };
    expect(AreaVenuesRequestSchema.safeParse({ ...base, activity: 'drinks', category: 'wine', area }).success).toBe(true);
    expect(AreaVenuesRequestSchema.safeParse({ ...base, activity: 'drinks', category: 'pizza', area }).success).toBe(false);
  });
});

describe('«Σημείο»: απόσταση → χρόνος → κόστος', () => {
  const t = (km: number, min: number, eur = 0, id = 'p'): TravelEstimate => ({ participantId: id, distanceKm: km, durationMin: min, costEur: eur });
  const rank = (...points: TravelEstimate[][]) =>
    points
      .map((travel, i) => ({ i, key: spotRankKey(travel) }))
      .sort((a, b) => compareSpotKeys(a.key, b.key))
      .map((x) => x.i);

  it('1ο κριτήριο η απόσταση, ακόμη κι αν ο χρόνος είναι χειρότερος', () => {
    const fairByDistance = [t(3, 25, 0, 'a'), t(3, 25, 0, 'b')];
    const fasterButFarther = [t(6, 15, 0, 'a'), t(6, 15, 0, 'b')];
    expect(rank(fasterButFarther, fairByDistance)).toEqual([1, 0]);
  });
  it('δίκαιη κατανομή απόστασης: 4+4 km νικά 1+7 km', () => {
    expect(rank([t(1, 10, 0, 'a'), t(7, 10, 0, 'b')], [t(4, 10, 0, 'a'), t(4, 10, 0, 'b')])).toEqual([1, 0]);
  });
  it('ίδια απόσταση (μέσα στο βήμα) → αποφασίζει ο χρόνος', () => {
    const slow = [t(3.0, 30, 0, 'a'), t(3.0, 30, 0, 'b')];
    const fast = [t(3.05, 18, 0, 'a'), t(3.05, 18, 0, 'b')];
    expect(rank(slow, fast)).toEqual([1, 0]);
  });
  it('ίδια απόσταση και χρόνος → αποφασίζει το κόστος', () => {
    const pricey = [t(3, 20, 4, 'a'), t(3, 20, 4, 'b')];
    const cheap = [t(3, 20, 1.2, 'a'), t(3, 20, 1.2, 'b')];
    expect(rank(pricey, cheap)).toEqual([1, 0]);
  });
  it('το κόστος δεν υπερισχύει της απόστασης', () => {
    const farFree = [t(8, 20, 0, 'a'), t(8, 20, 0, 'b')];
    const nearPaid = [t(3, 20, 5, 'a'), t(3, 20, 5, 'b')];
    expect(rank(farFree, nearPaid)).toEqual([1, 0]);
  });
  it('κενή λίστα → σφάλμα', () => {
    expect(() => spotRankKey([])).toThrow();
  });
});
