/**
 * Pop-up πρόσκλησης (Φίλοι / Ομάδες), χωρισμένο στα δύο:
 *  - πάνω: η λίστα, με «+» δίπλα σε κάθε όνομα
 *  - κάτω: «Πρόσκληση» — όσοι πάτησες «+», με «−» για αφαίρεση
 * Με «OK» επιστρέφει όλη την επιλογή.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { radius, space, typeScale } from '@/theme';
import { AppText as Text, Button, Input, useTheme } from './ui';

export type InviteItem = { id: string; title: string; subtitle?: string; emoji: string };

/** Από τόσα στοιχεία και πάνω εμφανίζεται αναζήτηση */
const SEARCH_FROM = 8;

export function InvitePicker({
  visible,
  title,
  items,
  selected,
  loading,
  emptyText,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  items: InviteItem[];
  /** Τρέχουσα επιλογή (ids) — με αυτήν ανοίγει */
  selected: string[];
  loading?: boolean;
  /** Όταν δεν υπάρχει κανένα στοιχείο (π.χ. «Δεν έχεις φίλους ακόμα») */
  emptyText: string;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const [picked, setPicked] = useState<string[]>(selected);
  const [query, setQuery] = useState('');

  // Κάθε άνοιγμα ξεκινά από την τρέχουσα επιλογή
  useEffect(() => {
    if (visible) {
      setPicked(selected);
      setQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = norm(query.trim());
  const available = items.filter((i) => !picked.includes(i.id) && (!q || norm(`${i.title} ${i.subtitle ?? ''}`).includes(q)));
  const chosen = picked.map((id) => byId.get(id)).filter((i): i is InviteItem => !!i);

  const add = (id: string) => setPicked((p) => (p.includes(id) ? p : [...p, id]));
  const remove = (id: string) => setPicked((p) => p.filter((x) => x !== id));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="close">
        <Pressable style={[st.card, { backgroundColor: c.card }]} onPress={() => {}}>
          <View style={st.header}>
            <Text style={{ color: c.text, fontSize: typeScale.title, fontWeight: '700', flex: 1 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="close">
              <Ionicons name="close" size={22} color={c.muted} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: space.xl }} />
          ) : items.length === 0 ? (
            <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: space.xl }}>{emptyText}</Text>
          ) : (
            <>
              {/* Πάνω: λίστα με + */}
              {items.length >= SEARCH_FROM ? (
                <Input value={query} onChangeText={setQuery} placeholder={t('invite.search')} autoCorrect={false} style={{ marginBottom: space.sm }} />
              ) : null}
              <ScrollView style={st.half} keyboardShouldPersistTaps="handled">
                {available.length === 0 ? (
                  <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: space.md }}>
                    {q ? t('invite.noMatch') : t('invite.allAdded')}
                  </Text>
                ) : (
                  available.map((i) => <Row key={i.id} item={i} action="add" onPress={() => add(i.id)} />)
                )}
              </ScrollView>

              {/* Κάτω: πρόσκληση με − */}
              <View style={[st.divider, { borderTopColor: c.border }]}>
                <Text style={[st.section, { color: c.muted }]}>{t('invite.invitation', { count: chosen.length })}</Text>
              </View>
              <ScrollView style={st.half}>
                {chosen.length === 0 ? (
                  <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: space.md }}>{t('invite.tapPlus')}</Text>
                ) : (
                  chosen.map((i) => <Row key={i.id} item={i} action="remove" onPress={() => remove(i.id)} />)
                )}
              </ScrollView>
            </>
          )}

          <View style={{ marginTop: space.md }}>
            <Button title={t('invite.ok')} onPress={() => onConfirm(picked)} disabled={loading} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ item, action, onPress }: { item: InviteItem; action: 'add' | 'remove'; onPress: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const add = action === 'add';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${add ? t('invite.add') : t('invite.remove')}: ${item.title}`}
      style={({ pressed }) => [st.row, { backgroundColor: pressed ? c.chip : 'transparent' }]}
    >
      <Text style={{ fontSize: 22 }}>{item.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={{ color: c.muted, fontSize: typeScale.small }} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[st.action, { backgroundColor: add ? c.primary : c.chip }]}>
        <Ionicons name={add ? 'add' : 'remove'} size={20} color={add ? c.primaryText : c.danger} />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', borderRadius: radius.lg, padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  half: { maxHeight: 220, flexGrow: 0 },
  divider: { borderTopWidth: 1, marginTop: space.sm, paddingTop: space.sm },
  section: { fontSize: typeScale.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.md },
  action: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
