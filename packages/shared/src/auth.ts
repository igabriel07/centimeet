/**
 * Λογική των φορμών σύνδεσης / εγγραφής / επαναφοράς κωδικού — καθαρές συναρτήσεις,
 * ώστε να ελέγχονται με tests ανεξάρτητα από το UI.
 *
 * Τα όρια ταιριάζουν με το supabase/config.toml ([auth] minimum_password_length, otp_length).
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 72; // όριο bcrypt στο Supabase Auth
export const OTP_LENGTH = 6;
export const NAME_MAX_LENGTH = 60;

/** Κλειδιά i18n κάτω από `auth.` */
export type AuthFieldError =
  | 'errEmailRequired'
  | 'errEmailInvalid'
  | 'errPasswordRequired'
  | 'errPasswordShort'
  | 'errPasswordLong'
  | 'errPasswordMismatch'
  | 'errNameRequired'
  | 'errNameLong'
  | 'errCodeInvalid';

export type FieldErrors<K extends string> = Partial<Record<K, AuthFieldError>>;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailError(email: string): AuthFieldError | undefined {
  const e = email.trim();
  if (!e) return 'errEmailRequired';
  if (e.length > 254 || !EMAIL_RE.test(e)) return 'errEmailInvalid';
  return undefined;
}

export function newPasswordError(password: string): AuthFieldError | undefined {
  if (!password) return 'errPasswordRequired';
  if ([...password].length < PASSWORD_MIN_LENGTH) return 'errPasswordShort';
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) return 'errPasswordLong';
  return undefined;
}

export function codeError(code: string): AuthFieldError | undefined {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code.trim()) ? undefined : 'errCodeInvalid';
}

/** Δεν απαιτούμε κανόνες στη σύνδεση (παλιοί κωδικοί μπορεί να είναι πιο σύντομοι) — μόνο να υπάρχει. */
export function validateSignIn(v: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {};
  const e = emailError(v.email);
  if (e) errors.email = e;
  if (!v.password) errors.password = 'errPasswordRequired';
  return errors;
}

export function validateSignUp(v: {
  name: string;
  email: string;
  password: string;
  confirm: string;
}): FieldErrors<'name' | 'email' | 'password' | 'confirm'> {
  const errors: FieldErrors<'name' | 'email' | 'password' | 'confirm'> = {};
  const name = v.name.trim();
  if (!name) errors.name = 'errNameRequired';
  else if ([...name].length > NAME_MAX_LENGTH) errors.name = 'errNameLong';
  const e = emailError(v.email);
  if (e) errors.email = e;
  const p = newPasswordError(v.password);
  if (p) errors.password = p;
  if (!p && v.confirm !== v.password) errors.confirm = 'errPasswordMismatch';
  return errors;
}

export function validateNewPassword(v: { password: string; confirm: string }): FieldErrors<'password' | 'confirm'> {
  const errors: FieldErrors<'password' | 'confirm'> = {};
  const p = newPasswordError(v.password);
  if (p) errors.password = p;
  if (!p && v.confirm !== v.password) errors.confirm = 'errPasswordMismatch';
  return errors;
}

export const isValid = (errors: object) => Object.keys(errors).length === 0;

/** Ένδειξη δύναμης κωδικού 0–4 για τη μπάρα κάτω από το πεδίο (δεν μπλοκάρει, μόνο ενημερώνει). */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const len = [...password].length;
  let score = 0;
  if (len >= PASSWORD_MIN_LENGTH) score++;
  if (len >= 16) score++;
  const classes = [/[a-zα-ω]/u, /[A-ZΑ-Ω]/u, /\d/, /[^\p{L}\d]/u].filter((r) => r.test(password)).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (len < PASSWORD_MIN_LENGTH) score = Math.min(score, 1);
  return score as 0 | 1 | 2 | 3 | 4;
}

