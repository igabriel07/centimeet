/**
 * Αρχική → «Προσκλήσεις» σε 3 tabs:
 *  - «Απάντησε»: θέλουν κάτι από σένα (απάντηση ή αφετηρία) → πάτημα = pop-up απάντησης
 *  - «Πάμε»: όσες δέχτηκες
 *  - «Έστειλες»: όσες οργάνωσες, με πρόοδο απαντήσεων
 * Ανοίγει στο πρώτο tab που έχει κάτι.
 */
import { INVITE_TABS, inviteTabs, needsMyAction, noOrigins, type InviteTab, type MyOutingRow } from '@centimeet/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ACTIVITY_EMOJI, activityTitle, errorMessage, meetText, setOutingSaved } from '@/lib/outings';
import { InviteResponseSheet } from './InviteResponse';
import { RespondTimer } from './RespondTimer';
import { useFormatWhen } from './Parking';
import { AppText as Text, Body, Card, H1, useTheme } from './ui';

export function HomeInvites({ rows, saved, onChanged }: { rows: MyOutingRow[]; saved: MyOutingRow[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const { tabs, initial } = inviteTabs(rows, new Date(), saved);
  // Μένει στο tab που διάλεξε ο χρήστης· μέχρι τότε στο πρώτο που έχει κάτι
  const [picked, setPicked] = useState<InviteTab | null>(null);
  const tab = picked ?? initial;
  const [responding, setResponding] = useState<MyOutingRow | null>(null);
  const list = tabs[tab];

  return (
    <View style={{ marginTop: 24 }}>
      <H1>{t('homeInvites.title')}</H1>
      <InviteTabBar tab={tab} counts={{ answer: tabs.answer.length, going: tabs.going.length, sent: tabs.sent.length, saved: tabs.saved.length }} onChange={setPicked} />

      {!list.length ? (
        <Body muted style={{ marginTop: 14, textAlign: 'center' }}>
          {t(`homeInvites.empty_${tab}`)}
        </Body>
      ) : null}

      <View style={{ marginTop: 12 }}>
        {tab === 'sent' || tab === 'saved'
          ? list.map((o) =>
              o.is_organizer ? (
                <SentCard key={o.id} o={o} onChanged={onChanged} />
              ) : (
                <ReceivedCard key={o.id} o={o} onChanged={onChanged} onPress={() => (needsMyAction(o) ? setResponding(o) : router.push(`/outing/${o.id}`))} />
              ),
            )
          : list.map((o) => (
              <ReceivedCard
                key={o.id}
                o={o}
                onChanged={onChanged}
                // Χρειάζεται απάντηση (ή δήλωση αφετηρίας στις «δίκαιες») → pop-up· αλλιώς η έξοδος
                onPress={() => (needsMyAction(o) ? setResponding(o) : router.push(`/outing/${o.id}`))}
              />
            ))}
      </View>

      {responding ? (
        <InviteResponseSheet
          key={responding.id}
          visible
          outing={responding}
          row={{ id: responding.my_participant_id, rsvp: responding.my_rsvp, mode: null }}
          unanswered={responding.unanswered_count ?? 1}
          noOrigin={noOrigins(responding)}
          venueName={responding.venue_name}
          organizerName={responding.organizer_name ?? ''}
          onAccepted={onChanged}
          onDone={() => {
            setResponding(null);
            onChanged();
          }}
          onClose={() => setResponding(null)}
        />
      ) : null}
    </View>
  );
}

/** 🔖 Αποθήκευση / αφαίρεση από τα «Αποθηκευμένα» (κατευθείαν από την κάρτα) */
function SaveToggle({ o, onChanged }: { o: MyOutingRow; onChanged: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const [saved, setSaved] = useState(!!o.saved);
  const [prev, setPrev] = useState(o.saved);
  // Ήρθε νέα τιμή από τη βάση → συγχρονισμός
  if (prev !== o.saved) {
    setPrev(o.saved);
    setSaved(!!o.saved);
  }
  return (
    <Pressable
      onPress={() => {
        const next = !saved;
        setSaved(next);
        setOutingSaved(o.id, next).then(onChanged, (e) => {
          setSaved(!next);
          Alert.alert(t('common.error'), errorMessage(e));
        });
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? t('savedOutings.remove') : t('savedOutings.add')}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? c.primary : c.muted} />
    </Pressable>
  );
}

/** Tabs με υπογράμμιση· στο «Απάντησε» κόκκινος αριθμός, στα άλλα διακριτικός */
function InviteTabBar({ tab, counts, onChange }: { tab: InviteTab; counts: Record<InviteTab, number>; onChange: (t: InviteTab) => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    // Κυλάει οριζόντια όταν δεν χωράνε (μικρά κινητά)
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[st.bar, { borderBottomColor: c.border }]}
      contentContainerStyle={{ flexGrow: 1 }}
      accessibilityRole="tablist"
    >
      {INVITE_TABS.map((k) => {
        const on = k === tab;
        const n = counts[k];
        const urgent = k === 'answer' && n > 0;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="tab"
            accessibilityLabel={t(`homeInvites.tab_${k}`)}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [st.tab, { opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={st.tabInner}>
              {/* «Αποθηκευμένα»: μόνο το 🔖 για να χωράνε και τα 4 tabs */}
              {k === 'saved' ? (
                <Ionicons name={on ? 'bookmark' : 'bookmark-outline'} size={18} color={on ? c.primary : c.muted} />
              ) : (
                <Text style={{ color: on ? c.primary : c.muted, fontWeight: on ? '700' : '600', fontSize: 14 }} numberOfLines={1}>
                  {t(`homeInvites.tab_${k}`)}
                </Text>
              )}
              {n ? (
                <View style={[st.badge, { backgroundColor: urgent ? c.danger : on ? `${c.primary}22` : c.chip }]}>
                  <Text style={{ color: urgent ? '#fff' : on ? c.primary : c.muted, fontWeight: '700', fontSize: 12 }}>{n}</Text>
                </View>
              ) : null}
            </View>
            <View style={[st.underline, { backgroundColor: on ? c.primary : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  bar: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  tab: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 10 },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  underline: { height: 3, borderRadius: 2, alignSelf: 'stretch', marginHorizontal: 12, marginBottom: -StyleSheet.hairlineWidth },
});


/** «🥧 Μπουγάτσα» → μεγάλο εικονίδιο (κατηγορίας ή δραστηριότητας) + κείμενο */
function titleParts(t: (k: string) => string, o: MyOutingRow) {
  const full = activityTitle(t, o.activity, o.category);
  const i = full.indexOf(' ');
  return i > 0 ? { icon: full.slice(0, i), text: full.slice(i + 1) } : { icon: ACTIVITY_EMOJI[o.activity], text: full };
}

function whenCity(t: (k: string) => string, when: (iso: string) => string, o: MyOutingRow) {
  return [meetText(t, when, o), t(`city.${o.city}`)].join(' · ');
}

function ReceivedCard({ o, onPress, onChanged }: { o: MyOutingRow; onPress: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const when = useFormatWhen();
  const isNew = o.my_rsvp === 'invited';
  const fixed = noOrigins(o);
  const status = isNew
    ? { text: t('homeInvites.tapToAnswer'), color: c.primary }
    : o.status === 'decided'
      ? { text: `✓ ${t('decide.decidedTitle')}`, color: c.good }
    : fixed
      ? { text: `✓ ${t('homeInvites.going')} · ${t('fixed.goingProgress', { going: o.going_count ?? 0, total: o.total_count })}`, color: c.muted }
      : !o.my_declared
      ? { text: `⏳ ${t('outing.waitingForYou')}`, color: c.primary }
      : { text: `✓ ${t('homeInvites.going')} · ${t('outing.progress', { declared: o.declared_count, total: o.total_count })}`, color: c.muted };
  return (
    <Card onPress={onPress} style={isNew ? { borderColor: c.primary, borderWidth: 2 } : undefined}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 28 }}>{titleParts(t, o).icon}</Text>
        <View style={{ flex: 1 }}>
          <Body muted style={{ fontSize: 13 }}>{t('respond.invitedBy', { name: o.organizer_name ?? '?' })}</Body>
          <Body style={{ fontWeight: '700', fontSize: 16 }}>
            {o.title ?? titleParts(t, o).text}
          </Body>
          <Body muted style={{ fontSize: 13 }}>{whenCity(t, when, o)}</Body>
          {o.venue_name ? (
            <Body style={{ fontSize: 13, fontWeight: '600' }}>📍 {o.venue_name}</Body>
          ) : null}
          <Body style={{ marginTop: 4, fontSize: 13, fontWeight: '600', color: status.color }}>{status.text}</Body>
          <RespondTimer compact respondBy={o.respond_by} unanswered={o.unanswered_count ?? 0} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <SaveToggle o={o} onChanged={onChanged} />
          {isNew ? (
            <View style={{ backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: c.primaryText, fontWeight: '700', fontSize: 12 }}>{t('homeInvites.new')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function SentCard({ o, onChanged }: { o: MyOutingRow; onChanged: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const when = useFormatWhen();
  const waitingOthers = o.declared_count < o.total_count;
  return (
    <Card onPress={() => router.push(`/outing/${o.id}`)}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Text style={{ fontSize: 28 }}>{titleParts(t, o).icon}</Text>
        <View style={{ flex: 1 }}>
          <Body style={{ fontWeight: '700', fontSize: 16 }}>
            {o.title ?? titleParts(t, o).text}
          </Body>
          <Body muted style={{ fontSize: 13 }}>{whenCity(t, when, o)}</Body>
          {o.venue_name ? (
            <Body style={{ fontSize: 13, fontWeight: '600' }}>📍 {o.venue_name}</Body>
          ) : null}
          <Body style={{ marginTop: 4, fontSize: 13, fontWeight: '600', color: waitingOthers ? c.muted : c.primary }}>
            {noOrigins(o)
              ? `${(o.unanswered_count ?? 0) > 0 ? '⏳' : '✓'} ${t('fixed.goingProgress', { going: o.going_count ?? 0, total: o.total_count })}`
              : o.status === 'collecting'
              ? `${waitingOthers ? '⏳' : '✓'} ${t('outing.progress', { declared: o.declared_count, total: o.total_count })}`
              : t(`history.status.${o.status}`)}
          </Body>
          <RespondTimer compact respondBy={o.respond_by} unanswered={o.unanswered_count ?? 0} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <SaveToggle o={o} onChanged={onChanged} />
          <Text style={{ color: c.muted, fontSize: 22 }}>›</Text>
        </View>
      </View>
    </Card>
  );
}
