/**
 * «Ίσως έχει κόσμο» — Φάση 1: ΕΚΤΙΜΗΣΗ χωρίς δεδομένα επισκεψιμότητας.
 *
 * Το Google δεν δίνει popular times μέσω API, οπότε συνδυάζουμε:
 *  - δημοφιλία (αριθμός κριτικών, λογαριθμικά),
 *  - ώρα αιχμής για το είδος (τοπική ώρα πόλης),
 *  - μέγεθος παρέας,
 *  - goodForGroups (αν το ξέρουμε).
 * Το αποτέλεσμα είναι πάντα «ίσως» — ποτέ βεβαιότητα.
 */
import { localWeekTime } from './opening';
import type { Activity, CrowdHint, CrowdReason, Venue } from './types';

/** Από τόσα άτομα και πάνω θεωρούμε ότι χρειάζεται τραπέζι για παρέα */
export const LARGE_GROUP = 6;
/** Από τόσα άτομα και πάνω ακόμη και ένα «ήσυχο» μαγαζί μπορεί να μη χωράει */
export const HUGE_GROUP = 10;
/** Τόσες κριτικές ≈ «πολύ δημοφιλές» (popularity = 1) */
const POPULAR_REVIEWS = 3000;
const CALL_AHEAD_RISK = 0.3;
const MIN_REPORTED_RISK = 0.15;

type Window = { days: number[]; from: string; to: string };
const FRI_SAT = [5, 6];
const WEEKEND = [0, 6];

/** Ενδεικτικές ώρες αιχμής (0 = Κυριακή). «to» μικρότερο από «from» = περνάει τα μεσάνυχτα. */
export const PEAK_WINDOWS: Record<Activity, Window[]> = {
  coffee: [
    { days: WEEKEND, from: '11:00', to: '14:30' },
    { days: [0, 1, 2, 3, 4, 5, 6], from: '18:00', to: '21:00' },
  ],
  brunch: [{ days: WEEKEND, from: '10:30', to: '14:30' }],
  food: [
    { days: [4, ...FRI_SAT], from: '21:00', to: '23:30' },
    { days: [0], from: '13:30', to: '16:30' },
  ],
  drinks: [{ days: [4, ...FRI_SAT], from: '22:00', to: '02:00' }],
  dessert: [{ days: [5, 6, 0], from: '19:00', to: '23:00' }],
  cinema: [{ days: [5, 6, 0], from: '19:00', to: '23:00' }],
};

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + m!;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function isPeak(activity: Activity, at: Date, timeZone: string): boolean {
  const { day, minutes } = localWeekTime(at, timeZone);
  return PEAK_WINDOWS[activity].some((w) => {
    const from = hm(w.from);
    const to = hm(w.to);
    if (to > from) return w.days.includes(day) && minutes >= from && minutes < to;
    // π.χ. 22:00–02:00: είτε σήμερα μετά τις 22:00 είτε χθες ήταν μέρα αιχμής και είναι πριν τις 02:00
    return (w.days.includes(day) && minutes >= from) || (w.days.includes((day + 6) % 7) && minutes < to);
  });
}

export function crowdHint(input: {
  venue: Venue;
  activity: Activity;
  groupSize: number;
  at: Date;
  timeZone: string;
}): CrowdHint | undefined {
  const { venue, activity, groupSize, at, timeZone } = input;
  const groupFactor = clamp01((groupSize - 3) / 7); // 4 → 0.14, 6 → 0.43, 10+ → 1
  if (groupFactor === 0) return undefined;

  const popularity = Math.max(
    clamp01(Math.log10(Math.max(1, venue.ratingCount ?? 0)) / Math.log10(POPULAR_REVIEWS)),
    // Λίγες κριτικές ≠ «χωράει»: μικρά/άγνωστα μαγαζιά δύσκολα χωράνε μεγάλη παρέα
    groupSize >= HUGE_GROUP ? 0.5 : 0,
  );
  const peak = isPeak(activity, at, timeZone);
  let risk = popularity * (peak ? 1 : 0.4) * groupFactor;
  if (venue.goodForGroups === false) risk += 0.15 * groupFactor;
  if (venue.goodForGroups === true) risk -= 0.15;
  risk = Math.round(clamp01(risk) * 100) / 100;
  if (risk < MIN_REPORTED_RISK) return undefined;

  const reasons: CrowdReason[] = [];
  if (peak) reasons.push('peak_time');
  if (popularity >= 0.8) reasons.push('very_popular');
  if (groupSize >= LARGE_GROUP) reasons.push('large_group');
  if (venue.goodForGroups === false) reasons.push('not_group_friendly');

  return { risk, callAhead: groupSize >= LARGE_GROUP && risk >= CALL_AHEAD_RISK, reasons };
}
