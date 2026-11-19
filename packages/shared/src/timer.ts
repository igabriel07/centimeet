// «Χρονόμετρο απάντησης»: προθεσμία μέσα στην οποία πρέπει να απαντήσουν όλοι οι καλεσμένοι,
// αλλιώς η έξοδος ακυρώνεται αυτόματα (βλ. migration respond_by).

/** Μονάδες του «τροχού» */
export const TIMER_UNITS = ['minutes', 'hours', 'days', 'weeks', 'months'] as const;
export type TimerUnit = (typeof TIMER_UNITS)[number];

/** Τιμές ανά μονάδα (μέγιστο 6 μήνες — όριο της βάσης: 186 μέρες) */
export const TIMER_AMOUNTS: Record<TimerUnit, readonly number[]> = {
  minutes: [1, 5, 10, 15, 20, 25, 30, 40, 45, 50],
  hours: Array.from({ length: 23 }, (_, i) => i + 1),
  days: Array.from({ length: 7 }, (_, i) => i + 1),
  weeks: [1, 2, 3, 4],
  months: [1, 2, 3, 4, 5, 6],
};

/** Μήνας = 30 μέρες */
const UNIT_MIN: Record<TimerUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 7 * 1440, months: 30 * 1440 };

export type RespondTimer = { amount: number; unit: TimerUnit };

export const timerMinutes = (t: RespondTimer) => t.amount * UNIT_MIN[t.unit];

/** Η προθεσμία για «σε Ν λεπτά από τώρα» */
export const respondByFrom = (now: Date, minutes: number) => new Date(now.getTime() + minutes * 60_000);

/** Επιτρέπεται; Η προθεσμία δεν μπορεί να είναι μετά την ώρα συνάντησης (αν υπάρχει) */
export function timerAllowed(minutes: number, now: Date, meetAt?: string | null) {
  if (!meetAt) return true;
  return respondByFrom(now, minutes).getTime() <= new Date(meetAt).getTime();
}

/** 2ημ 03:05:09 / 1:05:09 / 23:41 / 0:07 — υπόλοιπο χρόνου (0 όταν έληξε) */
export function formatCountdown(ms: number, dayLabel = 'd') {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}${dayLabel} ${pad(h)}:${pad(m)}:${pad(s)}`;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Πάνω από 7 μέρες: αντί για αντίστροφη μέτρηση δείχνουμε ημερομηνία («Απάντησε έως Κυρ 14 Φεβ») */
export const COUNTDOWN_MAX_MS = 7 * 86_400_000;
export const showAsDate = (ms: number) => ms > COUNTDOWN_MAX_MS;

export type TimerState = 'none' | 'running' | 'allAnswered' | 'expired';

/** Τι δείχνουμε: τρέχει / απάντησαν όλοι / έληξε (θα ακυρωθεί) / χωρίς χρονόμετρο */
export function timerState(respondBy: string | null | undefined, unanswered: number, now: Date): TimerState {
  if (!respondBy) return 'none';
  if (unanswered <= 0) return 'allAnswered';
  return new Date(respondBy).getTime() > now.getTime() ? 'running' : 'expired';
}
