import {
  isPending,
  outingToParticipants,
  TRANSPORT_MODES,
  type CityId,
  type OutingParticipantRow,
  type ResolvedPlace,
  type ScoredVenue,
  type SuggestionsResponse,
  type TransportMode,
} from '@centimeet/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Body, Button, Card, Chip, H1, Label, Row, Screen, useTheme } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  ACTIVITY_EMOJI,
  declareOrigin,
  errorMessage,
  fetchLatestSuggestions,
  fetchOuting,
  fetchParticipants,
  outingConversationId,
  outingKeys,
  saveSuggestions,
  setRsvp,
  useOutingRealtime,
  type OutingRow,
} from '@/lib/outings';
import { supabase } from '@/lib/supabase';
import { useOuting } from '@/store/outing';

/**
 * Αποθηκευμένη έξοδος.
 *  - Καλεσμένος: δηλώνει αφετηρία & μέσο (ή «δεν μπορώ»).
 *  - Διοργανωτής: βλέπει ποιος έχει δηλώσει και τρέχει την εύρεση σημείου.
 *  - Όλοι: ζωντανή κατάσταση της παρέας, προτάσεις, συνομιλία.
 */
export default function OutingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;
  const qc = useQueryClient();
  const store = useOuting();
  const [finding, setFinding] = useState(false);
  const enabled = !!id && !!me;

  const outing = useQuery({ queryKey: outingKeys.outing(id ?? ''), enabled, queryFn: () => fetchOuting(id!) });
  const parts = useQuery({ queryKey: outingKeys.participants(id ?? ''), enabled, queryFn: () => fetchParticipants(id!) });
  const sugg = useQuery({ queryKey: outingKeys.suggestions(id ?? ''), enabled, queryFn: () => fetchLatestSuggestions(id!) });
  useOutingRealtime(id);

  if (!me) {
    return (
      <Screen style={{ padding: 20 }}>
        <Body muted>{t('friends.signInFirst')}</Body>
      </Screen>
    );
  }
  if (outing.isLoading || parts.isLoading) {
    return (
      <Screen style={{ justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (outing.isError || parts.isError || !outing.data || !parts.data) {
    return (
      <Screen style={{ padding: 20, gap: 12 }}>
        <Body muted>{outing.data === null ? t('outing.notFound') : t('common.error')}</Body>
        <Button
          title={t('common.retry')}
          onPress={() => {
            outing.refetch();
            parts.refetch();
          }}
        />
      </Screen>
    );
  }

  const o = outing.data;
  const rows = parts.data;
  const isOrganizer = o.organizer_id === me;
  const mine = rows.find((r) => r.user_id === me);
  const active = rows.filter((r) => r.rsvp !== 'declined');
  const declaredCount = active.filter((r) => r.declared).length;
  const title = o.title ?? `${ACTIVITY_EMOJI[o.activity]} ${t(`activity.${o.activity}`)} · ${t(`city.${o.city}`)}`;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: outingKeys.participants(o.id) });
    qc.invalidateQueries({ queryKey: outingKeys.mine });
  };

  /** Φορτώνει την έξοδο στο store ώστε να δουλέψουν οι υπάρχουσες οθόνες results / venue */
  function loadIntoStore(suggestions: SuggestionsResponse) {
    const { participants } = outingToParticipants(rows);
    store.loadSaved({
      outingId: o.id,
      city: o.city,
      activity: o.activity,
      departAt: futureOrUndefined(o.meet_at),
      people: participants.map((p) => ({ id: p.id, name: p.name, origin: p.origin, mode: p.mode })),
      suggestions,
    });
  }

  async function runFind() {
    const { participants } = outingToParticipants(rows);
    setFinding(true);
    try {
      const res = await api.suggestions({
        city: o.city,
        activity: o.activity,
        departAt: futureOrUndefined(o.meet_at),
        participants,
      });
      await saveSuggestions(o.id, res);
      qc.setQueryData(outingKeys.suggestions(o.id), res);
      qc.invalidateQueries({ queryKey: outingKeys.outing(o.id) });
      loadIntoStore(res);
      router.push('/outing/results');
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setFinding(false);
    }
  }

  function onFind() {
    const { participants, pending } = outingToParticipants(rows);
    if (participants.length < 2) {
      Alert.alert(t('outing.needTwo'));
      return;
    }
    if (pending.length) {
      Alert.alert('', t('outing.notAllDeclared', { names: pending.map((p) => p.name).join(', '), count: participants.length }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('outing.continue'), onPress: runFind },
      ]);
      return;
    }
    runFind();
  }

  async function openChat() {
    try {
      const conv = await outingConversationId(o.id);
      if (conv) router.push(`/chat/${conv}`);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    }
  }

  const suggestions = sugg.data;
  const top = suggestions ? [...suggestions.primary, ...suggestions.alternatives].slice(0, 3) : [];

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`activity.${o.activity}`) }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <H1>{title}</H1>
        {o.meet_at ? <Body muted>🕘 {formatWhen(o.meet_at)}</Body> : null}

        {mine && mine.rsvp !== 'declined' ? (
          <DeclareCard key={`${mine.id}:${mine.declared}`} row={mine} city={o.city} canDecline={!isOrganizer} outing={o} onChanged={refresh} />
        ) : null}
        {mine && mine.rsvp === 'declined' ? (
          <Card style={{ marginTop: 16 }}>
            <Body>{t('outing.declinedNote')}</Body>
            <View style={{ marginTop: 10 }}>
              <Button
                variant="secondary"
                title={t('outing.comingAfterAll')}
                onPress={() => setRsvp(o.id, 'going').then(refresh, (e) => Alert.alert(t('common.error'), errorMessage(e)))}
              />
            </View>
          </Card>
        ) : null}

        <Label>{`${t('outing.group')} · ${t('outing.progress', { declared: declaredCount, total: active.length })}`}</Label>
        {rows.map((r) => (
          <PersonStatus key={r.id} row={r} isMe={r.user_id === me} />
        ))}

        {isOrganizer ? (
          <View style={{ marginTop: 8 }}>
            <Button title={t('outing.find')} onPress={onFind} loading={finding} disabled={declaredCount < 2} />
          </View>
        ) : null}

        {top.length ? (
          <>
            <Label>{t('outing.suggestions')}</Label>
            {top.map((s) => (
              <SuggestionCard
                key={s.venue.id}
                s={s}
                onPress={
                  isOrganizer
                    ? () => {
                        loadIntoStore(suggestions!);
                        router.push(`/outing/venue/${encodeURIComponent(s.venue.id)}`);
                      }
                    : undefined
                }
              />
            ))}
            {isOrganizer ? (
              <Button
                variant="secondary"
                title={t('outing.allSuggestions')}
                onPress={() => {
                  loadIntoStore(suggestions!);
                  router.push('/outing/results');
                }}
              />
            ) : (
              <Body muted>{t('outing.organizerSeesDetails')}</Body>
            )}
          </>
        ) : null}

        <View style={{ marginTop: 20 }}>
          <Button variant="secondary" title={t('outing.chat')} onPress={openChat} />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Η δική μου δήλωση: αφετηρία + μέσο */
