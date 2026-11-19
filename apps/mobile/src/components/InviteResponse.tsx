/**
 * Pop-up απάντησης σε πρόσκληση — ανοίγει μόνο του όταν μπαίνεις στην έξοδο (π.χ. από το push)
 * ή από την κάρτα της πρόσκλησης στην αρχική:
 *  1. «Ο Χ σε προσκαλεί για ☕ καφέ · Σάβ 21 Νοε, 20:30» → ✓ Έρχομαι / ✕ Δεν μπορώ
 *  2. (Έρχομαι) αφετηρία + μέσο + «Πού θέλεις να πάμε;» → Δήλωση
 */
import { TRANSPORT_MODES, type CityId, type OutingParticipantRow, type PlacePreference, type ResolvedPlace, type TransportMode } from '@centimeet/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { durationLine } from '@/lib/duration';
import { activityTitle, meetText, declareOrigin, errorMessage, setPlacePreference, setRsvp, type OutingRow } from '@/lib/outings';
import { supabase } from '@/lib/supabase';
import { useFormatWhen } from './Parking';
import { OutOfAreaNote, outsideArea, PlaceSearch } from './PlaceSearch';
import { PreferencePicker } from './PreferencePicker';
import { RespondTimer } from './RespondTimer';
import { Sheet } from './Sheet';
import { Body, Button, Chip, Row } from './ui';

/** Προεπιλεγμένο μέσο από το προφίλ */
export function useDefaultMode(enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-profile', session?.user.id],
    enabled: !!session && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('default_mode').eq('id', session!.user.id).single();
      if (error) throw error;
      return data as { default_mode: TransportMode };
    },
  }).data?.default_mode;
}

export function InviteResponseSheet({
  visible,
  outing,
  row,
  unanswered = 1,
  noOrigin,
  venueName,
  organizerName,
  onAccepted,
  onDone,
  onClose,
}: {
  visible: boolean;
  outing: Pick<OutingRow, 'id' | 'activity' | 'city' | 'meet_at' | 'respond_by'> & { category?: string | null; meet_day?: string | null; title?: string | null; description?: string | null; duration_minutes?: number | null; ends_at?: string | null };
  /** Πόσοι δεν έχουν απαντήσει (για το χρονόμετρο) */
  unanswered?: number;
  /** Χωρίς αφετηρία («Διαλέγω εγώ το μέρος» / «Χωρίς μέρος»): μετά το ✓ τελειώνει */
  noOrigin?: boolean;
  /** Το μέρος, αν το όρισε ο διοργανωτής */
  venueName?: string | null;
  /** Η δική μου συμμετοχή */
  row: Pick<OutingParticipantRow, 'id' | 'rsvp' | 'mode' | 'preference'>;
  organizerName: string;
  /** Πάτησε «Έρχομαι» (το pop-up μένει ανοιχτό για τη δήλωση) */
  onAccepted: () => void;
  /** Τελείωσε (δήλωσε ή αρνήθηκε) — ανανέωση δεδομένων */
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const when = useFormatWhen();
  const [step, setStep] = useState<'ask' | 'declare'>(row.rsvp === 'going' ? 'declare' : 'ask');
  const [busy, setBusy] = useState<'yes' | 'no' | 'declare' | null>(null);
  const [place, setPlace] = useState<ResolvedPlace | undefined>();
  const [mode, setMode] = useState<TransportMode | undefined>(row.mode ?? undefined);
  const [preference, setPreference] = useState<PlacePreference>(row.preference ?? 'fair');
  const defaultMode = useDefaultMode(!row.mode);
  const effectiveMode = mode ?? defaultMode;

  async function answer(going: boolean) {
    setBusy(going ? 'yes' : 'no');
    try {
      await setRsvp(outing.id, going ? 'going' : 'declined');
      if (going && !noOrigin) {
        setStep('declare');
        onAccepted();
      } else onDone();
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function declare() {
    if (!place || !effectiveMode) return;
    setBusy('declare');
    try {
      await declareOrigin(row.id, { lat: place.location.lat, lng: place.location.lng, label: place.name, mode: effectiveMode });
      if (preference !== (row.preference ?? 'fair')) await setPlacePreference(row.id, preference);
      onDone();
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <View style={{ alignItems: 'center', gap: 4, marginBottom: 12 }}>
      <Body style={{ fontSize: 17, textAlign: 'center' }}>{t('respond.invitedBy', { name: organizerName })}</Body>
      {/* ✎ Τίτλος του διοργανωτή (αλλιώς η δραστηριότητα) */}
      <Body style={{ fontSize: 22, fontWeight: '700', textAlign: 'center' }}>{outing.title || activityTitle(t, outing.activity, outing.category)}</Body>
      <Body muted style={{ textAlign: 'center' }}>
        {[outing.title ? activityTitle(t, outing.activity, outing.category) : null, meetText(t, when, outing), durationLine(t, outing, undefined, false) ? `⏱ ${durationLine(t, outing, undefined, false)}` : null, t(`city.${outing.city}`)].filter(Boolean).join(' · ')}
      </Body>
      {venueName ? <Body style={{ textAlign: 'center', fontWeight: '600' }}>📍 {venueName}</Body> : null}
      {outing.description ? <Body style={{ textAlign: 'center', marginTop: 6 }}>{outing.description}</Body> : null}
      {step === 'ask' ? <RespondTimer respondBy={outing.respond_by} unanswered={unanswered} /> : null}
    </View>
  );

  if (step === 'ask') {
    return (
      <Sheet visible={visible} title={t('respond.title')} onClose={onClose}>
        {header}
        <Body style={{ textAlign: 'center', fontWeight: '600', marginBottom: 12 }}>{t('respond.question')}</Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" title={`✕ ${t('respond.no')}`} onPress={() => answer(false)} loading={busy === 'no'} disabled={!!busy} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title={`✓ ${t('respond.yes')}`} onPress={() => answer(true)} loading={busy === 'yes'} disabled={!!busy} />
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      title={t('respond.declareTitle')}
      onClose={onClose}
      footer={<Button title={t('respond.declare')} onPress={declare} loading={busy === 'declare'} disabled={!place || !effectiveMode || outsideArea(outing.city as CityId, place)} />}
    >
      <Body muted style={{ marginBottom: 6 }}>{t('respond.from')}</Body>
      <PlaceSearch city={outing.city as CityId} value={place} onSelect={setPlace} />
      <OutOfAreaNote city={outing.city as CityId} place={place} />
      <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('respond.how')}</Body>
      <Row>
        {TRANSPORT_MODES.map((m) => (
          <Chip key={m} label={t(`mode.${m}`)} selected={effectiveMode === m} onPress={() => setMode(m)} />
        ))}
      </Row>
      <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('preference.title')}</Body>
      <PreferencePicker value={preference} onChange={setPreference} />
    </Sheet>
  );
}
