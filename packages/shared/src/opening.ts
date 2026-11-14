// Ωράρια: «θα είναι ανοιχτό την ώρα της συνάντησης;» στην τοπική ώρα της πόλης.
import type { OpeningPeriod } from './types';

const WEEK_MIN = 7 * 24 * 60;
const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ημέρα (0 = Κυριακή) και λεπτά από τα μεσάνυχτα στη ζώνη ώρας της πόλης */
export function localWeekTime(at: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: DAYS[get('weekday')] ?? 0, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Είναι ανοιχτό τη στιγμή `at` και θα μείνει ανοιχτό τουλάχιστον `stayMin` λεπτά;
 * Επιστρέφει undefined όταν δεν ξέρουμε το ωράριο (δεν αποκλείουμε το μαγαζί).
 */
export function isOpenAt(
  periods: OpeningPeriod[] | undefined,
  at: Date,
  stayMin: number,
  timeZone: string,
): boolean | undefined {
  if (!periods?.length) return undefined;
  const { day, minutes } = localWeekTime(at, timeZone);
  const t = day * 1440 + minutes;
  for (const p of periods) {
    if (!p.close) return true; // 24/7
    const open = p.open.day * 1440 + p.open.hour * 60 + p.open.minute;
    let close = p.close.day * 1440 + p.close.hour * 60 + p.close.minute;
    if (close <= open) close += WEEK_MIN; // περνάει τα μεσάνυχτα του Σαββάτου
    for (const s of [t, t + WEEK_MIN]) {
      if (s >= open && s + stayMin <= close) return true;
    }
  }
  return false;
}
