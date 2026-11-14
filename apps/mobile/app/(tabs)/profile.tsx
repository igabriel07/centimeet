import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { Body, Button, H1, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function Profile() {
  const { t } = useTranslation();
  const { session, setGuest } = useAuth();
  const me = session?.user.id;

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
    setGuest(false);
    await supabase.auth.signOut();
    router.replace('/(auth)/sign-in');
  }

  return (
    <Screen style={{ padding: 20 }}>
      <H1>{profile.data?.display_name ?? t('profile.guest')}</H1>
      {profile.data ? <Body muted>@{profile.data.username}</Body> : null}
      <View style={{ marginTop: 32, gap: 12 }}>
        <Button variant="secondary" title={t('profile.signOut')} onPress={signOut} />
        {me ? (
          <Button
            variant="secondary"
            title={t('profile.deleteAccount')}
            onPress={() =>
              // Απαιτείται από App Store & Google Play. Υλοποίηση: Supabase Edge Function με service role
              // που διαγράφει τον χρήστη από auth.users (cascade σε όλα τα δεδομένα).
              Alert.alert(t('profile.deleteAccount'), 'TODO: Edge Function delete-account')
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}
