/**
 * Σύνδεση / εγγραφή με Google (OAuth μέσω Supabase, ροή PKCE).
 *
 *  - Κινητό: ανοίγει browser μέσα στην εφαρμογή → Google → Supabase → επιστροφή σε
 *    centimeet://auth-callback?code=… (στο Expo Go: exp://…/--/auth-callback) → ανταλλαγή code με session.
 *  - Web: ανακατεύθυνση όλης της σελίδας· στην επιστροφή το Supabase διαβάζει μόνο του το ?code=
 *    (detectSessionInUrl) και η οθόνη /auth-callback περιμένει τη σύνδεση.
 *
 * Το ίδιο κουμπί κάνει και σύνδεση και εγγραφή: αν δεν υπάρχει λογαριασμός, δημιουργείται
 * (το προφίλ φτιάχνεται από το trigger handle_new_user με το όνομα από το Google).
 *
 * ⚠️ Τα redirect URLs πρέπει να είναι στο additional_redirect_urls του supabase/config.toml.
 */
import { parseOAuthRedirect, type AuthErrorKey, authErrorKey } from '@centimeet/shared';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'google';

export type OAuthResult = { ok: true } | { ok: false; error: AuthErrorKey };

export function oauthRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/auth-callback`;
  return Linking.createURL('auth-callback');
}

/** Ολοκληρώνει τη σύνδεση από URL επιστροφής (χρησιμοποιείται και από την οθόνη /auth-callback). */
export async function completeOAuthFromUrl(url: string): Promise<OAuthResult> {
  const r = parseOAuthRedirect(url);
  if (r.kind === 'error') return { ok: false, error: /denied|cancel/i.test(r.message) ? 'errCancelled' : authErrorKey({ message: r.message }) };
  if (r.kind === 'code') {
    const { error } = await supabase.auth.exchangeCodeForSession(r.code);
    return error ? { ok: false, error: authErrorKey(error) } : { ok: true };
  }
  if (r.kind === 'tokens') {
    const { error } = await supabase.auth.setSession({ access_token: r.accessToken, refresh_token: r.refreshToken });
    return error ? { ok: false, error: authErrorKey(error) } : { ok: true };
  }
  return { ok: false, error: 'errUnknown' };
}

/** Ποιοι providers είναι ενεργοί στο Supabase (δημόσιο endpoint /auth/v1/settings). */
export async function enabledProviders(): Promise<Partial<Record<OAuthProvider, boolean>>> {
  const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } });
  if (!res.ok) throw new Error(`settings ${res.status}`);
  const body = (await res.json()) as { external?: Record<string, boolean> };
  return { google: !!body.external?.google };
}

export async function signInWithProvider(provider: OAuthProvider): Promise<OAuthResult> {
  try {
    if (!(await enabledProviders())[provider]) return { ok: false, error: 'errProviderDisabled' };
  } catch {
    return { ok: false, error: 'errOffline' };
  }
  const redirectTo = oauthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) return { ok: false, error: authErrorKey(error) };
  if (Platform.OS === 'web') return { ok: true }; // η σελίδα φεύγει προς το Google
  if (!data?.url) return { ok: false, error: 'errUnknown' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, error: 'errCancelled' };
  return completeOAuthFromUrl(result.url);
}
