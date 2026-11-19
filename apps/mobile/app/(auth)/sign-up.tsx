import {
  authErrorKey,
  codeError,
  isExistingUserSignUp,
  isValid,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  validateSignUp,
  type AuthErrorKey,
} from '@centimeet/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AuthHeader,
  AuthScreen,
  CodeInput,
  Field,
  FormMessage,
  GoogleIcon,
  LegalConsent,
  OrDivider,
  PasswordInput,
  ProviderButton,
  ResendCode,
  StrengthBar,
  SwitchPrompt,
} from '@/components/auth';
import { Button, Input, useTheme } from '@/components/ui';
import { signInWithProvider } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';

/**
 * Εγγραφή: όνομα, email, κωδικός (+ επιβεβαίωση) → 6ψήφιος κωδικός στο email → μέσα.
 * Ή «Εγγραφή με Google». Με ?verify=email ανοίγει κατευθείαν στο βήμα επιβεβαίωσης
 * (π.χ. από τη Σύνδεση για λογαριασμό που δεν επιβεβαιώθηκε).
 */
export default function SignUp() {
  const { t } = useTranslation();
  const c = useTheme();
  const params = useLocalSearchParams<{ verify?: string }>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.verify ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [stage, setStage] = useState<'form' | 'verify'>(params.verify ? 'verify' : 'form');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'form' | 'google' | 'verify' | null>(null);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const errors = validateSignUp({ name, email, password, confirm });
  const show = submitted ? errors : {};
  const addr = normalizeEmail(email);

  async function onSignUp() {
    setSubmitted(true);
    setError(null);
    if (!isValid(errors)) return;
    setBusy('form');
    const { data, error: e } = await supabase.auth.signUp({
      email: addr,
      password,
      options: { data: { full_name: name.trim() } },
    });
    setBusy(null);
    if (e) return setError(authErrorKey(e));
    if (isExistingUserSignUp(data.user)) return setError('errUserExists');
    if (data.session) return router.replace('/(tabs)'); // αν η επιβεβαίωση email είναι κλειστή
    setInfo(null);
    setStage('verify');
  }

  async function onVerify() {
    setError(null);
    if (codeError(code)) return setError('errInvalidCode');
    setBusy('verify');
    const { error: e } = await supabase.auth.verifyOtp({ email: addr, token: code.trim(), type: 'signup' });
    setBusy(null);
    if (e) return setError(authErrorKey(e));
    router.replace('/(tabs)');
  }

  async function onResend() {
    setError(null);
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: addr });
    if (e) {
      setError(authErrorKey(e));
      return false;
    }
    setInfo(t('auth.codeResent'));
    return true;
  }

  async function onGoogle() {
    setError(null);
    setBusy('google');
    const r = await signInWithProvider('google');
    setBusy(null);
    if (r.ok) {
      if (process.env.EXPO_OS !== 'web') router.replace('/(tabs)');
    } else if (r.error !== 'errCancelled') setError(r.error);
  }

  if (stage === 'verify') {
    return (
      <AuthScreen onBack={() => (params.verify ? router.back() : setStage('form'))}>
        <AuthHeader title={t('auth.verifyTitle')} subtitle={t('auth.verifyBody', { email: addr })} />
        <FormMessage error={error} info={info} />
        <CodeInput testID="signup-code" value={code} onChangeText={setCode} placeholder="000000" onSubmitEditing={onVerify} autoFocus />
        <Button title={t('auth.confirm')} onPress={onVerify} loading={busy === 'verify'} disabled={code.trim().length < 6} />
        <ResendCode onResend={onResend} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/sign-in'))}>
      <AuthHeader title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')} />
      <FormMessage error={error} />

      <Field label={t('auth.name')} error={show.name}>
        <Input
          testID="signup-name"
          value={name}
          onChangeText={setName}
          placeholder={t('auth.namePlaceholder')}
          autoComplete="name"
          textContentType="name"
          maxLength={80}
          style={show.name ? { borderColor: c.danger } : undefined}
        />
      </Field>

      <Field label={t('auth.email')} error={show.email}>
        <Input
          testID="signup-email"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          style={show.email ? { borderColor: c.danger } : undefined}
        />
      </Field>

      <Field label={t('auth.password')} error={show.password} hint={t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH })}>
        <PasswordInput
          testID="signup-password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          invalid={!!show.password}
        />
        <StrengthBar password={password} />
      </Field>

      <Field label={t('auth.confirmPassword')} error={show.confirm}>
        <PasswordInput
          testID="signup-confirm"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={onSignUp}
          invalid={!!show.confirm}
        />
      </Field>

      <Button title={t('auth.createAccount')} onPress={onSignUp} loading={busy === 'form'} disabled={!!busy} />

      <OrDivider />

      <ProviderButton icon={<GoogleIcon />} title={t('auth.signUpGoogle')} onPress={onGoogle} loading={busy === 'google'} disabled={!!busy} />

      <SwitchPrompt
        question={t('auth.haveAccount')}
        action={t('auth.signIn')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/sign-in'))}
      />
      <LegalConsent />
    </AuthScreen>
  );
}
