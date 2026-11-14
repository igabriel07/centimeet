import { buildPersonalMessage, channelUrl, type ParticipantPlan, type ShareChannel, type Venue } from '@centimeet/shared';
import * as Linking from 'expo-linking';
import { Alert, Share } from 'react-native';

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
