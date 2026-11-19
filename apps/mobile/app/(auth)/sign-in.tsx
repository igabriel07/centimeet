import { authErrorKey, isValid, normalizeEmail, validateSignIn, type AuthErrorKey } from '@centimeet/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AuthHeader,
  AuthScreen,
  Field,
  FormMessage,
  GoogleIcon,
  LegalConsent,
  OrDivider,
  PasswordInput,
  ProviderButton,
  SwitchPrompt,
  TextLink,
} from '@/components/auth';
import { Body, Button, Input, useTheme } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { signInWithProvider } from '@/lib/oauth';
import { supabase, supabaseConfigured } from '@/lib/supabase';

/**
 * Σύνδεση: email + κωδικός · «Ξέχασες τον κωδικό;» · ή Google / κωδικός στο email · Εγγραφή.
 */
export default function SignIn() {
  const { t } = useTranslation();
  const c = useTheme();
  const { setGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState<AuthErrorKey | null>(null);

  const errors = validateSignIn({ email, password });
  const show = submitted ? errors : {};

  async function onSignIn() {
    setSubmitted(true);
    setError(null);
    if (!isValid(errors)) return;
    setBusy('password');
    const addr = normalizeEmail(email);
    const { error: e } = await supabase.auth.signInWithPassword({ email: addr, password });
    if (!e) {
      setBusy(null);
      router.replace('/(tabs)');
      return;
    }
    const key = authErrorKey(e);
    if (key === 'errEmailNotConfirmed') {
      // Στέλνουμε νέο κωδικό επιβεβαίωσης και πάμε στο βήμα επιβεβαίωσης της εγγραφής
      await supabase.auth.resend({ type: 'signup', email: addr });
      setBusy(null);
      router.push({ pathname: '/(auth)/sign-up', params: { verify: addr } });
      return;
    }
    setBusy(null);
    setError(key);
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

  if (!supabaseConfigured) {
    return (
      <AuthScreen>
        <AuthHeader title={t('auth.title')} subtitle={t('auth.subtitle')} />
        {/* Μόνο για τοπική ανάπτυξη χωρίς Supabase — στην παραγωγή το API ζητά σύνδεση */}
        <Body muted>{t('auth.notConfigured')}</Body>
        <Button
          variant="secondary"
          title={t('auth.continueGuest')}
          onPress={() => {
            setGuest(true);
            router.replace('/(tabs)');
          }}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      {/* Μόνο στην ανάπτυξη (__DEV__): παράκαμψη σύνδεσης για να δουλεύεις την εμφάνιση των επόμενων οθονών.
          Στα builds παραγωγής δεν εμφανίζεται. */}
      {__DEV__ && (
        <TextLink
          align="right"
          title={t('auth.skip')}
          onPress={() => {
            setGuest(true);
            router.replace('/(tabs)');
          }}
        />
      )}
      <AuthHeader title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')} />
      <FormMessage error={error} />

      <Field label={t('auth.email')} error={show.email}>
        <Input
          testID="signin-email"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          style={show.email ? { borderColor: c.danger } : undefined}
        />
      </Field>

      <Field label={t('auth.password')} error={show.password}>
        <PasswordInput
          testID="signin-password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••••••"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={onSignIn}
          invalid={!!show.password}
        />
      </Field>
      <TextLink
        align="right"
        title={t('auth.forgotPassword')}
        onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email: email.trim() } })}
      />

      <Button title={t('auth.signIn')} onPress={onSignIn} loading={busy === 'password'} disabled={!!busy} />

      <OrDivider />

      <ProviderButton icon={<GoogleIcon />} title={t('auth.continueGoogle')} onPress={onGoogle} loading={busy === 'google'} disabled={!!busy} />
      <ProviderButton
        icon={<Ionicons name="mail-outline" size={20} color={c.text} />}
        title={t('auth.emailCodeOption')}
        onPress={() => router.push({ pathname: '/(auth)/email-code', params: { email: email.trim() } })}
        disabled={!!busy}
      />

      <SwitchPrompt question={t('auth.noAccount')} action={t('auth.signUp')} onPress={() => router.push('/(auth)/sign-up')} />
      <LegalConsent />
    </AuthScreen>
  );
}
