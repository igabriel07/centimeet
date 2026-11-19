/**
 * «Πότε;» στη νέα έξοδο: «σε Ν ώρες» και επιλογή συγκεκριμένης μέρας/ώρας.
 * Όλα σε τοπική ώρα συσκευής.
 */

/** Επιλογές του dropdown «Σε Ν ώρα/ες» */
export const IN_HOURS_OPTIONS = [0.5, 1, 2, 3, 4, 5] as const;
export type InHours = (typeof IN_HOURS_OPTIONS)[number];

/** Πόσες μέρες μπροστά επιτρέπει το ημερολόγιο (σήμερα + 89) — ίδιο όριο με τη βάση (meet_day) */
export const CUSTOM_DAYS = 90;
export const MINUTE_STEP = 15;

export function inHours(now: Date, hours: number): Date {
  return new Date(now.getTime() + Math.round(hours * 60) * 60_000);
}

/** Μέρα (0 = σήμερα) + ώρα:λεπτά → ημερομηνία, σε τοπική ώρα */
export function dayTime(now: Date, dayOffset: number, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Προεπιλογή του επιλογέα: σε περίπου μία ώρα, στρογγυλεμένη στο επόμενο τέταρτο */
export function defaultCustom(now: Date): { dayOffset: number; hour: number; minute: number } {
  const t = inHours(now, 1);
  const total = t.getHours() * 60 + t.getMinutes();
  const rounded = Math.ceil(total / MINUTE_STEP) * MINUTE_STEP;
  const nextDay = rounded >= 24 * 60;
  const startOfToday = dayTime(now, 0, 0, 0);
  const startOfT = dayTime(t, 0, 0, 0);
  const offset = Math.round((startOfT.getTime() - startOfToday.getTime()) / 86_400_000) + (nextDay ? 1 : 0);
  const mins = rounded % (24 * 60);
  return { dayOffset: offset, hour: Math.floor(mins / 60), minute: mins % 60 };
}

/** Η ώρα αυτή της ημέρας έχει περάσει; (για να απενεργοποιείται στη σημερινή μέρα) */
export function isPastSlot(now: Date, dayOffset: number, hour: number, minute: number): boolean {
  return dayTime(now, dayOffset, hour, minute).getTime() <= now.getTime();
}

/** «2026-11-16» — η ημερομηνία της συσκευής (για «Σήμερα» χωρίς ώρα) */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Μέρα συνάντησης χωρίς ώρα → σήμερα / αύριο / άλλη (για εμφάνιση) */
export function dayKind(day: string, now: Date): 'past' | 'today' | 'tomorrow' | 'later' {
  const today = localDayKey(now);
  if (day < today) return 'past';
  if (day === today) return 'today';
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return day === localDayKey(t) ? 'tomorrow' : 'later';
}

/**
 * Ημερολόγιο μήνα (Δευτέρα πρώτη): εβδομάδες με αριθμό ημέρας ή null για τα κενά.
 * month: 0 = Ιανουάριος.
 */
export function calendarWeeks(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Δευτέρα = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Πόσες μέρες από σήμερα (0 = σήμερα) — για όρια του ημερολογίου */
export function dayOffsetOf(now: Date, d: Date): number {
  return Math.round((dayTime(d, 0, 0, 0).getTime() - dayTime(now, 0, 0, 0).getTime()) / 86_400_000);
}

/**
 * «Αγαπημένη» επιλογή ώρας του χρήστη, από τις εξόδους που οργάνωσε:
 *  - hours: «σε Ν ώρες» (η ώρα συνάντησης ≈ Ν ώρες μετά τη δημιουργία) — όχι το 1, που υπάρχει ήδη
 *  - time: συγκεκριμένη ώρα της ημέρας (π.χ. 21:00)
 * Χρειάζεται τουλάχιστον `minUses` φορές· ισοπαλία → η πιο πρόσφατη. Αλλιώς null (καμία έξτρα επιλογή).
 */
export type WhenFavorite = { kind: 'hours'; hours: InHours } | { kind: 'time'; hour: number; minute: number };

export function favoriteWhen(
  rows: { meet_at: string | null; created_at: string; is_organizer: boolean }[],
  minUses = 2,
): WhenFavorite | null {
  const counts = new Map<string, { n: number; last: number; fav: WhenFavorite }>();
  for (const r of rows) {
    if (!r.is_organizer || !r.meet_at) continue;
    const meet = new Date(r.meet_at);
    const created = new Date(r.created_at).getTime();
    const deltaMin = (meet.getTime() - created) / 60_000;
    const hours = IN_HOURS_OPTIONS.find((h) => Math.abs(deltaMin - h * 60) <= 5);
    const fav: WhenFavorite | null =
      hours !== undefined ? (hours === 1 ? null : { kind: 'hours', hours }) : { kind: 'time', hour: meet.getHours(), minute: meet.getMinutes() };
    if (!fav) continue;
    const key = fav.kind === 'hours' ? `h${fav.hours}` : `t${fav.hour}:${fav.minute}`;
    const cur = counts.get(key);
    counts.set(key, { n: (cur?.n ?? 0) + 1, last: Math.max(cur?.last ?? 0, created), fav });
  }
  let best: { n: number; last: number; fav: WhenFavorite } | null = null;
  for (const v of counts.values()) {
    if (v.n < minUses) continue;
    if (!best || v.n > best.n || (v.n === best.n && v.last > best.last)) best = v;
  }
  return best?.fav ?? null;
}

/** Η επόμενη φορά που θα είναι ΩΩ:ΛΛ (σήμερα αν δεν πέρασε, αλλιώς αύριο) */
export function nextTimeOfDay(now: Date, hour: number, minute: number): Date {
  const d = dayTime(now, 0, hour, minute);
  return d.getTime() > now.getTime() ? d : dayTime(now, 1, hour, minute);
}
