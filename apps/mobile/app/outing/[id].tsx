import {
  CITY_CONFIG,
  inServiceArea,
  isPending,
  outingToParticipants,
  TRANSPORT_MODES,
  type CityId,
  type OutingParticipantRow,
  type PlacePreference,
  type ResolvedPlace,
  type ScoredVenue,
  type SuggestionsResponse,
  type TransportMode,
} from '@centimeet/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { durationLine } from '@/lib/duration';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { ChosenVenue } from '@/components/FixedPlacePicker';
import { DecidedVenue } from '@/components/VenueTrip';
import { InviteResponseSheet } from '@/components/InviteResponse';
import { RespondTimer } from '@/components/RespondTimer';
import { OutOfAreaNote, outsideArea, PlaceSearch } from '@/components/PlaceSearch';
import { PREFERENCE_EMOJI, PreferencePicker } from '@/components/PreferencePicker';
import { Body, Button, Card, Chip, H1, Label, Row, Screen, useTheme } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  activityTitle,
  meetText,
  declareOrigin,
  errorMessage,
  fetchLatestSuggestions,
  fetchMyOutings,
  fetchOuting,
  fetchParticipants,
  fetchSavedOutings,
  outingConversationId,
  outingKeys,
  saveSuggestions,
  setPlacePreference,
  setOutingSaved,
  setRsvp,
  skipUnanswered,
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
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const me = session?.user.id;
  const qc = useQueryClient();
  const c = useTheme();
  const store = useOuting();
  const [finding, setFinding] = useState(false);
  /** Pop-up απάντησης σε πρόσκληση: null = αυτόματα (αν δεν έχω απαντήσει), true/false = ρητά */
  const [inviteOpen, setInviteOpen] = useState<boolean | null>(null);
  const enabled = !!id && !!me;

  const outing = useQuery({
    queryKey: outingKeys.outing(id ?? ''),
    enabled,
    queryFn: () => fetchOuting(id!),
    // Έληξε το χρονόμετρο → ελέγχουμε ανά 15″ μέχρι να φανεί η ακύρωση (ο cron τρέχει κάθε λεπτό)
    refetchInterval: (q) => {
      const d = q.state.data;
      return d?.respond_by && d.status !== 'cancelled' && new Date(d.respond_by).getTime() < Date.now() ? 15_000 : false;
    },
  });
  const parts = useQuery({ queryKey: outingKeys.participants(id ?? ''), enabled, queryFn: () => fetchParticipants(id!) });
  // Πλήθος όσων δεν απάντησαν από τη βάση (με κρυφή λίστα ο καλεσμένος δεν βλέπει όλες τις γραμμές)
  const myList = useQuery({ queryKey: outingKeys.mine, enabled, queryFn: fetchMyOutings });
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
  const title = o.title ?? `${activityTitle(t, o.activity, o.category)} · ${t(`city.${o.city}`)}`;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: outingKeys.participants(o.id) });
    qc.invalidateQueries({ queryKey: outingKeys.mine });
  };
  // Καλεσμένος που δεν έχει απαντήσει → το pop-up ανοίγει μόνο του (π.χ. από το push)
  const cancelled = o.status === 'cancelled';
  const visibleUnanswered = rows.filter((r) => r.rsvp === 'invited').length;
  // «Διαλέγω εγώ το μέρος»: χωρίς αφετηρίες/αναζήτηση — μόνο ποιος έρχεται
  // Χωρίς αφετηρίες: «Διαλέγω εγώ το μέρος» ή «Χωρίς μέρος» — μόνο ποιος έρχεται
  const fixed = o.place_mode === 'fixed' || o.place_mode === 'none';
  const goingCount = rows.filter((r) => r.rsvp === 'going').length;
  // Κρυφή λίστα: ο καλεσμένος βλέπει μόνο τον διοργανωτή και τον εαυτό του (το φιλτράρει η βάση)
  const hidden = !!o.hide_participants;
  const hiddenForMe = hidden && !isOrganizer;
  const unanswered = hiddenForMe ? (myList.data?.find((x) => x.id === o.id)?.unanswered_count ?? visibleUnanswered) : visibleUnanswered;
  const showInvite = !cancelled && !!mine && !isOrganizer && (inviteOpen ?? mine.rsvp === 'invited');
  const organizerName = rows.find((r) => r.is_organizer)?.name ?? '';
  /** Η έξοδος δέχεται ακόμα απαντήσεις/δηλώσεις */
  const open = o.status === 'collecting' || o.status === 'suggesting';
  /** 📍 Ο διοργανωτής διάλεξε μαγαζί (από τις προτάσεις) */
  const decided = o.status === 'decided';
  // Δίκαιο σημείο: χρειάζεται ο διοργανωτής + τουλάχιστον ένας ακόμα με αφετηρία
  const findable = outingToParticipants(rows);
  const organizerDeclared = !!rows.find((r) => r.is_organizer)?.declared;
  const canFind = organizerDeclared && findable.participants.length >= 2;
  /** «Δήλωσαν όλοι»: κανείς δεν εκκρεμεί (απάντηση ή αφετηρία) */
  const ready = canFind && open && unanswered === 0 && findable.pending.length === 0 && o.status === 'collecting';
  const findHint = !organizerDeclared ? t('skip.needOrganizer') : findable.participants.length < 2 ? t('skip.needOneMore') : null;

  /** Φορτώνει την έξοδο στο store ώστε να δουλέψουν οι υπάρχουσες οθόνες results / venue */
  function loadIntoStore(suggestions: SuggestionsResponse) {
    const { participants } = outingToParticipants(rows);
    store.loadSaved({
      outingId: o.id,
      city: o.city,
      activity: o.activity,
      category: o.category ?? undefined,
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
        category: o.category ?? undefined,
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
    const outside = participants.filter((p) => !inServiceArea(o.city, p.origin));
    if (outside.length) {
      Alert.alert(t('place.outsideTitle'), t('place.outsideList', { names: outside.map((p) => p.name).join(', '), region: CITY_CONFIG[o.city].region.label }));
      return;
    }
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
      <Stack.Screen
        options={{
          title: o.category ? t(`category.${o.category}`) : t(`activity.${o.activity}`),
          headerRight: () => <OutingSaveButton outingId={o.id} />,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <H1>{title}</H1>
        {o.description ? <Body style={{ marginBottom: 6 }}>{o.description}</Body> : null}
        {o.meet_at ? <Body muted>🕘 {formatWhen(o.meet_at)}</Body> : o.meet_day ? <Body muted>🕘 {meetText(t, formatWhen, o)}</Body> : null}
        {durationLine(t, o) ? <Body muted>⏱ {durationLine(t, o, i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR')}</Body> : null}
        {cancelled ? (
          <Card style={{ marginTop: 12, borderColor: c.danger }}>
            <Body style={{ color: c.danger, fontWeight: '700' }}>✕ {t('timer.cancelledTitle')}</Body>
            {o.respond_by ? <Body muted style={{ marginTop: 4 }}>{t('timer.cancelledBody')}</Body> : null}
          </Card>
        ) : (
          <RespondTimer respondBy={o.respond_by} unanswered={unanswered} />
        )}
        {o.chosen_venue && decided && !fixed ? (
          // Ενιαίο πλαίσιο: μαγαζί + η δική μου διαδρομή (με τα ακριβή μέσα συγκοινωνίας)
          <View style={{ marginTop: 12 }}>
            <DecidedVenue venue={o.chosen_venue} plan={mine?.rsvp !== 'declined' ? mine?.plan : null} title={`📍 ${t('decide.decidedTitle')}`} />
          </View>
        ) : o.chosen_venue && fixed ? (
          <View style={{ marginTop: 12 }}>
            <ChosenVenue venue={o.chosen_venue} />
          </View>
        ) : null}
        {fixed && !cancelled && mine && mine.rsvp === 'going' && !isOrganizer ? (
          <Card style={{ marginTop: 16 }}>
            <Body style={{ color: c.good, fontWeight: '700' }}>✓ {t('homeInvites.going')}</Body>
            <View style={{ marginTop: 10 }}>
              <Button
                variant="secondary"
                title={t('outing.cantCome')}
                onPress={() => setRsvp(o.id, 'declined').then(refresh, (e) => Alert.alert(t('common.error'), errorMessage(e)))}
              />
            </View>
          </Card>
        ) : null}

        {/* Ακυρωμένη: όχι δήλωση / απάντηση / αναζήτηση — μόνο η παρέα και η συνομιλία */}
        {!cancelled && !fixed && !decided && mine && mine.rsvp !== 'declined' ? (
          <DeclareCard key={`${mine.id}:${mine.declared}`} row={mine} city={o.city} canDecline={!isOrganizer} outing={o} onChanged={refresh} />
        ) : null}
        {!cancelled && mine?.skipped ? (
          <Card style={{ marginTop: 16 }}>
            <Body>⏭ {t('skip.youWereSkipped')}</Body>
          </Card>
        ) : null}
        {!cancelled && mine && mine.rsvp === 'declined' && !mine.skipped ? (
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

        <Label>
          {hiddenForMe ? t('outing.group') : `${t('outing.group')} · ${fixed ? t('fixed.goingProgress', { going: goingCount, total: active.length }) : t('outing.progress', { declared: declaredCount, total: active.length })}`}
        </Label>
        {rows.map((r) => (
          <PersonStatus key={r.id} row={r} isMe={r.user_id === me} fixed={fixed} />
        ))}
        {hidden ? (
          <Body muted style={{ marginTop: 4, fontSize: 13 }}>
            🙈 {t(hiddenForMe ? 'hidden.noteGuest' : 'hidden.noteOrganizer')}
          </Body>
        ) : null}

        {isOrganizer && open && unanswered > 0 ? <SkipUnanswered outingId={o.id} count={unanswered} onDone={refresh} /> : null}

        {isOrganizer && !cancelled && !fixed ? (
          ready ? (
            // 🎉 Δήλωσαν όλοι → ο διοργανωτής διαλέγει μαγαζί με βάση τις αφετηρίες
            <Card style={{ marginTop: 12, borderColor: c.primary, borderWidth: 2 }}>
              <Body style={{ fontWeight: '700', fontSize: 17 }}>🎉 {t('skip.allReadyTitle')}</Body>
              <Body muted style={{ marginTop: 4, marginBottom: 10 }}>
                {t('skip.allReadyBody', { count: findable.participants.length })}
              </Body>
              <Button title={t('skip.pickPlace')} onPress={onFind} loading={finding} />
            </Card>
          ) : (
            <View style={{ marginTop: 8 }}>
              <Button variant={decided ? 'secondary' : undefined} title={decided ? t('decide.changeVenue') : t('outing.find')} onPress={onFind} loading={finding} disabled={!canFind} />
              {findHint ? (
                <Body muted style={{ marginTop: 6, fontSize: 13, textAlign: 'center' }}>
                  {findHint}
                </Body>
              ) : null}
            </View>
          )
        ) : null}

        {top.length && !(decided && !isOrganizer) ? (
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

        {/* Κρυφή λίστα: χωρίς ομαδική συνομιλία (θα φαινόταν ποιοι γράφουν) */}
        {hidden ? null : (
          <View style={{ marginTop: 20 }}>
            <Button variant="secondary" title={t('outing.chat')} onPress={openChat} />
          </View>
        )}
      </ScrollView>
      {mine && showInvite ? (
        <InviteResponseSheet
          key={mine.id}
          visible
          outing={o}
          row={mine}
          unanswered={unanswered}
          noOrigin={fixed}
          venueName={o.chosen_venue?.name}
          organizerName={organizerName}
          onAccepted={() => {
            setInviteOpen(true);
            refresh();
          }}
          onDone={() => {
            setInviteOpen(false);
            refresh();
          }}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
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
  const [preference, setPreference] = useState<PlacePreference>(row.preference ?? 'fair');

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
      if (preference !== (row.preference ?? 'fair')) await setPlacePreference(row.id, preference);
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
        <Body muted style={{ marginTop: 4 }}>
          {PREFERENCE_EMOJI[row.preference ?? 'fair']} {t(`preference.${row.preference ?? 'fair'}`)}
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
      <OutOfAreaNote city={city} place={place} />
      <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('wizard.how')}</Body>
      <Row>
        {TRANSPORT_MODES.map((m) => (
          <Chip key={m} label={t(`mode.${m}`)} selected={effectiveMode === m} onPress={() => setMode(m)} />
        ))}
      </Row>
      <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('preference.title')}</Body>
      <PreferencePicker value={preference} onChange={setPreference} />
      <View style={{ marginTop: 12, gap: 8 }}>
        <Button title={t('outing.declare')} onPress={submit} loading={saving} disabled={!place || !effectiveMode || outsideArea(city, place)} />
        {row.declared ? <Button variant="secondary" title={t('common.cancel')} onPress={() => setEditing(false)} /> : null}
        {canDecline && !row.declared ? <Button variant="secondary" title={t('outing.cantCome')} onPress={decline} /> : null}
      </View>
    </Card>
  );
}

function PersonStatus({ row, isMe, fixed }: { row: OutingParticipantRow; isMe: boolean; fixed?: boolean }) {
  const { t } = useTranslation();
  const c = useTheme();
  const tags = [row.is_organizer ? t('outing.organizer') : null, isMe ? t('outing.you') : null, row.user_id ? null : t('outing.guest')]
    .filter(Boolean)
    .join(' · ');
  const status = row.skipped
    ? { text: `⏭ ${t('skip.notAnswered')}`, color: c.muted }
    : row.rsvp === 'declined'
      ? { text: t('outing.declined'), color: c.muted }
      : fixed
        ? row.rsvp === 'going'
          ? { text: `✓ ${t('fixed.coming')}`, color: c.good }
          : { text: t('outing.pending'), color: c.muted }
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
  return new Date(iso).toLocaleString('el-GR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** ⏭ «Προχώρα χωρίς όσους δεν απάντησαν» — με επιβεβαίωση μέσα στην κάρτα (δουλεύει και στο web) */
function SkipUnanswered({ outingId, count, onDone }: { outingId: string; count: number; onDone: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await skipUnanswered(outingId);
      setConfirm(false);
      onDone();
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!confirm) {
    return (
      <View style={{ marginTop: 12 }}>
        <Button variant="secondary" title={`⏭ ${t('skip.button', { count })}`} onPress={() => setConfirm(true)} />
      </View>
    );
  }
  return (
    <Card style={{ marginTop: 12, borderColor: c.warn }}>
      <Body style={{ fontWeight: '700' }}>⏭ {t('skip.confirmTitle')}</Body>
      <Body muted style={{ marginTop: 4, marginBottom: 10 }}>
        {t('skip.confirmBody', { count })}
      </Body>
      <Row>
        <Chip label={t('common.cancel')} onPress={() => setConfirm(false)} />
        <Button title={t('skip.confirm')} onPress={run} loading={busy} />
      </Row>
    </Card>
  );
}

/** 🔖 Αποθήκευση της εξόδου (πάνω δεξιά) */
function OutingSaveButton({ outingId }: { outingId: string }) {
  const { t } = useTranslation();
  const c = useTheme();
  const qc = useQueryClient();
  const savedList = useQuery({ queryKey: outingKeys.saved, queryFn: fetchSavedOutings });
  const saved = !!savedList.data?.some((x) => x.id === outingId);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await setOutingSaved(outingId, !saved);
      await qc.invalidateQueries({ queryKey: outingKeys.saved });
      qc.invalidateQueries({ queryKey: outingKeys.mine });
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Pressable
      onPress={toggle}
      disabled={busy}
      hitSlop={12}
      style={{ paddingHorizontal: 8, opacity: busy ? 0.5 : 1 }}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? t('savedOutings.remove') : t('savedOutings.add')}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={c.primary} />
    </Pressable>
  );
}
