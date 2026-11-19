import {
  ACTIVITIES,
  categoriesFor,
  CITIES,
  dayOffsetOf,
  dayTime,
  favoriteWhen,
  inHours,
  nextTimeOfDay,
  localDayKey,
  MAX_PARTICIPANTS,
  respondByFrom,
  timerAllowed,
  durationMinutes,
  endsAtAllowed,
  type Duration,
  timerMinutes,
  TRANSPORT_MODES,
  type InHours,
  type InviteProfile,
  type FixedVenue,
  type PlaceMode,
  type RespondTimer,
} from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { CategoryDropdown, CategoryPicker } from '@/components/CategoryPicker';
import { FixedPlacePicker } from '@/components/FixedPlacePicker';
import { OutingDetailsButton, OutingDetailsSheet, type OutingDetails } from '@/components/OutingDetails';
import { TimerField, TimerSheet, useTimerLabel } from '@/components/TimerPicker';
import { DurationField, DurationSheet } from '@/components/DurationPicker';
import { InvitePicker } from '@/components/InvitePicker';
import { acceptedFriends, useFriendships, useMyGroups } from '@/lib/friends';
import { PlaceSearch } from '@/components/PlaceSearch';
import { CustomWhenSheet, InHoursChip } from '@/components/WhenPicker';
import { Body, Button, Card, Chip, Input, Label, Row, Screen, useTheme } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useMyProfile } from '@/lib/profile';
import { APP_INVITE_URL, inviteToApp } from '@/lib/share';
import { durationLabel } from '@/lib/duration';
import { ACTIVITY_EMOJI, createOuting, errorMessage, fetchOutingHistory, outingKeys } from '@/lib/outings';
import { toFixedSaveInput, toParticipants, toSaveInput, useOuting, type DraftPerson } from '@/store/outing';

/**
 * Οδηγός νέας εξόδου σε μία οθόνη:
 * 1. δραστηριότητα & πόλη  2. ώρα (προαιρετική)  3. άτομα: όνομα, αφετηρία, μέσο
 * Με λογαριασμό: φίλοι από τη λίστα (δηλώνουν μόνοι τους) + «Αποθήκευση & πρόσκληση».
 */
