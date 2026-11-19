import { describe, expect, it } from 'vitest';
import { formatCountdown, respondByFrom, TIMER_AMOUNTS, timerAllowed, timerMinutes, timerState } from './index';

const now = new Date('2026-11-20T18:00:00Z');

describe('χρονόμετρο απάντησης', () => {
  it('προθεσμία από τώρα', () => {
    expect(respondByFrom(now, 30).toISOString()).toBe('2026-11-20T18:30:00.000Z');
  });

  it('όχι μετά την ώρα συνάντησης', () => {
    expect(timerAllowed(60, now, '2026-11-20T19:00:00Z')).toBe(true);
    expect(timerAllowed(120, now, '2026-11-20T19:00:00Z')).toBe(false);
    expect(timerAllowed(240, now, undefined)).toBe(true);
  });

  it('μορφή αντίστροφης μέτρησης', () => {
    expect(formatCountdown(23 * 60_000 + 41_000)).toBe('23:41');
    expect(formatCountdown(3_909_000)).toBe('1:05:09');
    expect(formatCountdown(7_000)).toBe('0:07');
    expect(formatCountdown(-5_000)).toBe('0:00');
    expect(formatCountdown(2 * 86_400_000 + 3_909_000, 'ημ')).toBe('2ημ 01:05:09');
  });

  it('μονάδες: λεπτά / ώρες / ημέρες / εβδομάδες / μήνες', () => {
    expect(timerMinutes({ amount: 2, unit: 'weeks' })).toBe(14 * 1440);
    expect(timerMinutes({ amount: 6, unit: 'months' })).toBe(180 * 1440);
    expect(Math.max(...TIMER_AMOUNTS.months)).toBe(6);
    expect(timerMinutes({ amount: 45, unit: 'minutes' })).toBe(45);
    expect(timerMinutes({ amount: 3, unit: 'hours' })).toBe(180);
    expect(timerMinutes({ amount: 2, unit: 'days' })).toBe(2880);
    expect(Math.max(...TIMER_AMOUNTS.days)).toBe(7);
  });

  it('κατάσταση', () => {
    expect(timerState(null, 2, now)).toBe('none');
    expect(timerState('2026-11-20T18:30:00Z', 2, now)).toBe('running');
    expect(timerState('2026-11-20T17:30:00Z', 1, now)).toBe('expired');
    expect(timerState('2026-11-20T17:30:00Z', 0, now)).toBe('allAnswered');
  });
});
