/**
 * Καταγραφή σφαλμάτων (Sentry, δωρεάν πλάνο). Ενεργό μόνο αν υπάρχει EXPO_PUBLIC_SENTRY_DSN
 * και όχι στην ανάπτυξη — χωρίς DSN δεν στέλνεται τίποτα πουθενά.
 */
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export const monitoringEnabled = Boolean(dsn) && !__DEV__;

export function initMonitoring() {
  if (!monitoringEnabled) return;
  Sentry.init({
    dsn,
    // Μόνο σφάλματα, χωρίς παρακολούθηση απόδοσης/οθονών (λιγότερα δεδομένα, μένει δωρεάν)
    tracesSampleRate: 0,
    sendDefaultPii: false,
    // Δεν στέλνουμε συντεταγμένες/διευθύνσεις: κόβουμε τα σώματα αιτημάτων
    beforeBreadcrumb: (b) => (b.category === 'fetch' || b.category === 'xhr' ? { ...b, data: { url: b.data?.url, status_code: b.data?.status_code } } : b),
  });
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) console.warn(error, context);
  if (monitoringEnabled) Sentry.captureException(error, context ? { extra: context } : undefined);
}

export const wrapRoot = <P extends Record<string, unknown>>(C: React.ComponentType<P>) => (monitoringEnabled ? Sentry.wrap(C) : C);
