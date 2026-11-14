import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, H1, Input, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';

/**
 * Σύνδεση με κωδικό μίας χρήσης στο email (χωρίς κωδικό πρόσβασης).
 * TODO (φάση 1): Sign in with Apple (υποχρεωτικό στο iOS αν προσφέρουμε Google) + Google.
 */
export default function SignIn() {
  const { t } = useTranslation();
  const { setGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) Alert.alert(t('common.error'), error.message);
    else setStage('code');
  }

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) Alert.alert(t('common.error'), error.message);
    else router.replace('/(tabs)');
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
          <H1>{t('auth.title')}</H1>
          <Body muted>{t('auth.subtitle')}</Body>

          {supabaseConfigured ? (
            stage === 'email' ? (
              <View style={{ gap: 12, marginTop: 16 }}>
                <Input value={email} onChangeText={setEmail} placeholder={t('auth.email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <Button title={t('auth.sendCode')} onPress={sendCode} loading={busy} disabled={!email.includes('@')} />
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 16 }}>
                <Input value={code} onChangeText={setCode} placeholder={t('auth.code')} keyboardType="number-pad" autoComplete="one-time-code" />
                <Button title={t('auth.verify')} onPress={verify} loading={busy} disabled={code.length < 6} />
              </View>
            )
          ) : (
            <Body muted style={{ marginTop: 16 }}>{t('auth.notConfigured')}</Body>
          )}

          <Button
            variant="secondary"
            title={t('auth.continueGuest')}
            onPress={() => {
              setGuest(true);
              router.replace('/(tabs)');
            }}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}
