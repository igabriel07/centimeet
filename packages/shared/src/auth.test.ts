import { describe, expect, it } from 'vitest';
import {
  authErrorKey,
  codeError,
  emailError,
  isExistingUserSignUp,
  isValid,
  newPasswordError,
  normalizeEmail,
  parseOAuthRedirect,
  passwordStrength,
  PASSWORD_MIN_LENGTH,
  validateNewPassword,
  validateSignIn,
  validateSignUp,
} from './auth';

const GOOD = 'kafes-sto-kentro-42';

describe('email', () => {
  it('δέχεται κανονικά email και κόβει κενά', () => {
    expect(emailError('maria@example.com')).toBeUndefined();
    expect(emailError('  maria.p+cm@mail.co.uk ')).toBeUndefined();
  });
  it('απορρίπτει κενό και άκυρο', () => {
    expect(emailError('')).toBe('errEmailRequired');
    expect(emailError('   ')).toBe('errEmailRequired');
    for (const bad of ['maria', 'maria@', '@x.gr', 'maria@x', 'ma ria@x.gr', 'maria@x.g']) {
      expect(emailError(bad), bad).toBe('errEmailInvalid');
    }
  });
  it('normalizeEmail: πεζά χωρίς κενά', () => {
    expect(normalizeEmail('  Maria@Example.COM ')).toBe('maria@example.com');
  });
});

describe('κωδικός πρόσβασης', () => {
  it(`θέλει τουλάχιστον ${PASSWORD_MIN_LENGTH} χαρακτήρες`, () => {
    expect(newPasswordError('')).toBe('errPasswordRequired');
    expect(newPasswordError('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('errPasswordShort');
    expect(newPasswordError('a'.repeat(PASSWORD_MIN_LENGTH))).toBeUndefined();
  });
  it('μετρά χαρακτήρες, όχι bytes, για το ελάχιστο (ελληνικά)', () => {
    expect(newPasswordError('καλημέρααααα')).toBeUndefined(); // 12 χαρακτήρες, 24 bytes
  });
  it('όριο 72 bytes (bcrypt)', () => {
    expect(newPasswordError('a'.repeat(72))).toBeUndefined();
    expect(newPasswordError('a'.repeat(73))).toBe('errPasswordLong');
    expect(newPasswordError('α'.repeat(37))).toBe('errPasswordLong'); // 74 bytes
  });
  it('δύναμη: σύντομος ≤1, μακρύς και ποικίλος 4', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('Ab1!')).toBeLessThanOrEqual(1);
    expect(passwordStrength('aaaaaaaaaaaa')).toBe(1);
    expect(passwordStrength('Kafes-Kentro-2026')).toBe(4);
  });
});

describe('κωδικός από email', () => {
  it('ακριβώς 6 ψηφία', () => {
    expect(codeError('123456')).toBeUndefined();
    expect(codeError(' 123456 ')).toBeUndefined();
    expect(codeError('12345')).toBe('errCodeInvalid');
    expect(codeError('1234567')).toBe('errCodeInvalid');
    expect(codeError('12a456')).toBe('errCodeInvalid');
  });
});

describe('φόρμα σύνδεσης', () => {
  it('έγκυρη', () => {
    expect(isValid(validateSignIn({ email: 'a@b.gr', password: 'x' }))).toBe(true);
  });
  it('δεν εφαρμόζει κανόνες μήκους στη σύνδεση', () => {
    expect(validateSignIn({ email: 'a@b.gr', password: 'short' })).toEqual({});
  });
  it('λάθη ανά πεδίο', () => {
    expect(validateSignIn({ email: '', password: '' })).toEqual({ email: 'errEmailRequired', password: 'errPasswordRequired' });
  });
});

describe('φόρμα εγγραφής', () => {
  const ok = { name: 'Μαρία', email: 'maria@example.com', password: GOOD, confirm: GOOD };
  it('έγκυρη', () => {
    expect(validateSignUp(ok)).toEqual({});
  });
  it('όνομα υποχρεωτικό και ≤60', () => {
    expect(validateSignUp({ ...ok, name: '  ' }).name).toBe('errNameRequired');
    expect(validateSignUp({ ...ok, name: 'Α'.repeat(61) }).name).toBe('errNameLong');
  });
  it('οι κωδικοί πρέπει να ταιριάζουν', () => {
    expect(validateSignUp({ ...ok, confirm: GOOD + 'x' })).toEqual({ confirm: 'errPasswordMismatch' });
  });
  it('δεν δείχνει «δεν ταιριάζουν» όταν ο κωδικός είναι ήδη άκυρος', () => {
    expect(validateSignUp({ ...ok, password: 'short', confirm: 'other' })).toEqual({ password: 'errPasswordShort' });
  });
  it('νέος κωδικός (επαναφορά)', () => {
    expect(validateNewPassword({ password: GOOD, confirm: GOOD })).toEqual({});
    expect(validateNewPassword({ password: GOOD, confirm: '' })).toEqual({ confirm: 'errPasswordMismatch' });
  });
});

