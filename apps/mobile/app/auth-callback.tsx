import type { AuthErrorKey } from '@centimeet/shared';
import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, View } from 'react-native';
import { FormMessage, TextLink } from '@/components/auth';
import { Body } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { completeOAuthFromUrl } from '@/lib/oauth';

/**
 * Επιστροφή από Google (centimeet://auth-callback?code=… ή /auth-callback στο web).
 *  - Web: το Supabase ανταλλάσσει μόνο του το code (detectSessionInUrl) — εδώ απλώς περιμένουμε.
 *  - Κινητό: συνήθως το χειρίζεται το openAuthSessionAsync· αν το link άνοιξε την εφαρμογή απευθείας,
 *    ολοκληρώνουμε από εδώ.
 */
export default function AuthCallback() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const url = Linking.useURL();
  const [error, setError] = useState<AuthErrorKey | null>(null);

  useEffect(() => {
    if (session || Platform.OS === 'web' || !url) return;
    completeOAuthFromUrl(url).then((r) => !r.ok && r.error !== 'errUnknown' && setError(r.error));
  }, [url, session]);

  useEffect(() => {
    // Στο web: αν το URL έχει σφάλμα (π.χ. ακύρωση), το δείχνουμε
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search + '&' + window.location.hash.slice(1));
    if (q.get('error')) setError(/denied/i.test(q.get('error') ?? '') ? 'errCancelled' : 'errUnknown');
  }, []);

  useEffect(() => {
    if (error) return;
    const id = setTimeout(() => setError('errUnknown'), 15000);
    return () => clearTimeout(id);
  }, [error]);

  if (session) return <Redirect href="/(tabs)" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      {error ? (
        <>
          <FormMessage error={error} />
          <TextLink align="center" title={t('auth.backToSignIn')} onPress={() => router.replace('/(auth)/sign-in')} />
        </>
      ) : (
        <>
          <ActivityIndicator />
          <Body muted>{t('auth.completing')}</Body>
        </>
      )}
    </View>
  );
}
