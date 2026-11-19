import { buildPersonalMessage, channelUrl, type ParticipantPlan, type ShareChannel, type Venue } from '@centimeet/shared';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { Alert, Platform, Share } from 'react-native';

/** Άνοιγμα συγκεκριμένης εφαρμογής· αν δεν υπάρχει, πέφτουμε στο share sheet του κινητού */
export async function shareVia(channel: ShareChannel | 'system', venue: Venue, plan: ParticipantPlan, whenLabel?: string) {
  const text = buildPersonalMessage({ venue, plan, whenLabel });
  if (channel === 'system') {
    await Share.share({ message: text });
    return;
  }
  const url = channelUrl(channel, text, { link: plan.navigationUrl });
  try {
    const ok = await Linking.canOpenURL(url);
    if (!ok) throw new Error('not installed');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Η εφαρμογή δεν βρέθηκε', 'Ανοίγω τις υπόλοιπες επιλογές κοινοποίησης.');
    await Share.share({ message: text });
  }
}

/** Link λήψης της εφαρμογής για προσκλήσεις (π.χ. σελίδα με App Store / Google Play). Κενό = χωρίς link. */
export const APP_INVITE_URL = process.env.EXPO_PUBLIC_INVITE_URL?.trim() || '';

/**
 * «Πρόσκληση στην εφαρμογή»: share sheet του κινητού (WhatsApp, Viber, SMS…).
 * Σε browser χωρίς Web Share → αντιγραφή στο πρόχειρο. Επιστρέφει τι έγινε.
 */
export async function inviteToApp(message: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const canWebShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  if (canWebShare) {
    try {
      const r = await Share.share({ message });
      return r.action === Share.dismissedAction ? 'cancelled' : 'shared';
    } catch {
      if (Platform.OS !== 'web') return 'cancelled';
    }
  }
  await Clipboard.setStringAsync(message);
  return 'copied';
}
