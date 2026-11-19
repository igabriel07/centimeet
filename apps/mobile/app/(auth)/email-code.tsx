import { authErrorKey, codeError, emailError, normalizeEmail, type AuthErrorKey } from '@centimeet/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthHeader, AuthScreen, CodeInput, Field, FormMessage, ResendCode, TextLink } from '@/components/auth';
import { Button, Input, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';

/**
 * Σύνδεση χωρίς κωδικό πρόσβασης: 6ψήφιος κωδικός στο email (template magic_link).
 * Αν δεν υπάρχει λογαριασμός, δημιουργείται (όπως στην αρχική έκδοση της εφαρμογής).
 */
export default function EmailCode() {
  const { t } = useTranslation();
  const c = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const addr = normalizeEmail(email);

  async function send(): Promise<boolean> {
    setSubmitted(true);
    setError(null);
    if (emailError(email)) return false;
    setBusy(true);
    const { error: e } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) {
      setError(authErrorKey(e));
      return false;
    }
    return true;
  }

  async function verify() {
    setError(null);
    if (codeError(code)) return setError('errInvalidCode');
    setBusy(true);
    const { error: e } = await supabase.auth.verifyOtp({ email: addr, token: code.trim(), type: 'email' });
    setBusy(false);
    if (e) return setError(authErrorKey(e));
    router.replace('/(tabs)');
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/sign-in'));

  if (stage === 'email') {
    const show = submitted ? emailError(email) : undefined;
    return (
      <AuthScreen onBack={back}>
        <AuthHeader title={t('auth.emailCodeTitle')} subtitle={t('auth.emailCodeBody')} />
        <FormMessage error={error} />
        <Field label={t('auth.email')} error={show}>
          <Input
            testID="otp-email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={async () => (await send()) && setStage('code')}
            style={show ? { borderColor: c.danger } : undefined}
          />
        </Field>
        <Button title={t('auth.sendCode')} onPress={async () => (await send()) && setStage('code')} loading={busy} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen onBack={() => setStage('email')}>
      <AuthHeader title={t('auth.emailCodeTitle')} subtitle={t('auth.codeSent', { email: addr })} />
      <FormMessage error={error} info={info} />
      <CodeInput testID="otp-code" value={code} onChangeText={setCode} placeholder="000000" onSubmitEditing={verify} autoFocus />
      <Button title={t('auth.verify')} onPress={verify} loading={busy} disabled={code.trim().length < 6} />
      <ResendCode
        onResend={async () => {
          const ok = await send();
          if (ok) setInfo(t('auth.codeResent'));
          return ok;
        }}
      />
      <TextLink align="center" title={t('auth.changeEmail')} onPress={() => setStage('email')} />
    </AuthScreen>
  );
}
