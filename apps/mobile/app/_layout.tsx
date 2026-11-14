import '@/i18n';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useTheme } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { initMonitoring, reportError, wrapRoot } from '@/lib/monitoring';
import { registerForPush, useNotificationRouting } from '@/lib/push';
import { fonts } from '@/theme';

initMonitoring();
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { onError: (e) => reportError(e, { where: 'mutation' }) },
  },
});

/** Μετά τη σύνδεση: push token + άνοιγμα οθόνης από ειδοποίηση */
function PushSetup() {
  const { session } = useAuth();
  useEffect(() => {
    if (session) registerForPush();
  }, [session]);
  useNotificationRouting(!!session);
  return null;
}

function RootStack() {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: fonts.semibold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="outing/new" options={{ title: t('wizard.newOuting') }} />
      <Stack.Screen name="outing/[id]" options={{ title: '' }} />
      <Stack.Screen name="outing/results" options={{ title: t('results.title') }} />
      <Stack.Screen name="outing/venue/[venueId]" options={{ title: '' }} />
      <Stack.Screen name="chat/[conversationId]" options={{ title: t('messages.title') }} />
      <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
    </Stack>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const ready = fontsLoaded || !!fontError; // αν αποτύχει η γραμματοσειρά, συνεχίζουμε με του συστήματος

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="auto" />
            <PushSetup />
            <RootStack />
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default wrapRoot(RootLayout);
