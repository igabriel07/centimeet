import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { calendarWeeks, dayOffsetOf, favoriteWhen, nextTimeOfDay, dayTime, defaultCustom, inHours, IN_HOURS_OPTIONS, isPastSlot } from './when';

// Τοπική ώρα: οι συναρτήσεις δουλεύουν σε ώρα συσκευής, οπότε κλειδώνουμε ζώνη στο test
const TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Athens';
});
afterAll(() => {
  process.env.TZ = TZ;
  vi.useRealTimers();
});

const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi);

describe('Πότε;', () => {
  it('επιλογές «σε Ν ώρες»', () => {
    expect(IN_HOURS_OPTIONS).toEqual([0.5, 1, 2, 3, 4, 5]);
  });
  it('σε μισή ώρα / σε 3 ώρες', () => {
    const now = local(2026, 11, 15, 18, 10);
    expect(inHours(now, 0.5)).toEqual(local(2026, 11, 15, 18, 40));
    expect(inHours(now, 3)).toEqual(local(2026, 11, 15, 21, 10));
  });
  it('μέρα + ώρα (και αλλαγή μήνα)', () => {
    const now = local(2026, 11, 29, 18, 10);
    expect(dayTime(now, 0, 21, 30)).toEqual(local(2026, 11, 29, 21, 30));
    expect(dayTime(now, 3, 9, 0)).toEqual(local(2026, 12, 2, 9, 0));
  });
  it('προεπιλογή: σε ~1 ώρα, στο επόμενο τέταρτο', () => {
    expect(defaultCustom(local(2026, 11, 15, 18, 10))).toEqual({ dayOffset: 0, hour: 19, minute: 15 });
    expect(defaultCustom(local(2026, 11, 15, 18, 0))).toEqual({ dayOffset: 0, hour: 19, minute: 0 });
  });
  it('προεπιλογή αργά το βράδυ → αύριο', () => {
    expect(defaultCustom(local(2026, 11, 15, 23, 20))).toEqual({ dayOffset: 1, hour: 0, minute: 30 });
    expect(defaultCustom(local(2026, 11, 15, 22, 50))).toEqual({ dayOffset: 1, hour: 0, minute: 0 });
  });
  it('ώρες που πέρασαν σήμερα', () => {
    const now = local(2026, 11, 15, 18, 10);
    expect(isPastSlot(now, 0, 18, 0)).toBe(true);
    expect(isPastSlot(now, 0, 18, 15)).toBe(false);
    expect(isPastSlot(now, 1, 8, 0)).toBe(false);
  });
});

describe('ημερολόγιο', () => {
  it('Νοέμβριος 2026: ξεκινά Κυριακή → 6 κενά, 30 μέρες', () => {
    const weeks = calendarWeeks(2026, 10);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, 1]);
    expect(weeks.flat().filter((x) => x !== null)).toHaveLength(30);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('απόσταση σε μέρες', () => {
    const now = new Date(2026, 10, 16, 22, 0);
    expect(dayOffsetOf(now, new Date(2026, 10, 16, 1, 0))).toBe(0);
    expect(dayOffsetOf(now, new Date(2026, 10, 18, 9, 0))).toBe(2);
  });
});

describe('αγαπημένη ώρα', () => {
  const row = (meet: Date | null, created: Date, is_organizer = true) => ({
    meet_at: meet ? meet.toISOString() : null,
    created_at: created.toISOString(),
    is_organizer,
  });
  const c1 = new Date(2026, 10, 1, 12, 0);
  const c2 = new Date(2026, 10, 5, 10, 0);
  const c3 = new Date(2026, 10, 9, 15, 0);

  it('συνηθισμένη ώρα της ημέρας (≥2 φορές)', () => {
    const fav = favoriteWhen([
      row(new Date(2026, 10, 1, 21, 0), c1),
      row(new Date(2026, 10, 5, 21, 0), c2),
      row(new Date(2026, 10, 9, 18, 30), c3),
    ]);
    expect(fav).toEqual({ kind: 'time', hour: 21, minute: 0 });
  });

  it('«σε 2 ώρες» αναγνωρίζεται· το «σε 1 ώρα» αγνοείται (υπάρχει ήδη)', () => {
    expect(favoriteWhen([row(new Date(c1.getTime() + 2 * 3600_000), c1), row(new Date(c2.getTime() + 2 * 3600_000 + 60_000), c2)])).toEqual({
      kind: 'hours',
      hours: 2,
    });
    expect(favoriteWhen([row(new Date(c1.getTime() + 3600_000), c1), row(new Date(c2.getTime() + 3600_000), c2)])).toBeNull();
  });

  it('μία φορά, χωρίς ώρα ή όχι διοργανωτής → τίποτα', () => {
    expect(favoriteWhen([row(new Date(2026, 10, 1, 21, 0), c1)])).toBeNull();
    expect(favoriteWhen([row(null, c1), row(null, c2)])).toBeNull();
    expect(favoriteWhen([row(new Date(2026, 10, 1, 21, 0), c1, false), row(new Date(2026, 10, 5, 21, 0), c2, false)])).toBeNull();
  });

  it('επόμενη 21:00: σήμερα ή αύριο', () => {
    expect(nextTimeOfDay(new Date(2026, 10, 16, 18, 0), 21, 0).getDate()).toBe(16);
    expect(nextTimeOfDay(new Date(2026, 10, 16, 22, 0), 21, 0).getDate()).toBe(17);
  });
});
