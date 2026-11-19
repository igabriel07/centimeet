/**
 * Μικρό pop-up επιλογής κατηγορίας (π.χ. Φαγητό → Πίτσα, Σουβλάκι…) με «Όλα» πρώτο.
 * Χρησιμοποιείται στην αρχική (πάτημα σε δραστηριότητα) και στη φόρμα εξόδου (dropdown).
 */
import { CATEGORY_EMOJI, categoriesFor, type Activity, type ActivityCategory } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ACTIVITY_EMOJI } from '@/lib/outings';
import { radius, space, typeScale } from '@/theme';
import { AppText, useTheme } from './ui';

export function CategoryPicker({
  activity,
  visible,
  selected,
  onSelect,
  onClose,
}: {
  activity: Activity;
  visible: boolean;
  /** Τρέχουσα επιλογή (undefined = «Όλα») — για επισήμανση */
  selected?: ActivityCategory;
  onSelect: (category: ActivityCategory | undefined) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const { t } = useTranslation();
  const options: { id?: ActivityCategory; emoji: string; label: string }[] = [
    { id: undefined, emoji: ACTIVITY_EMOJI[activity], label: t('wizard.allCategories') },
    ...categoriesFor(activity).map((id) => ({ id, emoji: CATEGORY_EMOJI[id], label: t(`category.${id}`) })),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="close">
        {/* Το πάτημα μέσα στην κάρτα δεν την κλείνει */}
        <Pressable style={[st.card, { backgroundColor: c.card }]} onPress={() => {}}>
          <View style={st.header}>
            <AppText style={{ color: c.text, fontSize: typeScale.title, fontWeight: '700', flex: 1 }}>
              {ACTIVITY_EMOJI[activity]} {t(`activity.${activity}`)} · {t('wizard.chooseCategory')}
            </AppText>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="close">
              <Ionicons name="close" size={22} color={c.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={st.grid}>
            {options.map((o) => {
              const isSel = o.id === selected;
              return (
                <Pressable
                  key={o.id ?? 'all'}
                  onPress={() => onSelect(o.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                  style={({ pressed }) => [
                    st.option,
                    { borderColor: isSel ? c.primary : c.border, backgroundColor: isSel ? c.chip : pressed ? c.chip : c.card },
                  ]}
                >
                  <AppText style={{ fontSize: 22 }}>{o.emoji}</AppText>
                  <AppText style={{ color: c.text, fontSize: typeScale.small, fontWeight: isSel ? '700' : '500', textAlign: 'center' }}>
                    {o.label}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** «Κατηγορία: 🍕 Πίτσα ▾» — ανοίγει το CategoryPicker */
export function CategoryDropdown({ activity, value, onPress }: { activity: Activity; value?: ActivityCategory; onPress: () => void }) {
  const c = useTheme();
  const { t } = useTranslation();
  const label = value ? `${CATEGORY_EMOJI[value]} ${t(`category.${value}`)}` : `${ACTIVITY_EMOJI[activity]} ${t('wizard.allCategories')}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [st.dropdown, { borderColor: c.border, backgroundColor: pressed ? c.chip : c.card }]}
    >
      <AppText style={{ color: c.muted, fontSize: typeScale.small }}>{t('wizard.category')}</AppText>
      <AppText style={{ color: c.text, fontWeight: '600', flex: 1 }}>{label}</AppText>
      <Ionicons name="chevron-down" size={18} color={c.muted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 380, maxHeight: '80%', borderRadius: radius.lg, padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
  option: { width: 100, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderWidth: 1, borderRadius: radius.md },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    marginTop: space.sm,
  },
});
