import { describe, expect, it } from 'vitest';
import { crowdHint, isOpenAt, isPeak, localWeekTime, parkingSearchMinutes, type OpeningPeriod, type Venue } from './index';

const TZ = 'Europe/Athens';
// Νοέμβριος 2026: Ελλάδα = UTC+2. 2026-11-20 = Παρασκευή.
const athens = (isoLocal: string) => new Date(`${isoLocal}+02:00`);
const day = (d: number, open: string, close: string, closeDay = d): OpeningPeriod => {
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  return { open: { day: d, hour: oh!, minute: om! }, close: { day: closeDay, hour: ch!, minute: cm! } };
};

describe('localWeekTime', () => {
  it('μετατρέπει σε τοπική ώρα Ελλάδας', () => {
    expect(localWeekTime(new Date('2026-11-20T19:30:00Z'), TZ)).toEqual({ day: 5, minutes: 21 * 60 + 30 });
  });
});

describe('isOpenAt', () => {
  const weekdays = [1, 2, 3, 4, 5].map((d) => day(d, '08:00', '20:00'));

  it('ανοιχτό μέσα στο ωράριο, κλειστό εκτός ή αν κλείνει πριν περάσει ο ελάχιστος χρόνος', () => {
    expect(isOpenAt(weekdays, athens('2026-11-20T10:00:00'), 60, TZ)).toBe(true);
    expect(isOpenAt(weekdays, athens('2026-11-20T21:00:00'), 60, TZ)).toBe(false);
    expect(isOpenAt(weekdays, athens('2026-11-20T19:30:00'), 60, TZ)).toBe(false); // κλείνει σε 30′
    expect(isOpenAt(weekdays, athens('2026-11-22T10:00:00'), 60, TZ)).toBe(false); // Κυριακή
  });

  it('ωράριο που περνάει τα μεσάνυχτα (bar Παρ 20:00 → Σαβ 03:00)', () => {
    const bar = [day(5, '20:00', '03:00', 6)];
    expect(isOpenAt(bar, athens('2026-11-20T23:30:00'), 60, TZ)).toBe(true);
    expect(isOpenAt(bar, athens('2026-11-21T01:00:00'), 60, TZ)).toBe(true);
    expect(isOpenAt(bar, athens('2026-11-21T02:30:00'), 60, TZ)).toBe(false);
  });

  it('Σάββατο → Κυριακή (περνάει το τέλος της εβδομάδας)', () => {
    const bar = [day(6, '20:00', '03:00', 0)];
    expect(isOpenAt(bar, athens('2026-11-22T01:00:00'), 60, TZ)).toBe(true);
  });

  it('24/7 και άγνωστο ωράριο', () => {
    expect(isOpenAt([{ open: { day: 0, hour: 0, minute: 0 } }], athens('2026-11-22T04:00:00'), 60, TZ)).toBe(true);
    expect(isOpenAt(undefined, new Date(), 60, TZ)).toBeUndefined();
  });
});

describe('crowdHint (εκτίμηση Φάσης 1)', () => {
  const popular: Venue = { id: 'v', name: 'Δημοφιλές', location: { lat: 0, lng: 0 }, rating: 4.6, ratingCount: 1500 };
  const fridayDrinks = athens('2026-11-20T23:00:00');
  const tuesdayAfternoon = athens('2026-11-17T16:00:00');

  it('ώρα αιχμής ανά είδος (και μετά τα μεσάνυχτα)', () => {
    expect(isPeak('drinks', fridayDrinks, TZ)).toBe(true);
    expect(isPeak('drinks', athens('2026-11-21T01:30:00'), TZ)).toBe(true); // Σάββατο 01:30, συνέχεια Παρασκευής
    expect(isPeak('drinks', tuesdayAfternoon, TZ)).toBe(false);
    expect(isPeak('food', athens('2026-11-22T12:00:00'), TZ)).toBe(true);
  });

  it('15 άτομα, δημοφιλές, ώρα αιχμής → πρόταση για τηλέφωνο', () => {
    const h = crowdHint({ venue: popular, activity: 'drinks', groupSize: 15, at: fridayDrinks, timeZone: TZ });
    expect(h?.callAhead).toBe(true);
    expect(h?.risk).toBeGreaterThan(0.8);
    expect(h?.reasons).toEqual(expect.arrayContaining(['peak_time', 'very_popular', 'large_group']));
  });

  it('μεγάλη παρέα σε άγνωστο μαγαζί με λίγες κριτικές: πάλι «πάρτε τηλέφωνο»', () => {
    const tiny: Venue = { ...popular, ratingCount: 7 };
    expect(crowdHint({ venue: tiny, activity: 'drinks', groupSize: 15, at: fridayDrinks, timeZone: TZ })?.callAhead).toBe(true);
    // …ενώ για 6 άτομα ένα ήσυχο μαγαζί είναι εντάξει
    expect(crowdHint({ venue: tiny, activity: 'drinks', groupSize: 6, at: fridayDrinks, timeZone: TZ })?.callAhead ?? false).toBe(false);
  });

  it('4 άτομα → καμία ένδειξη, ακόμη και σε ώρα αιχμής', () => {
    expect(crowdHint({ venue: popular, activity: 'drinks', groupSize: 4, at: fridayDrinks, timeZone: TZ })).toBeUndefined();
  });

  it('6 άτομα: τηλέφωνο σε ώρα αιχμής, όχι Τρίτη απόγευμα', () => {
    expect(crowdHint({ venue: popular, activity: 'drinks', groupSize: 6, at: fridayDrinks, timeZone: TZ })?.callAhead).toBe(true);
    expect(crowdHint({ venue: popular, activity: 'drinks', groupSize: 6, at: tuesdayAfternoon, timeZone: TZ })?.callAhead ?? false).toBe(false);
  });

  it('goodForGroups μειώνει, «όχι για παρέες» αυξάνει τον κίνδυνο', () => {
    const base = { activity: 'coffee' as const, groupSize: 8, at: tuesdayAfternoon, timeZone: TZ };
    const plain = crowdHint({ ...base, venue: popular })?.risk ?? 0;
    const friendly = crowdHint({ ...base, venue: { ...popular, goodForGroups: true } })?.risk ?? 0;
    const notFriendly = crowdHint({ ...base, venue: { ...popular, goodForGroups: false } });
    expect(friendly).toBeLessThan(plain);
    expect(notFriendly!.risk).toBeGreaterThan(plain);
    expect(notFriendly!.reasons).toContain('not_group_friendly');
  });
});

describe('parkingSearchMinutes', () => {
  it('περισσότερο ψάξιμο στο κέντρο, λιγότερο για μηχανή, μηδέν για ταξί', () => {
    const syntagma = { lat: 37.9755, lng: 23.7348 };
    const peristeri = { lat: 38.0134, lng: 23.6953 };
    expect(parkingSearchMinutes('athens', 'car', syntagma)).toBe(12);
    expect(parkingSearchMinutes('athens', 'car', peristeri)).toBe(5);
    expect(parkingSearchMinutes('athens', 'motorbike', syntagma)).toBe(3);
    expect(parkingSearchMinutes('athens', 'taxi', syntagma)).toBe(0);
  });
});