function DeclareCard({
  row,
  city,
  outing,
  canDecline,
  onChanged,
}: {
  row: OutingParticipantRow;
  city: CityId;
  outing: OutingRow;
  canDecline: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [editing, setEditing] = useState(!row.declared);
  const [saving, setSaving] = useState(false);
  const [place, setPlace] = useState<ResolvedPlace | undefined>(
    row.lat != null && row.lng != null
      ? { placeId: 'saved', name: row.origin_label ?? t('outing.yourOrigin'), location: { lat: row.lat, lng: row.lng } }
      : undefined,
  );
  const [mode, setMode] = useState<TransportMode | undefined>(row.mode ?? undefined);

  // Προεπιλογή μέσου από το προφίλ
  const profile = useQuery({
    queryKey: ['my-profile', session?.user.id],
    enabled: !!session && !row.mode,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('default_mode').eq('id', session!.user.id).single();
      if (error) throw error;
      return data as { default_mode: TransportMode };
    },
  });
  const effectiveMode = mode ?? profile.data?.default_mode;

  async function submit() {
    if (!place || !effectiveMode) return;
    setSaving(true);
    try {
      await declareOrigin(row.id, { lat: place.location.lat, lng: place.location.lng, label: place.name, mode: effectiveMode });
      setEditing(false);
      onChanged();
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function decline() {
    Alert.alert(t('outing.cantCome'), t('outing.cantComeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('outing.cantCome'),
        style: 'destructive',
        onPress: () => setRsvp(outing.id, 'declined').then(onChanged, (e) => Alert.alert(t('common.error'), errorMessage(e))),
      },
    ]);
  }

  if (!editing && row.declared) {
    return (
      <Card style={{ marginTop: 16 }}>
        <Body muted>{t('outing.yourOrigin')}</Body>
        <Body style={{ fontWeight: '600', marginTop: 4 }}>
          📍 {row.origin_label ?? '—'} · {row.mode ? t(`mode.${row.mode}`) : ''}
        </Body>
        <Row style={{ marginTop: 10 }}>
          <Chip label={t('place.change')} onPress={() => setEditing(true)} />
          {canDecline ? <Chip label={t('outing.cantCome')} onPress={decline} /> : null}
        </Row>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <Body style={{ fontWeight: '700', fontSize: 17, marginBottom: 8 }}>{t('outing.declareTitle')}</Body>
      <PlaceSearch city={city} value={place} onSelect={setPlace} />
      <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('wizard.how')}</Body>
      <Row>
        {TRANSPORT_MODES.map((m) => (
          <Chip key={m} label={t(`mode.${m}`)} selected={effectiveMode === m} onPress={() => setMode(m)} />
        ))}
      </Row>
      <View style={{ marginTop: 12, gap: 8 }}>
        <Button title={t('outing.declare')} onPress={submit} loading={saving} disabled={!place || !effectiveMode} />
        {row.declared ? <Button variant="secondary" title={t('common.cancel')} onPress={() => setEditing(false)} /> : null}
        {canDecline && !row.declared ? <Button variant="secondary" title={t('outing.cantCome')} onPress={decline} /> : null}
      </View>
    </Card>
  );
}

function PersonStatus({ row, isMe }: { row: OutingParticipantRow; isMe: boolean }) {
  const { t } = useTranslation();
  const c = useTheme();
  const tags = [row.is_organizer ? t('outing.organizer') : null, isMe ? t('outing.you') : null, row.user_id ? null : t('outing.guest')]
    .filter(Boolean)
    .join(' · ');
  const status =
    row.rsvp === 'declined'
      ? { text: t('outing.declined'), color: c.muted }
      : isPending(row)
        ? { text: t('outing.pending'), color: c.muted }
        : { text: t('outing.declared', { mode: row.mode ? t(`mode.${row.mode}`) : '' }), color: c.good };
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <View style={{ flexShrink: 1 }}>
          <Body style={{ fontWeight: '600' }}>{row.name}</Body>
          {tags ? <Body muted style={{ fontSize: 13 }}>{tags}</Body> : null}
        </View>
        <Body style={{ color: status.color, fontWeight: '600' }}>{status.text}</Body>
      </Row>
    </Card>
  );
}

function SuggestionCard({ s, onPress }: { s: ScoredVenue; onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card onPress={onPress}>
      <Body style={{ fontWeight: '700' }}>{s.venue.name}</Body>
      <Body muted style={{ marginTop: 4 }}>⏱ {t('results.range', { min: s.minMin, max: s.maxMin })}</Body>
    </Card>
  );
}

/** Στέλνουμε ώρα στο API μόνο αν είναι στο μέλλον (για εκτίμηση κίνησης) */
function futureOrUndefined(iso: string | null) {
  return iso && new Date(iso).getTime() > Date.now() ? iso : undefined;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('el-GR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
