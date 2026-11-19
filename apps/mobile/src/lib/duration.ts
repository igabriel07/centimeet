/** ⏱ Κείμενα διάρκειας: «3 ώρες», «2 εβδομάδες», «1 μήνας», «έως Πεμ 20 Νοε, 18:00» */
import { durationAmount, durationEnd, durationMinutes, type Duration, type DurationAmount } from '@centimeet/shared';
import type { TFunction } from 'i18next';

/** «1 ώρα» / «3 ημέρες» / «2 εβδομάδες» — ίδιες λέξεις με το χρονόμετρο απάντησης */
export function amountText(t: TFunction, d: DurationAmount): string {
  const one = d.amount === 1;
  switch (d.unit) {
    case 'minutes':
      return one ? t('timer.valueMinuteOne') : t('timer.valueMinutes', { n: d.amount });
    case 'hours':
      return one ? t('timer.valueHourOne') : t('timer.valueHours', { n: d.amount });
    case 'days':
      return one ? t('timer.valueDayOne') : t('timer.valueDays', { n: d.amount });
    case 'weeks':
      return one ? t('timer.valueWeekOne') : t('timer.valueWeeks', { n: d.amount });
    case 'months':
      return one ? t('timer.valueMonthOne') : t('timer.valueMonths', { n: d.amount });
  }
}

export const durationText = (t: TFunction, min: number) => amountText(t, durationAmount(min));

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Ημερομηνία/ώρα λήξης: μόνο ώρα αν είναι την ίδια μέρα με την αρχή */
export function endText(end: Date, start: Date | null, locale: string): string {
  const time = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const;
  return start && sameDay(start, end)
    ? end.toLocaleTimeString(locale, time)
    : end.toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', ...time });
}

/** Ετικέτα της επιλογής στη «Νέα έξοδο» */
export function durationLabel(t: TFunction, d: Duration, locale = 'el-GR'): string {
  return d.kind === 'end' ? t('duration.until', { time: endText(new Date(d.iso), null, locale) }) : amountText(t, d);
}

export const durationToMinutes = (d: Duration) => (d.kind === 'amount' ? durationMinutes(d) : undefined);

/** Γραμμή διάρκειας για σελίδα εξόδου / πρόσκληση (ή null αν δεν ορίστηκε) */
export function durationLine(
  t: TFunction,
  o: { duration_minutes?: number | null; ends_at?: string | null; meet_at?: string | null },
  locale = 'el-GR',
  withEnd = true,
): string | null {
  const start = o.meet_at ? new Date(o.meet_at) : null;
  if (o.ends_at) return t('duration.until', { time: endText(new Date(o.ends_at), start, locale) });
  if (!o.duration_minutes) return null;
  const base = durationText(t, o.duration_minutes);
  if (!start || !withEnd) return base;
  return `${base} (${t('duration.until', { time: endText(durationEnd(start, o.duration_minutes), start, locale) })})`;
}
