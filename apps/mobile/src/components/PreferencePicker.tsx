/** «Πού θέλεις να πάμε;» — Στη μέση / Οπουδήποτε / Κοντά μου */
import { PLACE_PREFERENCES, type PlacePreference } from '@centimeet/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { radius, typeScale } from '@/theme';
import { AppText as Text, useTheme } from './ui';

export const PREFERENCE_EMOJI: Record<PlacePreference, string> = { fair: '⚖️', anywhere: '🌍', near: '📍' };

export function PreferencePicker({ value, onChange }: { value: PlacePreference; onChange: (p: PlacePreference) => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
      {PLACE_PREFERENCES.map((p) => {
        const on = value === p;
        return (
          <Pressable
            key={p}
            onPress={() => onChange(p)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              gap: 2,
              paddingVertical: 10,
              paddingHorizontal: 4,
              borderRadius: radius.md,
              borderWidth: on ? 2 : 1,
              borderColor: on ? c.primary : c.border,
              backgroundColor: on ? c.chip : pressed ? c.chip : c.card,
            })}
          >
            <Text style={{ fontSize: 22 }}>{PREFERENCE_EMOJI[p]}</Text>
            <Text style={{ color: c.text, fontWeight: on ? '700' : '600', fontSize: typeScale.small, textAlign: 'center' }}>
              {t(`preference.${p}`)}
            </Text>
            <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>{t(`preference.${p}Hint`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
