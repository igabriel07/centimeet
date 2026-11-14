/**
 * Βασικά δομικά στοιχεία της εφαρμογής. Η εμφάνιση (χρώματα, γραμματοσειρά, μεγέθη)
 * έρχεται από το src/theme.ts — εκεί κάνεις τις αλλαγές, όχι εδώ.
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { fonts, palette, radius, space, TABLET_MIN_WIDTH, typeScale, type Colors } from '@/theme';

/** @deprecated χρησιμοποίησε το palette από το '@/theme' */
export const colors = palette;

export function useTheme(): Colors {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

/** Tablet = πλάτος ≥ TABLET_MIN_WIDTH. Χρησιμοποιείται για διάταξη δύο στηλών. */
export function useResponsive() {
  const { width } = useWindowDimensions();
  return { isTablet: width >= TABLET_MIN_WIDTH, width, contentMaxWidth: 720 };
}

/**
 * Με custom γραμματοσειρά το fontWeight δεν διαλέγει μόνο του το σωστό αρχείο (ειδικά στο Android),
 * οπότε μετατρέπουμε το βάρος σε fontFamily.
 */
function withFont(style: StyleProp<TextStyle>): TextStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, ...rest } = flat;
  const w = Number(fontWeight === 'bold' ? 700 : fontWeight === 'normal' ? 400 : (fontWeight ?? 400));
  const fontFamily = w >= 700 ? fonts.bold : w >= 600 ? fonts.semibold : w >= 500 ? fonts.medium : fonts.regular;
  return { fontFamily, ...rest };
}

/** Κείμενο με τη γραμματοσειρά της εφαρμογής (αντί για σκέτο <Text>) */
export function AppText({ style, ...props }: TextProps) {
  return <Text {...props} style={withFont(style)} />;
}

export function Screen({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const c = useTheme();
  const { contentMaxWidth, isTablet } = useResponsive();
  return (
    <View style={[{ flex: 1, backgroundColor: c.bg }, style]}>
      <View style={{ flex: 1, width: '100%', maxWidth: isTablet ? undefined : contentMaxWidth, alignSelf: 'center' }}>
        {children}
      </View>
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <AppText style={[s.h1, { color: c.text }]}>{children}</AppText>;
}

export function Label({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <AppText style={[s.label, { color: c.muted }]}>{children}</AppText>;
}

export function Body({
  children,
  muted,
  style,
  onPress,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  onPress?: () => void;
}) {
  const c = useTheme();
  return (
    <AppText onPress={onPress} style={[{ color: muted ? c.muted : c.text, fontSize: typeScale.body }, style]}>
      {children}
    </AppText>
  );
}

export function Card({
  children,
  onPress,
  onLongPress,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
}) {
  const c = useTheme();
  const content = <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
  return onPress || onLongPress ? (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useTheme();
  const bg = variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : c.chip;
  const fg = variant === 'secondary' ? c.text : c.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <AppText style={{ color: fg, fontWeight: '600', fontSize: typeScale.button }}>{title}</AppText>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, { backgroundColor: selected ? c.primary : c.chip }]}
    >
      <AppText style={{ color: selected ? c.primaryText : c.text, fontWeight: selected ? '600' : '400' }}>{label}</AppText>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const c = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[s.input, withFont(props.style), { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
    />
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }, style]}>{children}</View>;
}

const s = StyleSheet.create({
  h1: { fontSize: typeScale.h1, fontWeight: '700', marginBottom: space.sm },
  label: {
    fontSize: typeScale.label,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  button: {
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  chip: { borderRadius: radius.pill, paddingVertical: space.sm, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: typeScale.input },
});