export default function NewOuting() {
  const { t, i18n } = useTranslation();
  const c = useTheme();
  const o = useOuting();
  const qc = useQueryClient();
  const { session } = useAuth();
  const me = session?.user.id;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<'friends' | 'groups' | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const hasCategories = categoriesFor(o.activity).length > 0;
  const hasFriends = o.people.some((p) => p.userId && !p.isMe);
  // «Βρες το δίκαιο σημείο»: μόνο με χειροκίνητα άτομα και όλοι (και «Εγώ») με αφετηρία & μέσο
  const hasGuests = o.people.some((p) => !p.userId && !p.isMe);
  const readyToFind = !hasFriends && hasGuests && !!toParticipants(o.people);
  const profile = useMyProfile();
  const myName = profile.data?.display_name ?? '';
  const { ensureMe } = o;
  useEffect(() => ensureMe(myName), [ensureMe, myName]);

  // «Πότε;» — Τώρα · Σε Ν ώρες ▾ · Απόψε 21:00 · 📅 Άλλη μέρα/ώρα
  // Προαιρετικό: καμία προεπιλογή (null = δεν ορίστηκε ώρα)
  const [whenKey, setWhenKey] = useState<'now' | 'today' | 'tonight' | 'tomorrow' | 'hours' | 'custom' | 'favorite' | null>(null);
  /** «Άλλη μέρα» χωρίς ώρα (YYYY-MM-DD) */
  const [customDay, setCustomDay] = useState<string | undefined>();
  /** «Σήμερα» / «Άλλη μέρα» χωρίς ώρα → μόνο μέρα */
  const meetDay =
    whenKey === 'today' || whenKey === 'tonight' ? localDayKey(new Date()) : whenKey === 'tomorrow' ? localDayKey(dayTime(new Date(), 1, 12, 0)) : whenKey === 'custom' ? customDay : undefined;
  const [hours, setHours] = useState<InHours>(1);
  const [customOpen, setCustomOpen] = useState(false);

  // «Επιπλέον ρυθμίσεις» (πάντα μαζεμένες στην αρχή): χρονόμετρο απάντησης
  const [extraOpen, setExtraOpen] = useState(false);
  const [timer, setTimer] = useState<RespondTimer | null>(null);
  // «Διαλέγω εγώ το μέρος»: χωρίς αφετηρίες — ο διοργανωτής ορίζει το μαγαζί/σημείο
  // «Πού;»: fair = δίκαιο σημείο · fixed = διαλέγω εγώ · none = χωρίς μέρος
  const [placeMode, setPlaceMode] = useState<PlaceMode>('fair');
  /** Χωρίς αφετηρίες (fixed / none): οι άλλοι απαντούν μόνο αν έρχονται */
  const fixedPlace = placeMode !== 'fair';
  const [venue, setVenue] = useState<FixedVenue | undefined>();
  // Αν άλλαξε η ώρα και η προθεσμία πέφτει μετά τη συνάντηση → βγαίνει
  useEffect(() => {
    if (timer && !timerAllowed(timerMinutes(timer), new Date(), o.departAt)) setTimer(null);
  }, [timer, o.departAt]);
  const timerLabel = useTimerLabel();
  const [timerOpen, setTimerOpen] = useState(false);
  // Κρυφή λίστα καλεσμένων (προεπιλογή: όλοι βλέπουν όλους)
  const [hideParticipants, setHideParticipants] = useState(false);
  // ⏱ Διάρκεια εξόδου (λεπτά) — προαιρετική
  // ώρες ή μέρες (τροχός) ή «Άλλη» = ακριβής λήξη (ημερολόγιο + ώρα)
  const [duration, setDuration] = useState<Duration | null>(null);
  const [durationOpen, setDurationOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const durationInput =
    duration?.kind === 'end' ? { endsAt: duration.iso } : duration ? { durationMinutes: durationMinutes(duration) } : {};
  // Άλλαξε η ώρα συνάντησης και η λήξη έμεινε πριν → βγαίνει
  useEffect(() => {
    if (duration?.kind === 'end' && !endsAtAllowed(duration.iso, new Date(), o.departAt)) setDuration(null);
  }, [duration, o.departAt]);
  // ✎ Τίτλος & περιγραφή (κουμπί πάνω δεξιά → pop-up)
  const [details, setDetails] = useState<OutingDetails>({ title: '', description: '' });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsInput = { title: details.title || undefined, description: details.description || undefined };
  // ⭐ Η «αγαπημένη» επιλογή ώρας του χρήστη (από τις εξόδους που οργάνωσε) — αλλιώς καμία έξτρα επιλογή
  const history = useQuery({ queryKey: outingKeys.history, enabled: !!me, staleTime: 10 * 60_000, queryFn: fetchOutingHistory });
  const favorite = history.data ? favoriteWhen(history.data) : null;
  const favoriteIso = () =>
    favorite?.kind === 'hours'
      ? inHours(new Date(), favorite.hours).toISOString()
      : favorite
        ? nextTimeOfDay(new Date(), favorite.hour, favorite.minute).toISOString()
        : undefined;
  const favoriteLabel = (() => {
    if (!favorite) return '';
    if (favorite.kind === 'hours') return `⭐ ${t('wizard.inHoursMany', { n: favorite.hours.toLocaleString(i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR') })}`;
    const at = nextTimeOfDay(new Date(), favorite.hour, favorite.minute);
    const hm = `${String(favorite.hour).padStart(2, '0')}:${String(favorite.minute).padStart(2, '0')}`;
    const today = dayOffsetOf(new Date(), at) === 0;
    return `⭐ ${t(today ? (favorite.hour >= 18 ? 'wizard.tonight' : 'wizard.today') : 'wizard.tomorrow')} ${hm}`;
  })();
  /** Επιλογή «μόνο μέρα» / «τώρα»: δεύτερο πάτημα → αποεπιλογή */
  const toggleDay = (key: 'now' | 'today' | 'tonight' | 'tomorrow') => {
    setWhenKey(whenKey === key ? null : key);
    o.setDepartAt(undefined);
  };
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR';
  const customLabel =
    whenKey === 'custom' && customDay
      ? `📅 ${new Date(`${customDay}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}`
      : whenKey === 'custom' && o.departAt
        ? `📅 ${new Date(o.departAt).toLocaleString(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
        : `📅 ${t('wizard.custom')}`;

  // «Πρόσκληση στην εφαρμογή»: μήνυμα + @username (για να σε προσθέσουν) + link λήψης
  const [copied, setCopied] = useState(false);
  async function invite() {
    const username = profile.data?.username;
    const message = [t('wizard.inviteMessage'), username ? t('wizard.inviteAddMe', { username }) : null, APP_INVITE_URL || null]
      .filter(Boolean)
      .join('\n\n');
    if ((await inviteToApp(message)) === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  /** Χρειάζεται τουλάχιστον ένα άτομο εκτός από «Εγώ» */
  const needsCompany = () => {
    if (o.people.length >= 2) return false;
    Alert.alert(t('wizard.needSomeone'));
    return true;
  };

  async function find() {
    if (needsCompany()) return;
    if (hasFriends) {
      Alert.alert(t('wizard.friendsDeclare'));
      return;
    }
    const participants = toParticipants(o.people);
    if (!participants) {
      Alert.alert(t('wizard.missingInfo'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.suggestions({
        city: o.city,
        activity: o.activity,
        category: o.category,
        departAt: o.departAt,
        participants,
      });
      o.setSuggestions(res);
      router.push('/outing/results');
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveFixed() {
    if (needsCompany()) return;
    if (placeMode === 'fixed' && !venue) {
      Alert.alert(t('fixed.needVenue'));
      return;
    }
    setSaving(true);
    try {
      const id = await createOuting({
        activity: o.activity,
        category: o.category,
        city: o.city,
        meetAt: o.departAt,
        meetDay,
        meetPart: whenKey === 'tonight' ? 'evening' : undefined,
        respondBy: timer ? respondByFrom(new Date(), timerMinutes(timer)).toISOString() : undefined,
        hideParticipants,
        venue: placeMode === 'fixed' ? venue : undefined,
        noPlace: placeMode === 'none',
        ...durationInput,
        ...detailsInput,
        ...toFixedSaveInput(o.people),
      });
      qc.invalidateQueries({ queryKey: outingKeys.mine });
      qc.invalidateQueries({ queryKey: outingKeys.history });
      const invited = hasFriends;
      o.reset();
      setTimer(null);
      setHideParticipants(false);
      setVenue(undefined);
      setDuration(null);
      setDetails({ title: '', description: '' });
      setPlaceMode('fair');
      if (invited) {
        // Όπως η κανονική πρόσκληση: κλείνει → αρχική
        if (router.canDismiss()) router.dismissAll();
        else router.replace('/(tabs)');
        Alert.alert(t('wizard.inviteSent'), t('fixed.inviteSentBody'));
      } else {
        router.replace(`/outing/${id}`);
      }
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (needsCompany()) return;
    const input = toSaveInput(o.people);
    if (!input.ok) {
      Alert.alert(t(input.error === 'needMe' ? 'wizard.needMe' : 'wizard.missingGuests'));
      return;
    }
    setSaving(true);
    try {
      await createOuting({
        activity: o.activity,
        category: o.category,
        city: o.city,
        meetAt: o.departAt,
        meetDay,
        meetPart: whenKey === 'tonight' ? 'evening' : undefined,
        respondBy: timer ? respondByFrom(new Date(), timerMinutes(timer)).toISOString() : undefined,
        hideParticipants,
        ...durationInput,
        ...detailsInput,
        ...input,
      });
      setTimer(null);
      setHideParticipants(false);
      setDuration(null);
      setDetails({ title: '', description: '' });
      qc.invalidateQueries({ queryKey: outingKeys.mine });
      qc.invalidateQueries({ queryKey: outingKeys.history });
      o.reset();
      // Κλείνει η «Νέα έξοδος» → αρχική (οι προσκεκλημένοι παίρνουν push)
      if (router.canDismiss()) router.dismissAll();
      else router.replace('/(tabs)');
      Alert.alert(t('wizard.inviteSent'), t('wizard.inviteSentBody'));
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          // ✎ Ο τίτλος που έβαλε ο χρήστης αντικαθιστά το «Νέα έξοδος»
          title: details.title || t('wizard.newOuting'),
          headerRight: () => <OutingDetailsButton filled={!!(details.title || details.description)} onPress={() => setDetailsOpen(true)} /> }}
      />
      <OutingDetailsSheet visible={detailsOpen} value={details} onClose={() => setDetailsOpen(false)} onSave={setDetails} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Label>{t('wizard.whatFor')}</Label>
          <Row>
            {ACTIVITIES.map((a) => (
              <Chip
                key={a}
                label={`${ACTIVITY_EMOJI[a]} ${t(`activity.${a}`)}`}
                selected={o.activity === a}
                onPress={() => {
                  if (a === o.activity) return hasCategories && setCategoryOpen(true);
                  o.setActivity(a);
                  if (categoriesFor(a).length) setCategoryOpen(true);
                }}
              />
            ))}
          </Row>
          {hasCategories ? (
            <CategoryDropdown activity={o.activity} value={o.category} onPress={() => setCategoryOpen(true)} />
          ) : o.activity === 'spot' ? (
            <Body muted style={{ marginTop: 8 }}>{t('wizard.spotHint')}</Body>
          ) : null}
          {categoryOpen ? (
            <CategoryPicker
              activity={o.activity}
              visible
              selected={o.category}
              onClose={() => setCategoryOpen(false)}
              onSelect={(cat) => {
                o.setCategory(cat);
                setCategoryOpen(false);
              }}
            />
          ) : null}

          <Label>{t('wizard.city')}</Label>
          <Row>
            {CITIES.map((ct) => (
              <Chip key={ct} label={t(`city.${ct}`)} selected={o.city === ct} onPress={() => o.setCity(ct)} />
            ))}
          </Row>

          <Label>{t('wizard.when')}</Label>
          <Row>
            <Chip label={t('wizard.now')} selected={whenKey === 'now'} onPress={() => toggleDay('now')} />
            {/* Σήμερα / Αύριο: μόνο μέρα, χωρίς συγκεκριμένη ώρα */}
            <Chip label={t('wizard.today')} selected={whenKey === 'today'} onPress={() => toggleDay('today')} />
            {/* 🌙 Απόψε: σήμερα το βράδυ, χωρίς συγκεκριμένη ώρα */}
            <Chip label={t('wizard.tonight')} selected={whenKey === 'tonight'} onPress={() => toggleDay('tonight')} />
            <Chip label={t('wizard.tomorrow')} selected={whenKey === 'tomorrow'} onPress={() => toggleDay('tomorrow')} />
            <InHoursChip
              hours={hours}
              selected={whenKey === 'hours'}
              onSelect={(h) => {
                setHours(h);
                setWhenKey('hours');
                o.setDepartAt(inHours(new Date(), h).toISOString());
              }}
              onDeselect={() => {
                setWhenKey(null);
                o.setDepartAt(undefined);
              }}
            />
            <Chip label={customLabel} selected={whenKey === 'custom'} onPress={() => setCustomOpen(true)} />
            {favorite ? (
              <Chip
                label={favoriteLabel}
                selected={whenKey === 'favorite'}
                onPress={() => {
                  if (whenKey === 'favorite') {
                    setWhenKey(null);
                    o.setDepartAt(undefined);
                    return;
                  }
                  setWhenKey('favorite');
                  o.setDepartAt(favoriteIso());
                }}
              />
            ) : null}
          </Row>
          <CustomWhenSheet
            visible={customOpen}
            initial={whenKey === 'custom' ? o.departAt : undefined}
            initialDay={whenKey === 'custom' ? customDay : undefined}
            onClose={() => setCustomOpen(false)}
            onConfirm={(v) => {
              setCustomOpen(false);
              setWhenKey('custom');
              // Χωρίς ώρα → μόνο μέρα· αλλιώς συγκεκριμένη ώρα
              setCustomDay(v.day);
              o.setDepartAt(v.iso);
            }}
          />

          {/* «Πού;» — δίκαιο σημείο (αλγόριθμος) · διαλέγω εγώ το μέρος · χωρίς μέρος */}
          <Label>{t('fixed.where')}</Label>
          <View style={{ gap: 8 }} accessibilityRole="radiogroup">
            {(
              [
                ['fair', '⚖️', t('fixed.fairTitle'), t('fixed.fairHint')],
                ['fixed', '📍', t('fixed.title'), t('fixed.hint')],
                ['none', '🤝', t('fixed.noneTitle'), t('fixed.noneHint')],
              ] as const
            ).map(([mode, icon, label, hint]) => (
              <PlaceModeTile
                key={mode}
                icon={icon}
                label={label}
                hint={hint}
                selected={placeMode === mode}
                onPress={() => {
                  setPlaceMode(mode);
                  if (mode !== 'fixed') setVenue(undefined);
                }}
              />
            ))}
          </View>

          {/* Επιπλέον ρυθμίσεις — μαζεμένες· πάτημα → ανοίγουν από κάτω */}
          <Pressable
            onPress={() => setExtraOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: extraOpen }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 20,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: pressed ? c.chip : c.card,
            })}
          >
            <Ionicons name="options-outline" size={18} color={c.muted} />
            <Body style={{ flex: 1, fontWeight: '600' }}>{t('wizard.extra')}</Body>
            {!extraOpen && (timer || hideParticipants || duration) ? (
              <Body style={{ color: c.primary, fontWeight: '600' }}>
                {[timer ? `⏳ ${timerLabel(timer)}` : null, duration ? `⏱ ${durationLabel(t, duration, locale)}` : null, hideParticipants ? '🙈' : null].filter(Boolean).join(' · ')}
              </Body>
            ) : null}
            <Ionicons name={extraOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
          </Pressable>
          {extraOpen ? (
            <View style={{ paddingTop: 12, paddingHorizontal: 4 }}>
              <Body style={{ fontWeight: '600' }}>⏳ {t('timer.title')}</Body>
              <Body muted style={{ marginTop: 2, marginBottom: 8, fontSize: 13 }}>
                {t('timer.hint')}
              </Body>
              <TimerField value={timer} onPress={() => setTimerOpen(true)} />
              {timer && !hasFriends ? (
                <Body muted style={{ marginTop: 6, fontSize: 13 }}>
                  ℹ️ {t('timer.needFriends')}
                </Body>
              ) : null}

              <View style={{ height: 1, backgroundColor: c.border, marginVertical: 14 }} />
              <Body style={{ fontWeight: '600' }}>⏱ {t('duration.title')}</Body>
              <Body muted style={{ marginTop: 2, marginBottom: 8, fontSize: 13 }}>
                {t('duration.hint')}
              </Body>
              <DurationField value={duration} onPress={() => setDurationOpen(true)} />

              <View style={{ height: 1, backgroundColor: c.border, marginVertical: 14 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '600' }}>🙈 {t('hidden.title')}</Body>
                  <Body muted style={{ marginTop: 2, fontSize: 13 }}>
                    {t('hidden.hint')}
                  </Body>
                </View>
                <Switch
                  value={hideParticipants}
                  onValueChange={setHideParticipants}
                  trackColor={{ true: c.primary, false: c.border }}
                  thumbColor="#fff"
                  // Στο web το react-native-web έχει δικά του props για τα χρώματα
                  {...(Platform.OS === 'web' ? ({ activeThumbColor: '#fff', activeTrackColor: c.primary } as object) : {})}
                  accessibilityLabel={t('hidden.title')}
                />
              </View>
            </View>
          ) : null}
          <DurationSheet
            visible={durationOpen}
            value={duration}
            onClose={() => setDurationOpen(false)}
            onConfirm={(v) => {
              setDurationOpen(false);
              setDuration(v ? { kind: 'amount', ...v } : null);
            }}
            onPickEnd={() => {
              setDurationOpen(false);
              setEndOpen(true);
            }}
          />
          <CustomWhenSheet
            visible={endOpen}
            allowNoTime={false}
            title={`⏱ ${t('duration.titleEnd')}`}
            confirmLabel={t('duration.setEnd')}
            // Πρόταση: 2 ώρες μετά τη συνάντηση
            initial={duration?.kind === 'end' ? duration.iso : o.departAt ? new Date(new Date(o.departAt).getTime() + 2 * 3600_000).toISOString() : undefined}
            after={o.departAt}
            onClose={() => setEndOpen(false)}
            onConfirm={(v) => {
              setEndOpen(false);
              if (v.iso) setDuration({ kind: 'end', iso: v.iso });
            }}
          />
          <TimerSheet
            visible={timerOpen}
            value={timer}
            meetAt={o.departAt}
            onClose={() => setTimerOpen(false)}
            onConfirm={(v) => {
              setTimerOpen(false);
              setTimer(v);
            }}
          />
          {/* «Διαλέγω εγώ»: αναζήτηση μέρους κάτω από τις επιπλέον ρυθμίσεις */}
          {placeMode === 'fixed' ? (
            <View style={{ marginTop: 16 }}>
              <FixedPlacePicker city={o.city} activity={o.activity} category={o.category} value={venue} onChange={setVenue} />
            </View>
          ) : null}

          <Label>{t('wizard.people')}</Label>
          {/* Κάρτες: «Εγώ» + όσοι πρόσθεσες χειροκίνητα (οι φίλοι εμφανίζονται πιο κάτω, στους προσκεκλημένους) */}
          {o.people.filter((p) => !p.userId || p.isMe).map((p, i) => {
            const removeBtn =
              !p.isMe ? (
                <Pressable onPress={() => o.removePerson(p.id)} hitSlop={10} accessibilityLabel="remove">
                  <Body muted style={{ fontSize: 20 }}>✕</Body>
                </Pressable>
              ) : null;

            return (
              <Card key={p.id}>
                {p.isMe ? (
                  // Ο τρέχων χρήστης: σταθερό όνομα, δεν αλλάζει ούτε αφαιρείται
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }} accessibilityLabel={t('wizard.me')}>
                    <Body style={{ fontSize: 20 }}>🙋</Body>
                    <Body style={{ flex: 1, fontWeight: '700', fontSize: 17 }} >
                      {t('wizard.me')}
                      {p.name.trim() ? <Body muted style={{ fontWeight: '500', fontSize: 17 }}>{` (${p.name.trim()})`}</Body> : null}
                    </Body>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Input
                      style={{ flex: 1 }}
                      value={p.name}
                      onChangeText={(name) => o.updatePerson(p.id, { name })}
                      placeholder={`${t('wizard.personName')} ${i}`}
                    />
                    {removeBtn}
                  </View>
                )}

                {fixedPlace ? null : (
                  <>
                    <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('wizard.from')}</Body>
                    <PlaceSearch
                      city={o.city}
                      personName={p.isMe ? undefined : p.name.trim() || undefined}
                      value={p.originPlace}
                      onSelect={(pl) => o.updatePerson(p.id, { origin: pl.location, originPlace: pl })}
                    />

                    <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('wizard.how')}</Body>
                    <Row>
                      {TRANSPORT_MODES.map((m) => (
                        <Chip key={m} label={t(`mode.${m}`)} selected={p.mode === m} onPress={() => o.updatePerson(p.id, { mode: m })} />
                      ))}
                    </Row>
                  </>
                )}
              </Card>
            );
          })}
          <View style={{ gap: 8 }}>
            {o.people.length < MAX_PARTICIPANTS ? (
              // Μικρό, διακριτικό: προσθήκη ατόμου χωρίς λογαριασμό
              <Pressable
                onPress={() => o.addPerson()}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: pressed ? c.chip : 'transparent',
                })}
              >
                <Ionicons name="add" size={16} color={c.text} />
                <Body style={{ fontSize: 14, fontWeight: '600' }}>{t('wizard.addPerson')}</Body>
              </Pressable>
            ) : null}
            {/* Πρόσκληση: φίλοι & ομάδα δίπλα-δίπλα — ανοίγουν pop-up */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <InviteTile
                icon="people"
                label={t('wizard.inviteFriends')}
                hint={me ? t('wizard.inviteFriendsHint') : t('wizard.signInToInvite')}
                onPress={() => setPickerOpen('friends')}
              />
              <InviteTile
                icon="people-circle"
                label={t('wizard.inviteGroupShort')}
                hint={me ? t('wizard.inviteGroupHint') : t('wizard.signInToInvite')}
                onPress={() => setPickerOpen('groups')}
              />
            </View>

            {/* Όσοι προσκλήθηκαν (φίλοι & ομάδες), με − για αφαίρεση */}
            <InvitedList me={me} fixed={fixedPlace} onEdit={setPickerOpen} />

            {/* Έντονο: φέρνει νέους χρήστες */}
            <Button title={copied ? t('wizard.inviteCopied') : t('wizard.inviteToApp')} onPress={invite} />
          </View>
        </ScrollView>

        {/* Κάτω κουμπί:
            φίλοι/ομάδα → «Στείλε πρόσκληση» (δηλώνουν μόνοι τους)·
            μόνο χειροκίνητα άτομα με διευθύνσεις → «Βρες το δίκαιο σημείο»· αλλιώς τίποτα */}
        {fixedPlace ? (
          // «Διαλέγω εγώ» (μόλις οριστεί το μέρος) / «Χωρίς μέρος»: αρκεί να υπάρχει παρέα
          (placeMode === 'none' || venue) && (hasFriends || hasGuests) ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: c.bg }}>
              <Button title={hasFriends ? t('wizard.sendInvite') : t('fixed.save')} onPress={saveFixed} loading={saving} />
            </View>
          ) : null
        ) : hasFriends || readyToFind ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: c.bg }}>
            {hasFriends ? (
              <Button title={t('wizard.sendInvite')} onPress={save} loading={saving} />
            ) : (
              <Button title={t('wizard.find')} onPress={find} loading={loading} />
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <FriendsPopup visible={pickerOpen === 'friends'} me={me} onClose={() => setPickerOpen(null)} />
      <GroupsPopup visible={pickerOpen === 'groups'} me={me} onClose={() => setPickerOpen(null)} />
    </Screen>
  );
}

