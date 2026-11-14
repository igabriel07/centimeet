import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, View } from 'react-native';
import { Body, Button, Card, H1, Label, Screen } from '@/components/ui';
import { APP_INFO } from '@/legal/content';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/outings';
import { unregisterPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const { t } = useTranslation();
  const { session, setGuest } = useAuth();
  const qc = useQueryClient();
  const me = session?.user.id;
  const [deleting, setDeleting] = useState(false);

  const profile = useQuery({
    queryKey: ['profile', me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('username, display_name').eq('id', me!).single();
      if (error) throw error;
      return data as { username: string; display_name: string };
    },
  });

  async function signOut() {
    await unregisterPush().catch(() => {});
    setGuest(false);
    await supabase.auth.signOut();
    qc.clear();
    router.replace('/(auth)/sign-in');
  }

  /** Απαιτείται από App Store & Google Play: οριστική διαγραφή μέσα από την εφαρμογή */
  function confirmDelete() {
    Alert.alert(t('profile.deleteTitle'), t('profile.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await unregisterPush().catch(() => {});
            const { error } = await supabase.rpc('delete_my_account');
            if (error) throw error;
            await supabase.auth.signOut().catch(() => {});
            qc.clear();
            Alert.alert(t('profile.deleted'));
            router.replace('/(auth)/sign-in');
          } catch (e) {
            Alert.alert(t('common.error'), errorMessage(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <H1>{profile.data?.display_name ?? t('profile.guest')}</H1>
        {profile.data ? <Body muted>@{profile.data.username}</Body> : null}
        {session?.user.email ? <Body muted>{session.user.email}</Body> : null}

        <View style={{ marginTop: 24 }}>
          <Button variant="secondary" title={t('profile.signOut')} onPress={signOut} />
        </View>

        <Label>{t('profile.about')}</Label>
        <Card onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
          <Body>{t('profile.privacy')}</Body>
        </Card>
        <Card onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
          <Body>{t('profile.terms')}</Body>
        </Card>
        <Body muted style={{ marginTop: 4 }}>
          {t('profile.contact', { email: APP_INFO.contactEmail })}
        </Body>

        {me ? (
          <>
            <Label>{t('profile.dangerZone')}</Label>
            <Button variant="danger" title={t('profile.deleteAccount')} onPress={confirmDelete} loading={deleting} />
          </>
        ) : null}

        <Body muted style={{ marginTop: 32, textAlign: 'center', fontSize: 12 }}>
          {APP_INFO.name} v{Constants.expoConfig?.version ?? '—'}
        </Body>
      </ScrollView>
    </Screen>
  );
}
