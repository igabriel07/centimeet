import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, View } from 'react-native';
import { acceptedFriends, useFriendships, type Profile } from '@/lib/friends';
import { Body, Button, Card, H1, Screen, useTheme } from './ui';

/** Επιλογή φίλων (πολλαπλή) για πρόσκληση σε έξοδο */
export function FriendPicker({
  visible,
  me,
  exclude,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  me: string;
  /** user ids που είναι ήδη στην έξοδο */
  exclude: string[];
  onClose: () => void;
  onConfirm: (friends: Profile[]) => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const q = useFriendships(me);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const friends = acceptedFriends(q.data, me).filter((f) => !exclude.includes(f.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function close() {
    setPicked(new Set());
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <Screen>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
          <H1>{t('friendPicker.title')}</H1>
          {!q.isLoading && friends.length === 0 ? <Body muted>{t('friendPicker.empty')}</Body> : null}
          {friends.map((f) => {
            const on = picked.has(f.id);
            return (
              <Card key={f.id} onPress={() => toggle(f.id)} style={on ? { borderColor: c.primary, borderWidth: 2 } : undefined}>
                <Body style={{ fontWeight: '600' }}>
                  {on ? '✓ ' : ''}
                  {f.display_name}
                </Body>
                <Body muted>@{f.username}</Body>
              </Card>
            );
          })}
        </ScrollView>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: c.bg }}>
          <Button
            title={t('friendPicker.add', { count: picked.size })}
            disabled={picked.size === 0}
            onPress={() => {
              onConfirm(friends.filter((f) => picked.has(f.id)));
              setPicked(new Set());
            }}
          />
          <Button variant="secondary" title={t('common.cancel')} onPress={close} />
        </View>
      </Screen>
    </Modal>
  );
}