/** «Πού;»: επιλογή τρόπου (γραμμή με εικονίδιο, τίτλο, περιγραφή και radio) */
function PlaceModeTile({ icon, label, hint, selected, onPress }: { icon: string; label: string; hint: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected || pressed ? c.chip : c.card,
      })}
    >
      <Body style={{ fontSize: 24 }}>{icon}</Body>
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '700' }}>{label}</Body>
        <Body muted style={{ fontSize: 12 }}>
          {hint}
        </Body>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? c.primary : c.muted} />
    </Pressable>
  );
}

/** Πλακίδιο πρόσκλησης (εικονίδιο πάνω, τίτλος, μικρή περιγραφή) — δύο δίπλα-δίπλα */
function InviteTile({
  icon,
  label,
  hint,
  badge,
  disabled,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint?: string;
  badge?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: disabled ? c.border : c.primary,
        borderStyle: disabled ? 'dashed' : 'solid',
        backgroundColor: pressed ? c.chip : c.card,
      })}
    >
      <Ionicons name={icon} size={28} color={disabled ? c.muted : c.primary} />
      <Body style={{ fontWeight: '700', textAlign: 'center', color: disabled ? c.muted : c.text }}>{label}</Body>
      {hint ? (
        <Body muted style={{ fontSize: 12, textAlign: 'center' }}>
          {hint}
        </Body>
      ) : null}
      {badge ? (
        <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: c.chip, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
          <Body style={{ fontSize: 11, fontWeight: '600', color: c.muted }}>{badge}</Body>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Οι μεμονωμένα προσκεκλημένοι φίλοι, ως προφίλ (για τα pop-ups) */
function directFriends(people: DraftPerson[]): InviteProfile[] {
  return people.filter((p) => p.userId && !p.isMe && p.direct).map((p) => ({ id: p.userId!, username: '', display_name: p.name }));
}

/** Pop-up «Φίλοι»: πάνω η λίστα φίλων με +, κάτω η πρόσκληση με − */
function FriendsPopup({ visible, me, onClose }: { visible: boolean; me?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const o = useOuting();
  const q = useFriendships(me);
  const friends = acceptedFriends(q.data, me);
  return (
    <InvitePicker
      visible={visible}
      title={`👥 ${t('wizard.inviteFriends')}`}
      loading={!!me && q.isLoading}
      emptyText={me ? t('invite.noFriends') : t('wizard.signInToInvite')}
      items={friends.map((f) => ({ id: f.id, title: f.display_name, subtitle: `@${f.username}`, emoji: '👤' }))}
      selected={directFriends(o.people).map((f) => f.id)}
      onClose={onClose}
      onConfirm={(ids) => {
        o.setInvites(friends.filter((f) => ids.includes(f.id)), o.invitedGroups, me);
        onClose();
      }}
    />
  );
}

/** Pop-up «Ομάδα»: πάνω οι ομάδες με +, κάτω η πρόσκληση με − */
function GroupsPopup({ visible, me, onClose }: { visible: boolean; me?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const o = useOuting();
  const q = useMyGroups(me);
  const groups = q.data ?? [];
  return (
    <InvitePicker
      visible={visible}
      title={`👪 ${t('wizard.inviteGroupShort')}`}
      loading={!!me && q.isLoading}
      emptyText={me ? t('invite.noGroups') : t('wizard.signInToInvite')}
      items={groups.map((g) => ({
        id: g.id,
        title: g.name,
        subtitle: g.members.length ? g.members.map((m) => m.display_name).join(', ') : t('invite.emptyGroup'),
        emoji: '👪',
      }))}
      selected={o.invitedGroups.map((g) => g.id)}
      onClose={onClose}
      onConfirm={(ids) => {
        o.setInvites(directFriends(o.people), groups.filter((g) => ids.includes(g.id)), me);
        onClose();
      }}
    />
  );
}

/** Λίστα προσκεκλημένων κάτω από τα κουμπιά: ομάδες (με τα μέλη) και μεμονωμένοι φίλοι, με − */
function InvitedList({ me, fixed, onEdit }: { me?: string; fixed?: boolean; onEdit: (which: 'friends' | 'groups') => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const o = useOuting();
  const direct = o.people.filter((p) => p.userId && !p.isMe && p.direct);
  if (!direct.length && !o.invitedGroups.length) return null;

  const rows = [
    ...o.invitedGroups.map((g) => ({
      key: `g:${g.id}`,
      emoji: '👪',
      title: g.name,
      subtitle: g.members.map((m) => m.display_name).join(', ') || t('invite.emptyGroup'),
      edit: 'groups' as const,
      remove: () => o.setInvites(directFriends(o.people), o.invitedGroups.filter((x) => x.id !== g.id), me),
    })),
    ...direct.map((p) => ({
      key: `f:${p.userId}`,
      emoji: '👤',
      title: p.name,
      subtitle: undefined as string | undefined,
      edit: 'friends' as const,
      remove: () => o.setInvites(directFriends(o.people).filter((f) => f.id !== p.userId), o.invitedGroups, me),
    })),
  ];
  const total = o.people.filter((p) => p.userId && !p.isMe).length;

  return (
    <Card style={{ marginBottom: 0 }}>
      <Body style={{ fontWeight: '700', marginBottom: 4 }}>{t('invite.invited', { count: total })}</Body>
      {rows.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Body style={{ fontSize: 20 }}>{r.emoji}</Body>
          <Pressable style={{ flex: 1 }} onPress={() => onEdit(r.edit)} accessibilityRole="button">
            <Body style={{ fontWeight: '600' }}>{r.title}</Body>
            {r.subtitle ? (
              <Body muted style={{ fontSize: 12 }}>
                {r.subtitle}
              </Body>
            ) : null}
          </Pressable>
          <Pressable
            onPress={r.remove}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${t('invite.remove')}: ${r.title}`}
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.chip }}
          >
            <Ionicons name="remove" size={20} color={c.danger} />
          </Pressable>
        </View>
      ))}
      <Body muted style={{ fontSize: 12, marginTop: 4 }}>
        {t(fixed ? 'invite.fixedNote' : 'invite.declareNote')}
      </Body>
    </Card>
  );
}
