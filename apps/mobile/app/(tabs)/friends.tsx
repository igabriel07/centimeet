import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, View } from 'react-native';
import { Body, Button, Card, Chip, Input, Label, Row, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { acceptedFriends, useFriendships, type Profile } from '@/lib/friends';
import { openModerationMenu } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';

export default function Friends() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const friendships = useFriendships(me);

  const results = useQuery({
    queryKey: ['profile-search', search],
    enabled: !!me && search.trim().length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .ilike('username', `${search.trim().toLowerCase()}%`)
        .neq('id', me!)
        .limit(10);
      if (error) throw error;
      return data as Profile[];
    },
  });

  const request = useMutation({
    mutationFn: async (to: string) => {
      const { error } = await supabase.from('friendships').insert({ requester_id: me, addressee_id: to });
      if (error) throw error;
    },
    onSuccess: () => {
      Alert.alert(t('friends.sent'));
      qc.invalidateQueries({ queryKey: ['friendships'] });
    },
    onError: (e: Error) => Alert.alert(t('common.error'), e.message),
  });

  const respond = useMutation({
    mutationFn: async ({ from, accept }: { from: string; accept: boolean }) => {
      const { error } = await supabase
        .from('friendships')
        .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
        .eq('requester_id', from)
        .eq('addressee_id', me!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friendships'] }),
  });

  async function openChat(friendId: string) {
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other: friendId });
    if (error) return Alert.alert(t('common.error'), error.message);
    router.push(`/chat/${data as string}`);
  }

  if (!me) {
    return (
      <Screen style={{ padding: 20 }}>
        <Body muted>{t('friends.signInFirst')}</Body>
      </Screen>
    );
  }

  const rows = friendships.data ?? [];
  const incoming = rows.filter((r) => r.status === 'pending' && r.addressee_id === me);
  const friends = acceptedFriends(rows, me);
  const knownIds = new Set(rows.flatMap((r) => [r.requester_id, r.addressee_id]));

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: 20 }}
        data={friends}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={
          <View>
            <Input value={search} onChangeText={setSearch} placeholder={t('friends.search')} autoCapitalize="none" />
            {(results.data ?? []).map((p) => (
              <Card key={p.id} style={{ marginTop: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Body>
                    {p.display_name} <Body muted>@{p.username}</Body>
                  </Body>
                  {!knownIds.has(p.id) ? <Chip label={t('friends.add')} onPress={() => request.mutate(p.id)} /> : null}
                </Row>
              </Card>
            ))}

            {incoming.length ? <Label>{t('friends.requests')}</Label> : null}
            {incoming.map((r) => (
              <Card key={r.requester_id}>
                <Body style={{ fontWeight: '600' }}>{r.requester.display_name}</Body>
                <Row style={{ marginTop: 8 }}>
                  <Chip label={t('friends.accept')} selected onPress={() => respond.mutate({ from: r.requester_id, accept: true })} />
                  <Chip label={t('friends.decline')} onPress={() => respond.mutate({ from: r.requester_id, accept: false })} />
                </Row>
              </Card>
            ))}
            <Label>{t('friends.title')}</Label>
            {friends.length ? <Body muted style={{ fontSize: 12, marginBottom: 8 }}>{t('moderation.hintFriends')}</Body> : null}
            {friends.length === 0 && !friendships.isLoading ? <Body muted>{t('friends.empty')}</Body> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card
            onPress={() => openChat(item.id)}
            onLongPress={() =>
              openModerationMenu(
                { id: item.id, name: item.display_name },
                { onBlocked: () => qc.invalidateQueries({ queryKey: ['friendships'] }) },
              )
            }
          >
            <Body style={{ fontWeight: '600' }}>{item.display_name}</Body>
            <Body muted>@{item.username}</Body>
          </Card>
        )}
        ListFooterComponent={friendships.isError ? <Button title={t("common.retry")} onPress={() => friendships.refetch()} /> : undefined}
      />
    </Screen>
  );
}
