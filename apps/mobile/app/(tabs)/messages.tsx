import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList } from 'react-native';
import { Body, Card, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type ConvRow = {
  conversation_id: string;
  conversations: {
    kind: 'direct' | 'outing';
    outing_id: string | null;
    conversation_members: { user_id: string; profiles: { display_name: string } | null }[];
  };
};

export default function Messages() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;

  const q = useQuery({
    queryKey: ['conversations', me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_members')
        .select('conversation_id, conversations(kind, outing_id, conversation_members(user_id, profiles(display_name)))')
        .eq('user_id', me!);
      if (error) throw error;
      return data as unknown as ConvRow[];
    },
  });

  if (!me) {
    return (
      <Screen style={{ padding: 20 }}>
        <Body muted>{t('friends.signInFirst')}</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        contentContainerStyle={{ padding: 20 }}
        data={q.data ?? []}
        keyExtractor={(r) => r.conversation_id}
        ListEmptyComponent={q.isLoading ? undefined : <Body muted>{t('messages.empty')}</Body>}
        renderItem={({ item }) => {
          const others = item.conversations.conversation_members
            .filter((m) => m.user_id !== me)
            .map((m) => m.profiles?.display_name ?? '…');
          const title = item.conversations.kind === 'outing' ? `📍 ${others.join(', ') || '…'}` : others.join(', ');
          return (
            <Card onPress={() => router.push(`/chat/${item.conversation_id}`)}>
              <Body style={{ fontWeight: '600' }}>{title}</Body>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
