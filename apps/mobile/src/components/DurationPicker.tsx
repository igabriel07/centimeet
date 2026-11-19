/**
 * ⏱ Διάρκεια — ίδια λογική με το χρονόμετρο απάντησης:
 * «dropdown» (τρέχουσα τιμή ▾) → pop-up με δύο «τροχούς» (αριθμός | λεπτά / ώρες / μέρες / εβδομάδες / μήνες)
 * + «📅 Ακριβής λήξη» (ημερολόγιο & ώρα).
 */
import { DURATION_AMOUNTS, DURATION_UNITS, type Duration, type DurationAmount, type DurationUnit } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { amountText, durationLabel } from '@/lib/duration';
import { radius } from '@/theme';
import { Sheet } from './Sheet';
import { Wheel } from './TimerPicker';
import { AppText as Text, Body, Button, useTheme } from './ui';

/** Όταν ανοίγει χωρίς διάρκεια */
const DEFAULT: DurationAmount = { amount: 2, unit: 'hours' };

export function DurationSheet({
  visible,
  value,
  onClose,
  onConfirm,
  onPickEnd,
}: {
  visible: boolean;
  value: Duration | null;
  onClose: () => void;
  onConfirm: (v: DurationAmount | null) => void;
  /** «📅 Ακριβής λήξη» → ημερολόγιο */
  onPickEnd: () => void;
}) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<DurationAmount>(DEFAULT);
  useEffect(() => {
    if (visible) setSel(value?.kind === 'amount' ? { unit: value.unit, amount: value.amount } : DEFAULT);
  }, [visible, value]);

  const unitLabel = (u: DurationUnit) => t(`timer.unit_${u}`);
  // Άλλη μονάδα → ο αριθμός γίνεται ο πρώτος της (1 ώρα / 1 μέρα / 15 λεπτά …)
  const setUnit = (unit: DurationUnit) => setSel({ unit, amount: DURATION_AMOUNTS[unit][0]! });

  return (
    <Sheet
      visible={visible}
      title={`⏱ ${t('duration.title')}`}
      onClose={onClose}
      footer={
        <View style={{ gap: 8 }}>
          <Button title={`${t('timer.set')} · ${amountText(t, sel)}`} onPress={() => onConfirm(sel)} />
          <Button variant="secondary" title={`📅 ${t('duration.exactEnd')}`} onPress={onPickEnd} />
          <Button variant="secondary" title={t('duration.none')} onPress={() => onConfirm(null)} />
        </View>
      }
    >
      <Body muted style={{ fontSize: 13, marginBottom: 8 }}>
        {t('duration.hint')}
      </Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Wheel items={DURATION_AMOUNTS[sel.unit]} value={sel.amount} label={String} onChange={(amount) => setSel((s) => ({ ...s, amount }))} />
        <Wheel items={DURATION_UNITS} value={sel.unit} label={unitLabel} onChange={setUnit} />
      </View>
    </Sheet>
  );
}

/** Το «dropdown»: τρέχουσα τιμή + ▾ (όπως το TimerField) */
export function DurationField({ value, onPress }: { value: Duration | null; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const c = useTheme();
  const label = value ? durationLabel(t, value, i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR') : t('timer.off');
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
      <Text style={{ color: value ? c.primary : c.text, fontWeight: '600' }}>
        {value?.kind === 'end' ? '📅 ' : ''}
        {label}
      </Text>
      <Ionicons name="chevron-down" size={16} color={value ? c.primary : c.muted} />
    </Pressable>
  );
}

