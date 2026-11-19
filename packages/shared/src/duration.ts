/** ⏱ Διάρκεια εξόδου («για πόση ώρα θα πάμε»): αριθμός + μονάδα (όπως το χρονόμετρο) ή ακριβής λήξη */

export const DURATION_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
/** Τιμές των «τροχών» ανά μονάδα */
export const DURATION_AMOUNTS: Record<DurationUnit, readonly number[]> = {
  minutes: [15, 30, 45],
  hours: Array.from({ length: 23 }, (_, i) => i + 1), // 1…23
  days: Array.from({ length: 6 }, (_, i) => i + 1), // 1…6 (7 = 1 εβδομάδα)
  weeks: [1, 2, 3, 4],
  months: [1, 2, 3, 4, 5, 6],
};
/** Μήνας = 30 μέρες */
const UNIT_MIN: Record<DurationUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 7 * 1440, months: 30 * 1440 };
export const DURATION_MIN = 15;
export const DURATION_MAX = 6 * 30 * 1440;
/** Ακριβής λήξη: έως 186 μέρες από τώρα */
export const ENDS_AT_MAX_DAYS = 186;

export type DurationAmount = { unit: DurationUnit; amount: number };
export type Duration = { kind: 'amount'; unit: DurationUnit; amount: number } | { kind: 'end'; iso: string };

export const durationAllowed = (min: number) => Number.isInteger(min) && min >= DURATION_MIN && min <= DURATION_MAX;

export const durationMinutes = (d: DurationAmount) => d.amount * UNIT_MIN[d.unit];

/**
 * Λεπτά → αριθμός + μονάδα για εμφάνιση (μεγαλύτερη μονάδα που διαιρεί ακριβώς):
 * 43200 → 1 μήνας · 20160 → 2 εβδομάδες · 2880 → 2 μέρες · 180 → 3 ώρες · 90 → 90 λεπτά
 */
export function durationAmount(min: number): DurationAmount {
  for (const unit of ['months', 'weeks', 'days', 'hours'] as const) {
    if (min >= UNIT_MIN[unit] && min % UNIT_MIN[unit] === 0) return { unit, amount: min / UNIT_MIN[unit] };
  }
  return { unit: 'minutes', amount: min };
}

/** Ώρα λήξης όταν υπάρχει συγκεκριμένη ώρα συνάντησης */
export function durationEnd(meetAt: string | Date, min: number): Date {
  return new Date(new Date(meetAt).getTime() + min * 60_000);
}

/** Ακριβής λήξη έγκυρη; (μελλοντική, ≤ 186 μέρες, μετά τη συνάντηση) */
export function endsAtAllowed(endsAt: string | Date, now: Date, meetAt?: string | null): boolean {
  const e = new Date(endsAt).getTime();
  if (!(e > now.getTime()) || e > now.getTime() + ENDS_AT_MAX_DAYS * 86_400_000) return false;
  return !meetAt || e > new Date(meetAt).getTime();
}
