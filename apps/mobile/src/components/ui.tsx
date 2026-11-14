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
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

export const colors = {
  light: { bg: '#F7F6F2', card: '#FFFFFF', text: '#1B1B1F', muted: '#6B6B76', border: '#E4E2DC', primary: '#E4572E', primaryText: '#FFFFFF', good: '#2E9E5B', chip: '#EFEDE7' },
  dark: { bg: '#121214', card: '#1E1E22', text: '#F2F2F4', muted: '#A0A0AA', border: '#2C2C32', primary: '#FF6B3D', primaryText: '#FFFFFF', good: '#44C07A', chip: '#2A2A30' },
};

export function useTheme() {
  return colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

/** Tablet = πλάτος ≥ 768. Χρησιμοποιείται για διάταξη δύο στηλών. */
export function useResponsive() {
  const { width } = useWindowDimensions();
  return { isTablet: width >= 768, width, contentMaxWidth: 720 };
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
  return <Text style={[s.h1, { color: c.text }]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={[s.label, { color: c.muted }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const c = useTheme();
  return <Text style={[{ color: muted ? c.muted : c.text, fontSize: 15 }, style]}>{children}</Text>;
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const c = useTheme();
  const content = <View style={[s.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
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
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: primary ? c.primary : c.chip,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? c.primaryText : c.text} />
      ) : (
        <Text style={{ color: primary ? c.primaryText : c.text, fontWeight: '600', fontSize: 16 }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected }}
      style={[s.chip, { backgroundColor: selected ? c.primary : c.chip }]}
    >
      <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const c = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[s.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }, props.style]}
    />
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
}

const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  button: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
