/**
 * Χρονόμετρο απάντησης: «dropdown» (κουμπί με την τρέχουσα τιμή ▾) → pop-up με δύο «τροχούς»:
 * αριθμός | λεπτά / ώρες / ημέρες / εβδομάδες / μήνες. Κύλιση με κούμπωμα ή πάτημα σε τιμή.
 */
import { TIMER_AMOUNTS, TIMER_UNITS, timerAllowed, timerMinutes, type RespondTimer, type TimerUnit } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { radius } from '@/theme';
import { Sheet } from './Sheet';
import { AppText as Text, Body, Button, useTheme } from './ui';

/** Όταν ανοίγει χωρίς χρονόμετρο */
const DEFAULT_TIMER: RespondTimer = { amount: 1, unit: 'hours' };

const ITEM_H = 44;
const VISIBLE = 5; // ζυγός αριθμός όχι: η μεσαία γραμμή είναι η επιλεγμένη
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

/** «30 λεπτά» / «1 ώρα» / «3 ημέρες» */
export function useTimerLabel() {
  const { t } = useTranslation();
  return (v: RespondTimer) => {
    if (v.unit === 'minutes') return v.amount === 1 ? t('timer.valueMinuteOne') : t('timer.valueMinutes', { n: v.amount });
    if (v.unit === 'hours') return v.amount === 1 ? t('timer.valueHourOne') : t('timer.valueHours', { n: v.amount });
    if (v.unit === 'days') return v.amount === 1 ? t('timer.valueDayOne') : t('timer.valueDays', { n: v.amount });
    if (v.unit === 'weeks') return v.amount === 1 ? t('timer.valueWeekOne') : t('timer.valueWeeks', { n: v.amount });
    return v.amount === 1 ? t('timer.valueMonthOne') : t('timer.valueMonths', { n: v.amount });
  };
}

/** Ένας «τροχός»: κάθετη λίστα που κουμπώνει στη μεσαία γραμμή */
export function Wheel<T extends string | number>({
  items,
  value,
  label,
  onChange,
}: {
  items: readonly T[];
  value: T;
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const c = useTheme();
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, items.indexOf(value));

  // Η επιλογή άλλαξε απ' έξω (π.χ. άλλη μονάδα) → κύλιση στη θέση της
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false }), 0);
    return () => clearTimeout(id);
  }, [index, items]);

  const pickAt = (y: number) => {
    const i = Math.min(items.length - 1, Math.max(0, Math.round(y / ITEM_H)));
    const next = items[i];
    if (next !== undefined && next !== value) onChange(next);
  };
  // Τέλος κύλισης (και στο web, όπου δεν υπάρχει momentum event): debounce
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      pickAt(y);
      ref.current?.scrollTo({ y: Math.round(y / ITEM_H) * ITEM_H, animated: true });
    }, 120);
  };

  return (
    <View style={{ flex: 1, height: ITEM_H * VISIBLE }}>
      {/* Η μεσαία «ζώνη» επιλογής */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 4, right: 4, top: PAD, height: ITEM_H, borderRadius: radius.md, backgroundColor: c.chip }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingVertical: PAD }}
        nestedScrollEnabled
      >
        {items.map((it) => {
          const on = it === value;
          return (
            <Pressable
              key={String(it)}
              onPress={() => onChange(it)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: on ? 20 : 17, fontWeight: on ? '700' : '500', color: on ? c.primary : c.muted }}>{label(it)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function TimerSheet({
  visible,
  value,
  meetAt,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: RespondTimer | null;
  /** Ώρα συνάντησης: η προθεσμία πρέπει να λήγει πριν */
  meetAt?: string;
  onClose: () => void;
  onConfirm: (v: RespondTimer | null) => void;
}) {
  const { t } = useTranslation();
  const label = useTimerLabel();
  const [sel, setSel] = useState<RespondTimer>(value ?? DEFAULT_TIMER);
  useEffect(() => {
    if (visible) setSel(value ?? DEFAULT_TIMER);
  }, [visible, value]);

  const unitLabel = (u: TimerUnit) => t(`timer.unit_${u}`);
  // Άλλη μονάδα → ο αριθμός γίνεται 1 (1 λεπτό / 1 ώρα / 1 ημέρα)
  const setUnit = (unit: TimerUnit) => setSel({ amount: 1, unit });
  const ok = timerAllowed(timerMinutes(sel), new Date(), meetAt);

  return (
    <Sheet
      visible={visible}
      title={`⏳ ${t('timer.title')}`}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          <Button title={`${t('timer.set')} · ${label(sel)}`} disabled={!ok} onPress={() => onConfirm(sel)} />
          <Button variant="secondary" title={t('timer.none')} onPress={() => onConfirm(null)} />
        </View>
      }
    >
      <Body muted style={{ fontSize: 13, marginBottom: 8 }}>
        {t('timer.hint')}
      </Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Wheel items={TIMER_AMOUNTS[sel.unit]} value={sel.amount} label={String} onChange={(amount) => setSel((s) => ({ ...s, amount }))} />
        <Wheel items={TIMER_UNITS} value={sel.unit} label={unitLabel} onChange={setUnit} />
      </View>
      {!ok ? <Body style={{ marginTop: 8, fontSize: 13 }}>⚠️ {t('timer.afterMeet')}</Body> : null}
    </Sheet>
  );
}

/** Το «dropdown»: τρέχουσα τιμή + ▾ */
export function TimerField({ value, onPress }: { value: RespondTimer | null; onPress: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const label = useTimerLabel();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: value ? c.primary : c.border,
        backgroundColor: pressed ? c.chip : c.card,
      })}
    >
      <Text style={{ color: value ? c.primary : c.text, fontWeight: '600' }}>{value ? label(value) : t('timer.off')}</Text>
      <Ionicons name="chevron-down" size={16} color={value ? c.primary : c.muted} />
    </Pressable>
  );
}
