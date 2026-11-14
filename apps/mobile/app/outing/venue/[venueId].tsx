import type { ParticipantPlan, VenuePlanResponse } from '@centimeet/shared';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Body, Button, Card, Chip, H1, Label, Row, Screen, useTheme } from '@/components/ui';
import { api } from '@/lib/api';
import { shareVia } from '@/lib/share';
import { toParticipants, useOuting } from '@/store/outing';

const STEP_ICON = { walk: '🚶', bus: '🚌', metro: '🚇', tram: '🚊', train: '🚆', trolley: '🚎', other: '🚐' } as const;

/**
 * Το μαγαζί που επέλεξε η παρέα: ονόματα όλων, και με πάτημα σε όνομα
 * → χρόνος, μέσα, parking, κόστος + κοινοποίηση.
 */
export default function VenueScreen() {
  const { venueId } = useLocalSearchParams<{ venueId: string }>();
  const { t } = useTranslation();
  const o = useOuting();
  const [openId, setOpenId] = useState<string | null>(null);
  const whenLabel = o.departAt ? new Date(o.departAt).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : undefined;

  const participants = toParticipants(o.people);
  const q = useQuery({
    queryKey: ['venue-plan', venueId, o.departAt, participants],
    enabled: !!participants && !!venueId,
    queryFn: () => api.venuePlan({ city: o.city, departAt: o.departAt, venueId: venueId!, participants: participants! }),
  });

  if (q.isLoading || !q.data) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        {q.isError ? <Button title={t('common.retry')} onPress={() => q.refetch()} /> : <ActivityIndicator />}
      </Screen>
    );
  }
  const data: VenuePlanResponse = q.data;

  return (
    <Screen>
      <Stack.Screen options={{ title: data.venue.name }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <H1>{data.venue.name}</H1>
        {data.venue.address ? <Body muted>{data.venue.address}</Body> : null}

        <Label>{t('venue.whoTakesWhat')}</Label>
        {data.plans.map((p) => (
          <PersonRow
            key={p.participantId}
            plan={p}
            open={openId === p.participantId}
            onToggle={() => setOpenId(openId === p.participantId ? null : p.participantId)}
            onShare={(ch) => shareVia(ch, data.venue, p, whenLabel)}
          />
        ))}

        <Label>{t('venue.sendAll')}</Label>
        <Button
          title={t('venue.sendAll')}
          onPress={async () => {
            // Ένα-ένα: το share sheet του κινητού για κάθε άτομο με το προσωπικό του μήνυμα
            for (const p of data.plans) await shareVia('system', data.venue, p, whenLabel);
          }}
        />
      </ScrollView>
    </Screen>
  );
}

function PersonRow({
  plan,
  open,
  onToggle,
  onShare,
}: {
  plan: ParticipantPlan;
  open: boolean;
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

          {plan.transitSteps?.length ? (
            <>
              <Body style={{ fontWeight: '600', marginTop: 8 }}>{t('venue.route')}</Body>
              {plan.transitSteps.map((s, i) => (
                <Body key={i}>
                  {STEP_ICON[s.kind]} {s.line ? `${s.line} ` : ''}
                  {s.from && s.to ? `${s.from} → ${s.to} ` : ''}({s.durationMin}′)
                </Body>
              ))}
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
            <Body muted>{t('venue.sendTo', { name: plan.name })}</Body>
            <Row>
              <Chip label="Viber" onPress={() => onShare('viber')} />
              <Chip label="WhatsApp" onPress={() => onShare('whatsapp')} />
              <Chip label="Messenger" onPress={() => onShare('messenger')} />
              <Chip label="SMS" onPress={() => onShare('sms')} />
              <Chip label="Email" onPress={() => onShare('email')} />
              <Chip label="…" onPress={() => onShare('system')} />
            </Row>
          </View>
        </View>
      ) : (
        <Body muted style={{ marginTop: 4, color: c.muted }}>
          {plan.costEur.toFixed(2)}€{plan.parking?.length ? ' · 🅿️' : ''}
        </Body>
      )}
    </Card>
  );
}
