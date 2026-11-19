import {
  authErrorKey,
  codeError,
  emailError,
  isValid,
  normalizeEmail,
  PASSWORD_MIN_LENGTH,
  validateNewPassword,
  type AuthErrorKey,
} from '@centimeet/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthHeader, AuthScreen, CodeInput, Field, FormMessage, PasswordInput, ResendCode, StrengthBar } from '@/components/auth';
import { Button, Input, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';

/**
 * Επαναφορά κωδικού: email → 6ψήφιος κωδικός (template recovery) + νέος κωδικός → μέσα.
 * Για λόγους ασφαλείας δεν λέμε αν το email έχει λογαριασμό — στέλνουμε πάντα «σου στείλαμε κωδικό».
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const c = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const addr = normalizeEmail(email);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/sign-in'));

  async function sendCode() {
    setSubmitted(true);
    setError(null);
    if (emailError(email)) return;
    setBusy(true);
    const { error: e } = await supabase.auth.resetPasswordForEmail(addr);
    setBusy(false);
    if (e) return setError(authErrorKey(e));
    setSubmitted(false);
    setInfo(null);
    setStage('reset');
  }

  async function resend() {
    setError(null);
    const { error: e } = await supabase.auth.resetPasswordForEmail(addr);
    if (e) {
      setError(authErrorKey(e));
      return false;
    }
    setInfo(t('auth.codeResent'));
    return true;
  }

  const pwErrors = validateNewPassword({ password, confirm });

  async function reset() {
    setSubmitted(true);
    setError(null);
    if (codeError(code)) return setError('errInvalidCode');
    if (!isValid(pwErrors)) return;
    setBusy(true);
    const { error: e1 } = await supabase.auth.verifyOtp({ email: addr, token: code.trim(), type: 'recovery' });
    if (e1) {
      setBusy(false);
      return setError(authErrorKey(e1));
    }
    const { error: e2 } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (e2) return setError(authErrorKey(e2));
    router.replace('/(tabs)');
  }

  if (stage === 'email') {
    const show = submitted ? emailError(email) : undefined;
    return (
      <AuthScreen onBack={back}>
        <AuthHeader title={t('auth.forgotTitle')} subtitle={t('auth.forgotBody')} />
        <FormMessage error={error} />
        <Field label={t('auth.email')} error={show}>
          <Input
            testID="forgot-email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={sendCode}
            style={show ? { borderColor: c.danger } : undefined}
          />
        </Field>
        <Button title={t('auth.sendResetCode')} onPress={sendCode} loading={busy} />
      </AuthScreen>
    );
  }

  const show = submitted ? pwErrors : {};
  return (
    <AuthScreen onBack={() => setStage('email')}>
      <AuthHeader title={t('auth.forgotTitle')} subtitle={t('auth.verifyBody', { email: addr })} />
      <FormMessage error={error} info={info} />
      <Field label={t('auth.code')}>
        <CodeInput testID="forgot-code" value={code} onChangeText={setCode} placeholder="000000" autoFocus />
      </Field>
      <Field label={t('auth.newPassword')} error={show.password} hint={t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH })}>
        <PasswordInput
          testID="forgot-password"
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
          testID="forgot-confirm"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={reset}
          invalid={!!show.confirm}
        />
      </Field>
      <Button title={t('auth.savePassword')} onPress={reset} loading={busy} />
      <ResendCode onResend={resend} />
    </AuthScreen>
  );
}
