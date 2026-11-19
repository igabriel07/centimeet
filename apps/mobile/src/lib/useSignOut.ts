import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuth } from './auth';
import { unregisterPush } from './push';
import { supabase } from './supabase';

/** Αποσύνδεση: αφαιρεί τη συσκευή από τις ειδοποιήσεις, καθαρίζει cache και γυρίζει στη Σύνδεση. */
export function useSignOut() {
  const { setGuest } = useAuth();
  const qc = useQueryClient();
  return async () => {
    await unregisterPush().catch(() => {});
    setGuest(false);
    await supabase.auth.signOut().catch(() => {});
    qc.clear();
    router.replace('/(auth)/sign-in');
  };
}
