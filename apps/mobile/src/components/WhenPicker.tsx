/**
 * «Πότε;» στη νέα έξοδο:
 *  - InHoursChip: «Σε 1 ώρα ▾» — το βελάκι μέσα στο chip ανοίγει dropdown που αλλάζει μόνο τον αριθμό
 *  - CustomWhenSheet: pop-up με ημερολόγιο + ώρα (ή «Χωρίς ώρα» → μόνο μέρα) — ίδιο σε web και κινητό
 */
import {
  calendarWeeks,
  CUSTOM_DAYS,
  dayOffsetOf,
  dayTime,
  defaultCustom,
  IN_HOURS_OPTIONS,
  isPastSlot,
  localDayKey,
  MINUTE_STEP,
  type InHours,
} from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { radius, space, typeScale } from '@/theme';
import { Sheet } from './Sheet';
import { AppText as Text, Button, useTheme } from './ui';

function useLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR';
}

/** 0.5 → «0,5» στα ελληνικά */
export function useFormatHours() {
  const locale = useLocale();
  return (h: number) => h.toLocaleString(locale);
}

export function InHoursChip({
  hours,
  selected,
  onSelect,
  onDeselect,
}: {
  hours: InHours;
  selected: boolean;
  onSelect: (h: InHours) => void;
  /** Πάτημα ενώ είναι ήδη επιλεγμένο → αποεπιλογή */
  onDeselect?: () => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const fmt = useFormatHours();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; w: number } | null>(null);
  const fg = selected ? c.primaryText : c.text;

  const openMenu = () => anchor.current?.measureInWindow((x, y, w, h) => setMenu({ x, y: y + h + 4, w: Math.max(w, 120) }));

  return (
    <View ref={anchor} collapsable={false} style={[st.chip, { backgroundColor: selected ? c.primary : c.chip }]}>
      <Pressable
        onPress={() => (selected && onDeselect ? onDeselect() : onSelect(hours))}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={st.chipMain}
      >
        <Text style={{ color: fg, fontWeight: selected ? '600' : '400' }}>
          {t(hours === 1 ? 'wizard.inHourOne' : 'wizard.inHoursMany', { n: fmt(hours) })}
        </Text>
      </Pressable>
      <Pressable
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={t('wizard.changeHours')}
        hitSlop={6}
        style={[st.chipArrow, { borderLeftColor: selected ? 'rgba(255,255,255,0.4)' : c.border }]}
      >
        <Ionicons name="chevron-down" size={16} color={fg} />
      </Pressable>

      {/* Dropdown κάτω από το chip: μόνο οι αριθμοί */}
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityLabel="close" />
        {menu ? (
          <View style={[st.menu, { left: menu.x, top: menu.y, minWidth: menu.w, backgroundColor: c.card, borderColor: c.border }]}>
            {IN_HOURS_OPTIONS.map((h) => {
              const active = h === hours;
              return (
                <Pressable
                  key={h}
                  onPress={() => {
                    setMenu(null);
                    onSelect(h);
                  }}
                  accessibilityRole="menuitem"
                  style={({ pressed }) => [st.menuItem, { backgroundColor: active || pressed ? c.chip : 'transparent' }]}
                >
                  <Text style={{ color: active ? c.primary : c.text, fontWeight: active ? '700' : '500', fontSize: typeScale.body }}>
                    {fmt(h)}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={18} color={c.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

/** Pop-up: μέρα (σήμερα, αύριο, …) + ώρα + λεπτά. Ώρες που πέρασαν σήμερα είναι απενεργοποιημένες. */
/** Αποτέλεσμα του «Άλλη μέρα/ώρα»: συγκεκριμένη ώρα (iso) ή μόνο μέρα (day, «Χωρίς ώρα») */
export type CustomWhen = { iso: string; day?: undefined } | { day: string; iso?: undefined };

export function CustomWhenSheet({
  visible,
  initial,
  initialDay,
  onClose,
  onConfirm,
  allowNoTime = true,
  title,
  confirmLabel,
  after,
}: {
  visible: boolean;
  /** Ο διακόπτης «Χωρίς ώρα» (όχι για τη λήξη) */
  allowNoTime?: boolean;
  title?: string;
  confirmLabel?: string;
  /** Η επιλογή πρέπει να είναι μετά από αυτό (π.χ. λήξη μετά τη συνάντηση) */
  after?: string;
  /** Προηγούμενη επιλογή με ώρα (ISO) */
  initial?: string;
  /** Προηγούμενη επιλογή χωρίς ώρα (YYYY-MM-DD) */
  initialDay?: string;
  onClose: () => void;
  onConfirm: (v: CustomWhen) => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const locale = useLocale();
  const [sel, setSel] = useState(() => defaultCustom(new Date()));
  /** «Χωρίς ώρα»: μόνο μέρα */
  const [noTime, setNoTime] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));

  useEffect(() => {
    if (!visible) return;
    const n = new Date();
    let next = defaultCustom(n);
    let timeless = false;
    if (initialDay) {
      const d = new Date(`${initialDay}T12:00:00`);
      const off = dayOffsetOf(n, d);
      if (off >= 0 && off < CUSTOM_DAYS) {
        next = { ...next, dayOffset: off };
        timeless = true;
      }
    } else if (initial && new Date(initial).getTime() > n.getTime()) {
      const d = new Date(initial);
      const off = dayOffsetOf(n, d);
      if (off < CUSTOM_DAYS) next = { dayOffset: off, hour: d.getHours(), minute: d.getMinutes() - (d.getMinutes() % MINUTE_STEP) };
    }
    setSel(next);
    setNoTime(timeless);
    const shown = dayTime(n, next.dayOffset, 0, 0);
    setMonth({ y: shown.getFullYear(), m: shown.getMonth() });
  }, [visible, initial, initialDay]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

  /** Μέρα επιλέξιμη; (όχι παρελθόν, μέσα στο όριο· με ώρα: να μένει έστω ένα ελεύθερο τέταρτο) */
  const dayEnabled = (off: number) => off >= 0 && off < CUSTOM_DAYS && (noTime || !isPastSlot(now, off, 23, 60 - MINUTE_STEP));

  /** Αλλάζοντας μέρα/ώρα: αν το λεπτό έχει περάσει, πάμε στο πρώτο ελεύθερο */
  const choose = (next: Partial<typeof sel>) => {
    const s2 = { ...sel, ...next };
    if (!noTime && isPastSlot(now, s2.dayOffset, s2.hour, s2.minute)) {
      const freeHour = hours.find((h) => minutes.some((m) => !isPastSlot(now, s2.dayOffset, h, m)));
      if (freeHour === undefined) return;
      if (isPastSlot(now, s2.dayOffset, s2.hour, 60 - MINUTE_STEP)) s2.hour = freeHour;
      const free = minutes.find((m) => !isPastSlot(now, s2.dayOffset, s2.hour, m));
      if (free === undefined) return;
      s2.minute = free;
    }
    setSel(s2);
  };

  const chosen = dayTime(now, sel.dayOffset, sel.hour, sel.minute);
  const chosenDay = dayTime(now, sel.dayOffset, 12, 0);
  const afterOk = noTime || !after || chosen.getTime() > new Date(after).getTime();
  const valid = (noTime ? dayEnabled(sel.dayOffset) : chosen.getTime() > now.getTime()) && afterOk;
  const pad = (n: number) => String(n).padStart(2, '0');
  const dayText = chosenDay.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const summary = noTime
    ? dayText
    : chosen.toLocaleString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });

  // Ημερολόγιο
  const weeks = calendarWeeks(month.y, month.m);
  const monthTitle = new Date(month.y, month.m, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const firstOff = dayOffsetOf(now, new Date(month.y, month.m, 1));
  const lastOff = dayOffsetOf(now, new Date(month.y, month.m + 1, 0));
  const canPrev = firstOff > 0;
  const canNext = lastOff < CUSTOM_DAYS - 1;
  const shift = (delta: number) =>
    setMonth(({ y, m }) => ({ y: new Date(y, m + delta, 1).getFullYear(), m: new Date(y, m + delta, 1).getMonth() }));
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })); // 1/1/2024 = Δευτέρα

  return (
    <Sheet
      visible={visible}
      title={title ?? t('wizard.pickWhen')}
      onClose={onClose}
      footer={
        <Button
          title={`${confirmLabel ?? t('wizard.setWhen')} · ${summary}`}
          disabled={!valid}
          onPress={() => onConfirm(noTime ? { day: localDayKey(chosenDay) } : { iso: chosen.toISOString() })}
        />
      }
    >
      {/* Μήνας: ‹ Νοέμβριος 2026 › */}
      <View style={st.monthRow}>
        <Pressable
          onPress={() => shift(-1)}
          disabled={!canPrev}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('wizard.prevMonth')}
        >
          <Ionicons name="chevron-back" size={22} color={canPrev ? c.text : c.border} />
        </Pressable>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: typeScale.body, textTransform: 'capitalize' }}>{monthTitle}</Text>
        <Pressable
          onPress={() => shift(1)}
          disabled={!canNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('wizard.nextMonth')}
        >
          <Ionicons name="chevron-forward" size={22} color={canNext ? c.text : c.border} />
        </Pressable>
      </View>
      <View style={st.week}>
        {weekdayLabels.map((w, i) => (
          <Text key={i} style={[st.dayCell, { color: c.muted, fontSize: 12, fontWeight: '600' }]}>
            {w}
          </Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={st.week}>
          {week.map((d, di) => {
            if (d === null) return <View key={di} style={st.dayCell} />;
            const off = dayOffsetOf(now, new Date(month.y, month.m, d));
            const enabled = dayEnabled(off);
            const selected = off === sel.dayOffset;
            const isToday = off === 0;
            return (
              <Pressable
                key={di}
                onPress={() => choose({ dayOffset: off })}
                disabled={!enabled}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: !enabled }}
                style={st.dayCell}
              >
                <View
                  style={[
                    st.dayCircle,
                    selected ? { backgroundColor: c.primary } : isToday ? { borderWidth: 1.5, borderColor: c.primary } : null,
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? c.primaryText : enabled ? c.text : c.border,
                      fontWeight: selected || isToday ? '700' : '500',
                    }}
                  >
                    {d}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {/* «Χωρίς ώρα»: η ώρα δεν είναι απαραίτητη */}
      {allowNoTime ? (
        <View style={[st.switchRow, { borderTopColor: c.border }]}>
          <Text style={{ color: c.text, fontWeight: '600', flex: 1 }}>🕘 {t('wizard.noTime')}</Text>
          <Switch
            value={noTime}
            onValueChange={setNoTime}
            trackColor={{ true: c.primary, false: c.border }}
            thumbColor="#fff"
            {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff', activeTrackColor: c.primary } as object) : {})}
            accessibilityLabel={t('wizard.noTime')}
          />
        </View>
      ) : null}

      {noTime ? null : (
        <>
          <Text style={[st.section, { color: c.muted }]}>{t('wizard.hour')}</Text>
          <View style={st.grid}>
            {hours.map((h) => (
              <Slot
                key={h}
                label={pad(h)}
                small
                selected={sel.hour === h}
                disabled={isPastSlot(now, sel.dayOffset, h, 60 - MINUTE_STEP)}
                onPress={() => choose({ hour: h })}
              />
            ))}
          </View>

          <Text style={[st.section, { color: c.muted }]}>{t('wizard.minutes')}</Text>
          <View style={st.grid}>
            {minutes.map((m) => (
              <Slot
                key={m}
                label={`:${pad(m)}`}
                small
                selected={sel.minute === m}
                disabled={isPastSlot(now, sel.dayOffset, sel.hour, m)}
                onPress={() => choose({ minute: m })}
              />
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

function Slot({
  label,
  selected,
  disabled,
  small,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  small?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        small ? st.slotSmall : st.slot,
        {
          backgroundColor: selected ? c.primary : pressed ? c.border : c.chip,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? c.primaryText : c.text,
          fontWeight: selected ? '700' : '500',
          fontSize: small ? typeScale.small : typeScale.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, overflow: 'hidden' },
  chipMain: { paddingVertical: space.sm, paddingLeft: 14, paddingRight: 8 },
  chipArrow: {
    paddingVertical: space.sm,
    paddingLeft: 6,
    paddingRight: 10,
    borderLeftWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  section: {
    fontSize: typeScale.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: space.md,
    marginBottom: space.sm,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: space.sm },
  week: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40, textAlign: 'center' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.md, paddingTop: space.md, borderTopWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slot: { borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: 14 },
  slotSmall: { borderRadius: radius.sm, width: 48, paddingVertical: 8, alignItems: 'center' },
});
