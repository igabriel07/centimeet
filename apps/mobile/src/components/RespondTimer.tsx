/**
 * «⏳ 23:41 για απαντήσεις» — αντίστροφη μέτρηση της προθεσμίας απάντησης (τη βλέπουν όλοι).
 * Όταν απαντήσουν όλοι: «✓ Απάντησαν όλοι». Όταν λήξει με εκκρεμότητες: «Έληξε ο χρόνος — ακυρώνεται».
 */
import { formatCountdown, showAsDate, timerState } from '@centimeet/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { radius } from '@/theme';
import { AppText as Text, useTheme } from './ui';

/** Τρέχουσα ώρα που ανανεώνεται κάθε `ms` (μόνο όσο χρειάζεται) */
export function useNow(ms: number, enabled = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

export function RespondTimer({
  respondBy,
  unanswered,
  compact,
}: {
  respondBy: string | null | undefined;
  /** Πόσοι καλεσμένοι δεν έχουν απαντήσει */
  unanswered: number;
  /** Μικρό (για κάρτες) */
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const c = useTheme();
  const running = !!respondBy && unanswered > 0;
  // Μακρινή προθεσμία → ημερομηνία (ανανέωση ανά λεπτό αρκεί)
  const far = !!respondBy && showAsDate(new Date(respondBy).getTime() - Date.now());
  const now = useNow(far ? 60_000 : 1000, running);
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR';
  const state = timerState(respondBy, unanswered, now);
  if (state === 'none') return null;

  const { text, color, bg } =
    state === 'running'
      ? {
          text: far
            ? `⏳ ${t('timer.until', { date: new Date(respondBy!).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) })}`
            : `⏳ ${t('timer.left', { time: formatCountdown(new Date(respondBy!).getTime() - now.getTime(), t('timer.dayShort')) })}`,
          color: c.warn,
          bg: 'transparent',
        }
      : state === 'allAnswered'
        ? { text: `✓ ${t('timer.allAnswered')}`, color: c.good, bg: 'transparent' }
        : { text: `⌛ ${t('timer.expired')}`, color: c.danger, bg: 'transparent' };

  return (
    <View
      accessibilityRole="timer"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: color,
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: compact ? 8 : 12,
        paddingVertical: compact ? 2 : 5,
        marginTop: compact ? 6 : 8,
      }}
    >
      <Text style={{ color, fontWeight: '700', fontSize: compact ? 12 : 14, fontVariant: ['tabular-nums'] }}>{text}</Text>
    </View>
  );
}
