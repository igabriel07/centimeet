/**
 * Κοινά κομμάτια των οθονών σύνδεσης / εγγραφής / επαναφοράς κωδικού.
 * Η εμφάνιση παίρνει χρώματα και μεγέθη από το src/theme.ts.
 */
import { PASSWORD_MIN_LENGTH, passwordStrength, type AuthErrorKey, type AuthFieldError } from '@centimeet/shared';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, typeScale } from '@/theme';
import { AppText, Body, H1, Input, Screen, useTheme } from './ui';

/** Πλαίσιο οθόνης: κύλιση, πληκτρολόγιο, κεντραρισμένο περιεχόμενο */
export function AuthScreen({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {onBack && (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('auth.backToSignIn')} hitSlop={12} style={st.back}>
              <Ionicons name="chevron-back" size={26} color={c.text} />
            </Pressable>
          )}
          <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Body style={{ fontSize: 40, marginBottom: space.sm }}>📍</Body>
      <H1>{title}</H1>
      {subtitle ? <Body muted>{subtitle}</Body> : null}
    </View>
  );
}

/** Πεδίο με ετικέτα και μήνυμα λάθους από κάτω */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: AuthFieldError;
  hint?: string;
  children: ReactNode;
}) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ gap: 6 }}>
      <AppText style={{ color: c.text, fontWeight: '500', fontSize: typeScale.small }}>{label}</AppText>
      {children}
      {error ? (
        <AppText accessibilityLiveRegion="polite" style={{ color: c.danger, fontSize: typeScale.small }}>
          {t(`auth.${error}`, { min: PASSWORD_MIN_LENGTH })}
        </AppText>
      ) : hint ? (
        <AppText style={{ color: c.muted, fontSize: typeScale.small }}>{hint}</AppText>
      ) : null}
    </View>
  );
}

/** Πεδίο κωδικού με κουμπί εμφάνισης/απόκρυψης */
export function PasswordInput({ invalid, ...props }: TextInputProps & { invalid?: boolean }) {
  const c = useTheme();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        {...props}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        style={[{ paddingRight: 48 }, invalid && { borderColor: c.danger }]}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        hitSlop={8}
        style={st.eye}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
      </Pressable>
    </View>
  );
}

/** Μπάρα δύναμης κωδικού (μόνο ενημερωτική) */
export function StrengthBar({ password }: { password: string }) {
  const c = useTheme();
  const { t } = useTranslation();
  const score = passwordStrength(password);
  if (!password) return null;
  const color = score <= 1 ? c.danger : score === 2 ? c.warn : c.good;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= score ? color : c.border }} />
        ))}
      </View>
      <AppText style={{ color, fontSize: typeScale.small }}>{t(`auth.strength${Math.max(1, score)}`)}</AppText>
    </View>
  );
}

/** «──── ή ────» */
export function OrDivider() {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginVertical: space.lg }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
      <Body muted>{t('auth.or')}</Body>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
    </View>
  );
}

/** Κουμπί εναλλακτικού τρόπου (Google, κωδικός στο email…) με περίγραμμα */
export function ProviderButton({
  icon,
  title,
  onPress,
  loading,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        st.provider,
        { backgroundColor: c.card, borderColor: c.border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={c.text} /> : <View style={st.providerIcon}>{icon}</View>}
      <AppText style={{ color: c.text, fontWeight: '600', fontSize: typeScale.button }}>{title}</AppText>
    </Pressable>
  );
}

/** Το «G» του Google με τα χρώματά του */
export function GoogleIcon() {
  return <Ionicons name="logo-google" size={20} color="#4285F4" />;
}

/** Μήνυμα σφάλματος / επιτυχίας πάνω από τη φόρμα */
export function FormMessage({ error, info }: { error?: AuthErrorKey | null; info?: string | null }) {
  const c = useTheme();
  const { t } = useTranslation();
  if (!error && !info) return null;
  const color = error ? c.danger : c.good;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[st.message, { borderColor: color, backgroundColor: c.card }]}
    >
      <Ionicons name={error ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={20} color={color} />
      <AppText style={{ color: c.text, flex: 1, fontSize: typeScale.small }}>{error ? t(`auth.${error}`) : info}</AppText>
    </View>
  );
}

/** «Δεν έχεις λογαριασμό; Εγγραφή» */
export function SwitchPrompt({ question, action, onPress }: { question: string; action: string; onPress: () => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginTop: space.xl }}>
      <Body muted>{question}</Body>
      <Body onPress={onPress} style={{ color: c.primary, fontWeight: '600' }}>
        {action}
      </Body>
    </View>
  );
}

/** Link κειμένου (π.χ. «Ξέχασες τον κωδικό;») */
export function TextLink({ title, onPress, align = 'left' }: { title: string; onPress: () => void; align?: 'left' | 'right' | 'center' }) {
  const c = useTheme();
  return (
    <Body onPress={onPress} style={{ color: c.primary, fontWeight: '500', textAlign: align, paddingVertical: 4 }}>
      {title}
    </Body>
  );
}

/** Πεδίο για τον 6ψήφιο κωδικό του email */
export function CodeInput(props: TextInputProps & { invalid?: boolean }) {
  const c = useTheme();
  return (
    <Input
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={6}
      {...props}
      style={[{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }, props.invalid && { borderColor: c.danger }]}
    />
  );
}

/** «Στείλε ξανά τον κωδικό» με αναμονή 60″ (όσο και το max_frequency του Supabase) */
export function ResendCode({ onResend, cooldown = 60 }: { onResend: () => Promise<boolean>; cooldown?: number }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(cooldown);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  if (left > 0) return <Body muted style={{ textAlign: 'center', paddingVertical: 4 }}>{t('auth.resendIn', { s: left })}</Body>;
  return (
    <TextLink
      align="center"
      title={busy ? '…' : t('auth.resendCode')}
      onPress={async () => {
        if (busy) return;
        setBusy(true);
        const ok = await onResend();
        setBusy(false);
        if (ok) setLeft(cooldown);
      }}
    />
  );
}

/** Αποδοχή όρων στο κάτω μέρος */
export function LegalConsent() {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <Body muted style={{ fontSize: 12, marginTop: space.lg, textAlign: 'center' }}>
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
  );
}

const st = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  back: { position: 'absolute', top: space.sm, left: space.md, zIndex: 1, padding: 4 },
  eye: { position: 'absolute', right: 12, padding: 4 },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.button,
    minHeight: 50,
    paddingHorizontal: 18,
  },
  providerIcon: { width: 22, alignItems: 'center' },
  message: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.md, padding: space.md },
});