/** Κλειδιά i18n κάτω από `auth.` για σφάλματα του Supabase Auth */
export type AuthErrorKey =
  | 'errInvalidCredentials'
  | 'errEmailNotConfirmed'
  | 'errUserExists'
  | 'errWeakPassword'
  | 'errRateLimit'
  | 'errInvalidCode'
  | 'errProviderDisabled'
  | 'errSamePassword'
  | 'errSignupDisabled'
  | 'errOffline'
  | 'errCancelled'
  | 'errUnknown';

/**
 * Μετατρέπει σφάλμα του Supabase Auth σε φιλικό μήνυμα.
 * Προτιμά τον σταθερό `code` (supabase-js ≥ 2.x)· αλλιώς ψάχνει στο αγγλικό μήνυμα.
 */
export function authErrorKey(err: { code?: string | null; message?: string | null; status?: number } | null | undefined): AuthErrorKey {
  if (!err) return 'errUnknown';
  const byCode: Record<string, AuthErrorKey> = {
    invalid_credentials: 'errInvalidCredentials',
    email_not_confirmed: 'errEmailNotConfirmed',
    user_already_exists: 'errUserExists',
    email_exists: 'errUserExists',
    weak_password: 'errWeakPassword',
    over_email_send_rate_limit: 'errRateLimit',
    over_request_rate_limit: 'errRateLimit',
    over_sms_send_rate_limit: 'errRateLimit',
    otp_expired: 'errInvalidCode',
    otp_disabled: 'errInvalidCode',
    bad_code_verifier: 'errInvalidCode',
    flow_state_expired: 'errInvalidCode',
    flow_state_not_found: 'errInvalidCode',
    provider_disabled: 'errProviderDisabled',
    oauth_provider_not_supported: 'errProviderDisabled',
    same_password: 'errSamePassword',
    signup_disabled: 'errSignupDisabled',
    email_provider_disabled: 'errSignupDisabled',
  };
  if (err.code && byCode[err.code]) return byCode[err.code]!;

  const m = err.message ?? '';
  if (/invalid login credentials/i.test(m)) return 'errInvalidCredentials';
  if (/email not confirmed/i.test(m)) return 'errEmailNotConfirmed';
  if (/already (registered|exists)/i.test(m)) return 'errUserExists';
  if (/provider is not enabled|unsupported provider/i.test(m)) return 'errProviderDisabled';
  if (/password should|weak password|at least \d+ characters/i.test(m)) return 'errWeakPassword';
  if (/rate limit|security purposes|too many/i.test(m) || err.status === 429) return 'errRateLimit';
  if (/expired|invalid.*(token|otp|code)|token.*invalid/i.test(m)) return 'errInvalidCode';
  if (/network|failed to fetch|fetch failed/i.test(m)) return 'errOffline';
  return 'errUnknown';
}

/**
 * Το Supabase, για να μη φανερώνει ποια email έχουν λογαριασμό, απαντά στο signUp για υπάρχον
 * email χωρίς σφάλμα αλλά με χρήστη χωρίς identities. Το αναγνωρίζουμε για να πούμε «συνδέσου».
 */
export function isExistingUserSignUp(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export type OAuthRedirect =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/**
 * Διαβάζει το URL επιστροφής από Google/Supabase (π.χ. centimeet://auth-callback?code=…
 * ή exp://192.168.1.5:8081/--/auth-callback#access_token=…). Δέχεται query και fragment.
 */
export function parseOAuthRedirect(url: string): OAuthRedirect {
  const params = new Map<string, string>();
  const read = (part: string) => {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      if (!params.has(k)) params.set(k, v);
    }
  };
  const hash = url.indexOf('#');
  const beforeHash = hash < 0 ? url : url.slice(0, hash);
  const q = beforeHash.indexOf('?');
  if (q >= 0) read(beforeHash.slice(q + 1));
  if (hash >= 0) read(url.slice(hash + 1));

  const error = params.get('error_description') || params.get('error');
  if (error) return { kind: 'error', message: error };
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return { kind: 'none' };
}
