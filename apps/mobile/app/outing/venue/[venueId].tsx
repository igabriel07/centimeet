import type { ParticipantPlan, VenuePlanResponse } from '@centimeet/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, H1, Label, Row, Screen, useTheme } from '@/components/ui';
import { TransitChain } from '@/components/VenueTrip';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { decideVenue, errorMessage, fetchParticipants, outingKeys } from '@/lib/outings';
import { shareVia } from '@/lib/share';
import { toParticipants, useOuting } from '@/store/outing';

/**
 * Το μαγαζί που επέλεξε η παρέα: ονόματα όλων, και με πάτημα σε όνομα
 * → χρόνος, μέσα, parking, κόστος.
 * Αποθηκευμένη έξοδος: «📨 Στείλε στην παρέα» → οι φίλοι το βλέπουν ΜΕΣΑ στην εφαρμογή (push + η διαδρομή τους).
 * Viber / WhatsApp / Email … μένουν μόνο για όσους δεν έχουν την εφαρμογή.
 */
export default function VenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { t } = useTranslation();
  const o = useOuting();
  const qc = useQueryClient();
  const { session } = useAuth();
  const me = session?.user.id;
  const [openId, setOpenId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const whenLabel = o.departAt ? new Date(o.departAt).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : undefined;
  const outingId = o.savedOutingId;

  const participants = toParticipants(o.people);
  const q = useQuery({
    queryKey: ['venue-plan', venueId, o.departAt, participants],
    enabled: !!participants && !!venueId,
    queryFn: () => api.venuePlan({ city: o.city, departAt: o.departAt, venueId: venueId!, participants: participants! }),
  });
  // Ποιοι από την έξοδο έχουν λογαριασμό (το βλέπουν στην εφαρμογή) — και αν είμαι ο διοργανωτής
  const members = useQuery({
    queryKey: outingKeys.participants(outingId ?? ''),
    enabled: !!outingId,
    queryFn: () => fetchParticipants(outingId!),
  });
  const userOf = (participantId: string) => members.data?.find((r) => r.id === participantId)?.user_id ?? null;
  const isOrganizer = !!members.data?.find((r) => r.is_organizer && r.user_id === me);
  const inApp = (participantId: string) => !!outingId && !!userOf(participantId);

  if (q.isLoading || !q.data) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        {q.isError ? <Button title={t('common.retry')} onPress={() => q.refetch()} /> : <ActivityIndicator />}
      </Screen>
    );
  }
  const data: VenuePlanResponse = q.data;
  const guests = data.plans.filter((p) => !inApp(p.participantId));

  async function sendToGroup() {
    if (!outingId) return;
    setSending(true);
    try {
      await decideVenue(outingId, data.venue, data.plans);
      setSent(true);
      qc.invalidateQueries({ queryKey: outingKeys.outing(outingId) });
      qc.invalidateQueries({ queryKey: outingKeys.participants(outingId) });
      qc.invalidateQueries({ queryKey: outingKeys.mine });
      router.dismissTo(`/outing/${outingId}`);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: data.venue.name }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <H1>{data.venue.name}</H1>
        {data.venue.address ? <Body muted>{data.venue.address}</Body> : null}

        {/* 📨 Αποθηκευμένη έξοδος + διοργανωτής: αποστολή μέσα στην εφαρμογή */}
        {outingId && isOrganizer ? (
          <Card style={{ marginTop: 16 }}>
            <Button title={sent ? t('decide.sent') : t('decide.sendToGroup')} onPress={sendToGroup} loading={sending} disabled={sent} />
            <Body muted style={{ marginTop: 8, fontSize: 13 }}>
              {t('decide.sendToGroupHint')}
            </Body>
          </Card>
        ) : null}

        <Label>{t('venue.whoTakesWhat')}</Label>
        {data.plans.map((p) => (
          <PersonRow
            key={p.participantId}
            plan={p}
            open={openId === p.participantId}
            inApp={inApp(p.participantId)}
            onToggle={() => setOpenId(openId === p.participantId ? null : p.participantId)}
            onShare={(ch) => shareVia(ch, data.venue, p, whenLabel)}
          />
        ))}

        {/* Κοινοποίηση εκτός εφαρμογής: μόνο για όσους δεν έχουν λογαριασμό (ή χωρίς αποθηκευμένη έξοδο) */}
        {guests.length ? (
          <>
            <Label>{outingId ? t('decide.guestsShare') : t('venue.sendAll')}</Label>
            <Button
              variant={outingId ? 'secondary' : undefined}
              title={t('venue.sendAll')}
              onPress={async () => {
                // Ένα-ένα: το share sheet του κινητού για κάθε άτομο με το προσωπικό του μήνυμα
                for (const p of guests) await shareVia('system', data.venue, p, whenLabel);
              }}
            />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PersonRow({
  plan,
  open,
  inApp,
  onToggle,
  onShare,
}: {
  plan: ParticipantPlan;
  open: boolean;
  /** Έχει την εφαρμογή: το βλέπει εκεί, χωρίς Viber/Email */
  inApp: boolean;
  onToggle: () => void;
  onShare: (ch: 'viber' | 'whatsapp' | 'messenger' | 'sms' | 'email' | 'system') => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    <Card onPress={onToggle}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Body style={{ fontWeight: '700', fontSize: 17 }}>{plan.name}</Body>
        <Body style={{ fontWeight: '700' }}>
          {t(`mode.${plan.mode}`)} · {t('venue.duration', { min: plan.durationMin })}
        </Body>
      </Row>

      {open ? (
        <View style={{ marginTop: 12, gap: 6 }}>
          <Body>
            💶 {t('venue.cost')}: {plan.costEur.toFixed(2)}€ <Body muted>({plan.costNote})</Body>
          </Body>
          <Body muted>{plan.distanceKm} km</Body>
          {plan.tollEur ? <Body muted>🛣️ {t('venue.tolls', { eur: plan.tollEur.toFixed(2) })}</Body> : null}
          {plan.parkingSearchMin ? <Body muted>🅿️ {t('venue.parkingSearch', { min: plan.parkingSearchMin })}</Body> : null}

          {plan.transitSteps?.length ? (
            <>
              <Body style={{ fontWeight: '600', marginTop: 8 }}>{t('venue.route')}</Body>
              <TransitChain steps={plan.transitSteps} />
            </>
          ) : null}

          {plan.parking?.length ? (
            <>
              <Body style={{ fontWeight: '600', marginTop: 8 }}>🅿️ {t('venue.parking')}</Body>
              {plan.parking.map((pk) => (
                <Body key={pk.id}>
                  • {pk.name} — {t('venue.walk', { min: pk.walkMin })}
                </Body>
              ))}
            </>
          ) : null}

          <View style={{ marginTop: 10, gap: 8 }}>
            <Button variant="secondary" title={`🧭 ${t('venue.navigate')}`} onPress={() => Linking.openURL(plan.navigationUrl)} />
            {inApp ? (
              <Body style={{ color: c.good, fontWeight: '600' }}>{t('decide.inApp')}</Body>
            ) : (
              <>
                <Body muted>{t('venue.sendTo', { name: plan.name })}</Body>
                <Row>
                  <Chip label="Viber" onPress={() => onShare('viber')} />
                  <Chip label="WhatsApp" onPress={() => onShare('whatsapp')} />
                  <Chip label="Messenger" onPress={() => onShare('messenger')} />
                  <Chip label="SMS" onPress={() => onShare('sms')} />
                  <Chip label="Email" onPress={() => onShare('email')} />
                  <Chip label="…" onPress={() => onShare('system')} />
                </Row>
              </>
            )}
          </View>
        </View>
      ) : (
        <Body muted style={{ marginTop: 4, color: c.muted }}>
          {plan.costEur.toFixed(2)}€{plan.parking?.length ? ' · 🅿️' : ''}
          {inApp ? ' · 📱' : ''}
        </Body>
      )}
    </Card>
  );
}
