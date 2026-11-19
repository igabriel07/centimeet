/** Μικρό κεντραρισμένο pop-up (ίδιο ύφος με το CategoryPicker) */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radius, space, typeScale } from '@/theme';
import { AppText as Text, useTheme } from './ui';

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Σταθερό κάτω μέρος (π.χ. κουμπί επιβεβαίωσης), έξω από το scroll */
  footer?: ReactNode;
}) {
  const c = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="close">
        {/* Το πάτημα μέσα στην κάρτα δεν την κλείνει */}
        <Pressable style={[st.card, { backgroundColor: c.card }]} onPress={() => {}}>
          <View style={st.header}>
            <Text style={{ color: c.text, fontSize: typeScale.title, fontWeight: '700', flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="close">
              <Ionicons name="close" size={22} color={c.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={{ marginTop: space.md }}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 420, maxHeight: '85%', borderRadius: radius.lg, padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
});