describe('σφάλματα Supabase → φιλικά μηνύματα', () => {
  it('με βάση τον code', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('errInvalidCredentials');
    expect(authErrorKey({ code: 'email_not_confirmed' })).toBe('errEmailNotConfirmed');
    expect(authErrorKey({ code: 'user_already_exists' })).toBe('errUserExists');
    expect(authErrorKey({ code: 'weak_password' })).toBe('errWeakPassword');
    expect(authErrorKey({ code: 'over_email_send_rate_limit' })).toBe('errRateLimit');
    expect(authErrorKey({ code: 'otp_expired' })).toBe('errInvalidCode');
    expect(authErrorKey({ code: 'same_password' })).toBe('errSamePassword');
  });
  it('χωρίς code: από το μήνυμα', () => {
    expect(authErrorKey({ message: 'Invalid login credentials' })).toBe('errInvalidCredentials');
    expect(authErrorKey({ message: 'Email not confirmed' })).toBe('errEmailNotConfirmed');
    expect(authErrorKey({ message: 'Unsupported provider: provider is not enabled' })).toBe('errProviderDisabled');
    expect(authErrorKey({ message: 'For security purposes, you can only request this after 42 seconds.' })).toBe('errRateLimit');
    expect(authErrorKey({ message: 'Token has expired or is invalid' })).toBe('errInvalidCode');
    expect(authErrorKey({ message: 'TypeError: Failed to fetch' })).toBe('errOffline');
    expect(authErrorKey({ message: 'whatever', status: 429 })).toBe('errRateLimit');
  });
  it('άγνωστο', () => {
    expect(authErrorKey({ message: 'Something odd' })).toBe('errUnknown');
    expect(authErrorKey(null)).toBe('errUnknown');
  });
  it('signUp σε υπάρχον email (χωρίς identities) αναγνωρίζεται', () => {
    expect(isExistingUserSignUp({ identities: [] })).toBe(true);
    expect(isExistingUserSignUp({ identities: [{ provider: 'email' }] })).toBe(false);
    expect(isExistingUserSignUp(null)).toBe(false);
    expect(isExistingUserSignUp({})).toBe(false);
  });
});

describe('επιστροφή από Google (OAuth redirect)', () => {
  it('PKCE code στο query', () => {
    expect(parseOAuthRedirect('centimeet://auth-callback?code=abc-123')).toEqual({ kind: 'code', code: 'abc-123' });
    expect(parseOAuthRedirect('exp://192.168.1.86:8081/--/auth-callback?code=x%2Fy')).toEqual({ kind: 'code', code: 'x/y' });
  });
  it('tokens στο fragment (implicit)', () => {
    expect(parseOAuthRedirect('centimeet://auth-callback#access_token=AT&refresh_token=RT&expires_in=3600')).toEqual({
      kind: 'tokens',
      accessToken: 'AT',
      refreshToken: 'RT',
    });
  });
  it('σφάλμα (π.χ. ακύρωση ή απενεργοποιημένος provider)', () => {
    expect(parseOAuthRedirect('centimeet://auth-callback?error=access_denied&error_description=User+denied+access')).toEqual({
      kind: 'error',
      message: 'User denied access',
    });
    expect(parseOAuthRedirect('http://localhost:8081/auth-callback#error=server_error')).toEqual({ kind: 'error', message: 'server_error' });
  });
  it('σφάλμα υπερισχύει του code', () => {
    expect(parseOAuthRedirect('centimeet://cb?code=a&error=bad').kind).toBe('error');
  });
  it('τίποτα', () => {
    expect(parseOAuthRedirect('centimeet://auth-callback')).toEqual({ kind: 'none' });
    expect(parseOAuthRedirect('centimeet://auth-callback#access_token=only')).toEqual({ kind: 'none' });
  });
});
