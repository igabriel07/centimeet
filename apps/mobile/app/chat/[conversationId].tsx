import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Body, Button, Input, Screen, useTheme } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Message = { id: string; sender_id: string | null; kind: string; body: string; created_at: string };

/** Συνομιλία με ζωντανή ενημέρωση (Supabase Realtime) */
export default function Chat() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const c = useTheme();
  const me = session?.user.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('messages')
      .select('id, sender_id, kind, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setMessages((data as Message[]) ?? []));

    const channel = supabase
      .channel(`conv:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
        },
      )
      .subscribe();

    supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', me ?? '')
      .then(() => {});

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, me]);

  async function send() {
    const body = text.trim();
    if (!body || !me) return;
    setText('');
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: me, body })
      .select('id, sender_id, kind, body, created_at')
      .single();
    if (!error && data) setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [data as Message, ...prev]));
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 6 }}
          renderItem={({ item }) => {
            const mine = item.sender_id === me;
            if (item.kind === 'system') return <Body muted style={{ textAlign: 'center', fontSize: 13 }}>{item.body}</Body>;
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  backgroundColor: mine ? c.primary : c.card,
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  maxWidth: '80%',
                }}
              >
                <Body style={{ color: mine ? c.primaryText : c.text }}>{item.body}</Body>
              </View>
            );
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border }}>
          <Input style={{ flex: 1 }} value={text} onChangeText={setText} placeholder={t('messages.placeholder')} onSubmitEditing={send} returnKeyType="send" />
          <View style={{ width: 110 }}>
            <Button title={t('messages.send')} onPress={send} disabled={!text.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
