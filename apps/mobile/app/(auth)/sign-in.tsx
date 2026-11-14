import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, H1, Input, Screen, useTheme } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase, supabaseConfigured } from '@/lib/supabase';

/**
 * Λογαριασμός για τον έλεγχο της Apple/Google: ο ελεγκτής δεν μπορεί να λάβει κωδικό στο email,
 * οπότε για ΑΥΤΟ το email μόνο εμφανίζεται πεδίο κωδικού πρόσβασης (βλ. docs/RELEASE.md).
 */
const REVIEW_EMAIL = (process.env.EXPO_PUBLIC_REVIEW_EMAIL ?? '').trim().toLowerCase();

/** Σύνδεση με κωδικό μίας χρήσης στο email (χωρίς κωδικό πρόσβασης) */
export default function SignIn() {
  const { t } = useTranslation();
  const c = useTheme();
  const { setGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const isReview = !!REVIEW_EMAIL && email.trim().toLowerCase() === REVIEW_EMAIL;

  async function sendCode() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) Alert.alert(t('common.error'), friendlyAuthError(error.message, t));
    else setStage('code');
  }

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) Alert.alert(t('common.error'), friendlyAuthError(error.message, t));
    else router.replace('/(tabs)');
  }

  async function reviewSignIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) Alert.alert(t('common.error'), friendlyAuthError(error.message, t));
    else router.replace('/(tabs)');
  }

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14 }}>
          <Body style={{ fontSize: 44 }}>📍</Body>
          <H1>{t('auth.title')}</H1>
          <Body muted>{t('auth.subtitle')}</Body>

          {supabaseConfigured ? (
            stage === 'email' ? (
              <View style={{ gap: 12, marginTop: 16 }}>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.email')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                />
                {isReview ? (
                  <>
                    <Input value={password} onChangeText={setPassword} placeholder={t('auth.password')} secureTextEntry autoCapitalize="none" />
                    <Button title={t('auth.verify')} onPress={reviewSignIn} loading={busy} disabled={!password} />
                  </>
                ) : (
                  <Button title={t('auth.sendCode')} onPress={sendCode} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
                )}
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 16 }}>
                <Body muted>{t('auth.codeSent', { email: email.trim() })}</Body>
                <Input
                  value={code}
                  onChangeText={setCode}
                  placeholder={t('auth.code')}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={10}
                />
                <Button title={t('auth.verify')} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
                <Button variant="secondary" title={t('auth.changeEmail')} onPress={() => setStage('email')} />
              </View>
            )
          ) : (
            <>
              {/* Μόνο για τοπική ανάπτυξη χωρίς Supabase — στην παραγωγή το API ζητά σύνδεση */}
              <Body muted style={{ marginTop: 16 }}>{t('auth.notConfigured')}</Body>
              <Button
                variant="secondary"
                title={t('auth.continueGuest')}
                onPress={() => {
                  setGuest(true);
                  router.replace('/(tabs)');
                }}
              />
            </>
          )}

          <Body muted style={{ fontSize: 12, marginTop: 8 }}>
            {t('auth.consentPrefix')}{' '}
            <Body style={{ fontSize: 12, color: c.primary }} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
              {t('profile.terms')}
            </Body>{' '}
            {t('auth.consentAnd')}{' '}
            <Body style={{ fontSize: 12, color: c.primary }} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
              {t('profile.privacy')}
            </Body>
            .
          </Body>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

/** Τα μηνύματα του Supabase είναι στα αγγλικά — τα πιο συνηθισμένα σε φιλική μορφή */
function friendlyAuthError(msg: string, t: (k: string) => string) {
  if (/rate limit|security purposes|too many/i.test(msg)) return t('auth.errRateLimit');
  if (/expired|invalid|token/i.test(msg)) return t('auth.errInvalidCode');
  if (/network|fetch/i.test(msg)) return t('errors.offline');
  return msg;
}
