/**
 * Push ειδοποιήσεις (Expo Push — δωρεάν).
 *  - Μετά τη σύνδεση: άδεια + token → αποθήκευση στη βάση (register_push_token)
 *  - Τις στέλνει η ίδια η βάση (triggers → Expo Push API), βλ. migration push_notifications
 *  - Πάτημα σε ειδοποίηση → ανοίγει η σχετική οθόνη (data.url)
 *
 * ⚠️ Χρειάζεται EAS project id (extra.eas.projectId στο app.json, μπαίνει με `eas init`) και
 *    development/production build — στο Expo Go οι push δεν λειτουργούν πλήρως.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { reportError } from './monitoring';
import { supabase, supabaseConfigured } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let currentToken: string | null = null;

/** Ζητά άδεια και καταχωρεί τη συσκευή. Επιστρέφει το token ή null (χωρίς άδεια / εξομοιωτής / χωρίς project id). */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!supabaseConfigured || !Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Έξοδοι & μηνύματα',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) throw error;
    currentToken = token;
    return token;
  } catch (e) {
    reportError(e, { where: 'registerForPush' });
    return null;
  }
}

/** Στην αποσύνδεση: η συσκευή δεν λαμβάνει πια ειδοποιήσεις αυτού του λογαριασμού */
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

/** Μόνο εσωτερικές διαδρομές της εφαρμογής (όχι εξωτερικά links από ειδοποιήσεις) */
const SAFE_ROUTE = /^\/(outing|chat)\/[A-Za-z0-9-]+$/;

function openFrom(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === 'string' && SAFE_ROUTE.test(url)) router.push(url as never);
}

/** Πάτημα σε ειδοποίηση → σχετική οθόνη (και όταν η εφαρμογή ήταν κλειστή) */
export function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    Notifications.getLastNotificationResponseAsync().then(openFrom).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, [enabled]);
}
