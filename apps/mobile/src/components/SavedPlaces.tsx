/** ⭐ Αποθηκευμένες διευθύνσεις: drop-down, αστέρι αποθήκευσης, pop-up ονόματος */
import { findSaved, SAVED_LABEL_MAX, SAVED_PLACES_MAX, SAVED_PRESETS, savedToPlace, type ResolvedPlace, type SavedPlace } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/lib/outings';
import { useSavedPlaceActions, useSavedPlaces } from '@/lib/savedPlaces';
import { Sheet } from './Sheet';
import { AppText as Text, Body, Button, Chip, Input, useTheme } from './ui';

/** ▾ Βελάκι μέσα στο κουτί αναζήτησης (μόνο αν υπάρχουν αποθηκευμένες) */
export function SavedDropdownToggle({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const saved = useSavedPlaces();
  if (!saved.data?.length) return null;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('saved.title')}
      accessibilityState={{ expanded: open }}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.primary} />
    </Pressable>
  );
}

/** Drop-down αποθηκευμένων: κάρτα με σκιά, απαλή εμφάνιση, εικονίδια σε κύκλους, «Διαχείριση» */
export function SavedDropdown({ onPick, onClose }: { onPick: (p: ResolvedPlace) => void; onClose?: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const saved = useSavedPlaces();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  if (!saved.data?.length) return null;
  return (
    <Animated.View
      style={[
        st.menu,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
        },
      ]}
    >
      <Text style={[st.heading, { color: c.muted }]}>{t('saved.title')}</Text>
      {saved.data.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onPick(savedToPlace(s))}
          accessibilityRole="button"
          accessibilityLabel={`${s.label}: ${s.address ?? s.name}`}
          style={({ pressed }) => [st.item, { backgroundColor: pressed ? `${c.primary}14` : 'transparent' }]}
        >
          <View style={[st.icon, { backgroundColor: `${c.primary}1A` }]}>
            <Text style={{ fontSize: 18 }}>{s.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontWeight: '700', fontSize: 15 }}>{s.label}</Text>
            <Text style={{ color: c.muted, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
              {s.address ?? s.name}
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={22} color={c.primary} />
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          onClose?.();
          router.push('/places');
        }}
        accessibilityRole="link"
        style={({ pressed }) => [st.manage, { borderTopColor: c.border, opacity: pressed ? 0.6 : 1 }]}
      >
        <Ionicons name="settings-outline" size={14} color={c.primary} />
        <Text style={{ color: c.primary, fontWeight: '600', fontSize: 13 }}>{t('saved.manage')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  menu: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingTop: 10,
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginLeft: 10, marginBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  manage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

/** ☆/★ δίπλα σε μια επιλεγμένη διεύθυνση: αποθήκευση ή αφαίρεση από τα αγαπημένα */
export function FavoriteStar({ place }: { place: ResolvedPlace }) {
  const { t } = useTranslation();
  const c = useTheme();
  const saved = useSavedPlaces();
  const { remove, enabled } = useSavedPlaceActions();
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  const match = saved.data ? findSaved(saved.data, place.location) : null;
  return (
    <>
      <Pressable
        onPress={() => (match ? remove.mutate(match.id) : setOpen(true))}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={match ? t('saved.remove') : t('saved.add')}
      >
        <Ionicons name={match ? 'star' : 'star-outline'} size={22} color={match ? c.warn : c.muted} />
      </Pressable>
      <SavePlaceSheet visible={open} place={place} onClose={() => setOpen(false)} />
    </>
  );
}

/** Pop-up: όνομα + εικονίδιο για νέα αποθήκευση ή μετονομασία */
export function SavePlaceSheet({
  visible,
  place,
  existing,
  onClose,
  onSaved,
}: {
  visible: boolean;
  place?: ResolvedPlace;
  /** Μετονομασία υπάρχουσας */
  existing?: SavedPlace;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const saved = useSavedPlaces();
  const { add, rename } = useSavedPlaceActions();
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const presetLabel = (key: string) => t(`saved.preset.${key}`);
  const isPresetLabel = (l: string) => SAVED_PRESETS.some((p) => presetLabel(p.key) === l);

  useEffect(() => {
    if (!visible) return;
    setLabel(existing?.label ?? '');
    setEmoji(existing?.emoji ?? '⭐');
  }, [visible, existing]);

  const full = !existing && (saved.data?.length ?? 0) >= SAVED_PLACES_MAX;
  const busy = add.isPending || rename.isPending;

  async function submit() {
    if (!label.trim()) return;
    try {
      if (existing) await rename.mutateAsync({ id: existing.id, label, emoji });
      else if (place) await add.mutateAsync({ place, label, emoji });
      onSaved?.();
      onClose();
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    }
  }

  const where = existing ? existing.address ?? existing.name : place ? place.address ?? place.name : '';
  return (
    <Sheet
      visible={visible}
      title={existing ? t('saved.editTitle') : t('saved.addTitle')}
      onClose={onClose}
      footer={<Button title={t('saved.save')} onPress={submit} loading={busy} disabled={!label.trim() || full} />}
    >
      {where ? (
        <Body muted style={{ marginBottom: 10 }}>
          📍 {where}
        </Body>
      ) : null}
      {full ? <Body style={{ color: c.danger, marginBottom: 8 }}>{t('saved.full', { n: SAVED_PLACES_MAX })}</Body> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {SAVED_PRESETS.map((p) => (
          <Chip
            key={p.key}
            label={`${p.emoji} ${presetLabel(p.key)}`}
            selected={emoji === p.emoji && (label === presetLabel(p.key) || (p.key === 'other' && !isPresetLabel(label)))}
            onPress={() => {
              setEmoji(p.emoji);
              // Οι έτοιμες ετικέτες συμπληρώνουν το όνομα· το «Άλλο» αφήνει να γράψεις δικό σου
              if (p.key !== 'other') setLabel(presetLabel(p.key));
              else if (isPresetLabel(label)) setLabel('');
            }}
          />
        ))}
      </View>
      <Input
        value={label}
        onChangeText={setLabel}
        placeholder={t('saved.labelPlaceholder')}
        maxLength={SAVED_LABEL_MAX}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
    </Sheet>
  );
}
