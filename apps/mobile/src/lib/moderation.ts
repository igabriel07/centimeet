/**
 * Αναφορά & αποκλεισμός χρηστών — απαιτείται από το App Store για εφαρμογές με περιεχόμενο χρηστών
 * (μηνύματα). Οι αναφορές καταλήγουν στον πίνακα `reports` (Supabase → Table editor) για έλεγχο.
 */
import { Alert } from 'react-native';
import i18n from '@/i18n';
import { supabase } from './supabase';

const t = (k: string, o?: Record<string, string>): string => (o ? i18n.t(k, o) : i18n.t(k));

export async function reportUser(reportedId: string, reason: string, messageId?: string) {
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me) return;
  const { error } = await supabase.from('reports').insert({ reporter_id: me, reported_id: reportedId, reason, message_id: messageId ?? null });
  if (error) throw error;
}

/** Αποκλεισμός: δεν μπορεί να σου στείλει μήνυμα, δεν σε βρίσκει στην αναζήτηση, και σβήνει η φιλία */
export async function blockUser(blockedId: string) {
  const { data } = await supabase.auth.getUser();
  const me = data.user?.id;
  if (!me) return;
  const { error } = await supabase.from('blocks').insert({ blocker_id: me, blocked_id: blockedId });
  if (error && error.code !== '23505') throw error; // ήδη αποκλεισμένος = ΟΚ
  await supabase.from('friendships').delete().or(
    `and(requester_id.eq.${me},addressee_id.eq.${blockedId}),and(requester_id.eq.${blockedId},addressee_id.eq.${me})`,
  );
}

/** Μενού «Αναφορά / Αποκλεισμός» για έναν χρήστη (και προαιρετικά για συγκεκριμένο μήνυμα) */
export function openModerationMenu(user: { id: string; name: string }, opts: { messageId?: string; onBlocked?: () => void } = {}) {
  const done = (msg: string) => Alert.alert(msg);
  const fail = (e: unknown) => Alert.alert(t('common.error'), e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

  const report = () =>
    Alert.alert(t('moderation.reportTitle', { name: user.name }), t('moderation.reportWhy'), [
      ...(['harassment', 'spam', 'inappropriate'] as const).map((r) => ({
        text: t(`moderation.reason.${r}`),
        onPress: () => reportUser(user.id, t(`moderation.reason.${r}`), opts.messageId).then(() => done(t('moderation.reported')), fail),
      })),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);

  const block = () =>
    Alert.alert(t('moderation.blockTitle', { name: user.name }), t('moderation.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.block'),
        style: 'destructive',
        onPress: () =>
          blockUser(user.id).then(() => {
            done(t('moderation.blocked', { name: user.name }));
            opts.onBlocked?.();
          }, fail),
      },
    ]);

  Alert.alert(user.name, undefined, [
    { text: t('moderation.report'), onPress: report },
    { text: t('moderation.block'), style: 'destructive', onPress: block },
    { text: t('common.cancel'), style: 'cancel' },
  ]);
}
