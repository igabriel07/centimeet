/**
 * Πλαϊνό μενού (hamburger) που γλιστράει από αριστερά ή δεξιά.
 * Χωρίς επιπλέον βιβλιοθήκη: Modal + Animated. Χρώματα/μεγέθη από το src/theme.ts.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, typeScale } from '@/theme';
import { AppText, useTheme } from './ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type MenuItem = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Κόκκινο χρώμα (π.χ. Αποσύνδεση) */
  danger?: boolean;
  /** Επισημαίνεται ως η τρέχουσα οθόνη */
  active?: boolean;
};

/** Το κουμπί ☰ (ή άλλο εικονίδιο, π.χ. προφίλ) */
export function HamburgerButton({ onPress, label, icon = 'menu' }: { onPress: () => void; label?: string; icon?: IconName }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('menu.open')}
      hitSlop={10}
      style={({ pressed }) => [st.burger, { backgroundColor: pressed ? c.chip : 'transparent' }]}
    >
      <Ionicons name={icon} size={icon === 'menu' ? 26 : 30} color={c.text} />
    </Pressable>
  );
}

export function SideMenu({
  side,
  visible,
  onClose,
  title,
  items,
}: {
  side: 'left' | 'right';
  visible: boolean;
  onClose: () => void;
  title?: string;
  items: MenuItem[];
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(300, width * 0.8);
  const hidden = side === 'left' ? -panelWidth : panelWidth;

  const x = useRef(new Animated.Value(hidden)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      x.setValue(hidden);
      Animated.parallel([
        Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(x, { toValue: hidden, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** Κλείνει πρώτα το μενού και μετά εκτελεί την ενέργεια (ομαλή μετάβαση) */
  const run = (fn: () => void) => {
    onClose();
    setTimeout(fn, 190);
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)', opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="close" />
      </Animated.View>
      <Animated.View
        style={[
          st.panel,
          {
            width: panelWidth,
            [side]: 0,
            backgroundColor: c.card,
            paddingTop: insets.top + space.lg,
            paddingBottom: insets.bottom + space.lg,
            transform: [{ translateX: x }],
          },
        ]}
      >
        <View style={[st.header, { flexDirection: side === 'left' ? 'row' : 'row-reverse' }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="close" style={st.burger}>
            <Ionicons name="close" size={26} color={c.text} />
          </Pressable>
          {title ? <AppText style={{ color: c.text, fontSize: typeScale.title, fontWeight: '700' }}>{title}</AppText> : null}
        </View>
        {items.map((it) => {
          const color = it.danger ? c.danger : it.active ? c.primary : c.text;
          return (
            <Pressable
              key={it.label}
              onPress={() => run(it.onPress)}
              accessibilityRole="button"
              style={({ pressed }) => [st.item, { backgroundColor: pressed || it.active ? c.chip : 'transparent' }]}
            >
              <Ionicons name={it.icon} size={22} color={color} />
              <AppText style={{ color, fontSize: typeScale.body, fontWeight: it.active ? '600' : '500' }}>{it.label}</AppText>
            </Pressable>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const st = StyleSheet.create({
  burger: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    paddingHorizontal: space.md,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 12,
  },
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.md, borderRadius: 12 },
});
