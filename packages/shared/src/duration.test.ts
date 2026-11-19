import { describe, expect, it } from 'vitest';
import { DURATION_AMOUNTS, DURATION_MAX, durationAllowed, durationAmount, durationEnd, durationMinutes, endsAtAllowed } from './duration';

describe('duration', () => {
  it('τροχοί', () => {
    expect(DURATION_AMOUNTS.hours).toHaveLength(23);
    expect(DURATION_AMOUNTS.months.at(-1)).toBe(6);
  });
  it('λεπτά', () => {
    expect(durationMinutes({ unit: 'minutes', amount: 45 })).toBe(45);
    expect(durationMinutes({ unit: 'hours', amount: 3 })).toBe(180);
    expect(durationMinutes({ unit: 'days', amount: 2 })).toBe(2880);
    expect(durationMinutes({ unit: 'weeks', amount: 2 })).toBe(20160);
    expect(durationMinutes({ unit: 'months', amount: 6 })).toBe(DURATION_MAX);
  });
  it('λεπτά → μονάδα (για εμφάνιση)', () => {
    expect(durationAmount(43200)).toEqual({ unit: 'months', amount: 1 });
    expect(durationAmount(20160)).toEqual({ unit: 'weeks', amount: 2 });
    expect(durationAmount(10080)).toEqual({ unit: 'weeks', amount: 1 });
    expect(durationAmount(2880)).toEqual({ unit: 'days', amount: 2 });
    expect(durationAmount(180)).toEqual({ unit: 'hours', amount: 3 });
    expect(durationAmount(90)).toEqual({ unit: 'minutes', amount: 90 });
  });
  it('όρια', () => {
    expect(durationAllowed(15)).toBe(true);
    expect(durationAllowed(DURATION_MAX)).toBe(true);
    expect(durationAllowed(10)).toBe(false);
    expect(durationAllowed(DURATION_MAX + 1)).toBe(false);
  });
  it('λήξη', () => {
    expect(durationEnd('2026-11-20T19:00:00.000Z', 120).toISOString()).toBe('2026-11-20T21:00:00.000Z');
  });
  it('ακριβής λήξη', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    expect(endsAtAllowed('2026-11-21T10:00:00Z', now)).toBe(true);
    expect(endsAtAllowed('2026-11-20T09:00:00Z', now)).toBe(false);
    expect(endsAtAllowed('2027-07-01T10:00:00Z', now)).toBe(false);
    expect(endsAtAllowed('2026-11-20T12:00:00Z', now, '2026-11-20T13:00:00Z')).toBe(false);
  });
});
