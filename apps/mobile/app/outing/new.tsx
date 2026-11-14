import { ACTIVITIES, CITIES, MAX_PARTICIPANTS, TRANSPORT_MODES } from '@centimeet/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { FriendPicker } from '@/components/FriendPicker';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Body, Button, Card, Chip, Input, Label, Row, Screen, useTheme } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { createOuting, errorMessage, outingKeys } from '@/lib/outings';
import { toParticipants, toSaveInput, useOuting } from '@/store/outing';

/**
 * Οδηγός νέας εξόδου σε μία οθόνη:
 * 1. δραστηριότητα & πόλη  2. ώρα (προαιρετική)  3. άτομα: όνομα, αφετηρία, μέσο
 * Με λογαριασμό: φίλοι από τη λίστα (δηλώνουν μόνοι τους) + «Αποθήκευση & πρόσκληση».
 */
export default function NewOuting() {
  const { t } = useTranslation();
  const c = useTheme();
  const o = useOuting();
  const qc = useQueryClient();
  const { session } = useAuth();
  const me = session?.user.id;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasFriends = o.people.some((p) => p.userId);

  const whenOptions = [
    { key: 'now', label: t('wizard.now'), iso: undefined },
    { key: '1h', label: t('wizard.inOneHour'), iso: new Date(Date.now() + 3600_000).toISOString() },
    {
      key: 'tonight',
      label: t('wizard.tonight'),
      iso: (() => {
        const d = new Date();
        d.setHours(21, 0, 0, 0);
        if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
        return d.toISOString();
      })(),
    },
  ];
  const [whenKey, setWhenKey] = useState('now');

  async function find() {
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

  async function save() {
    const input = toSaveInput(o.people);
    if (!input.ok) {
      Alert.alert(t(input.error === 'needMe' ? 'wizard.needMe' : 'wizard.missingGuests'));
      return;
    }
    setSaving(true);
    try {
      const id = await createOuting({ activity: o.activity, city: o.city, meetAt: o.departAt, ...input });
      qc.invalidateQueries({ queryKey: outingKeys.mine });
      o.reset();
      router.replace(`/outing/${id}`);
    } catch (e) {
      Alert.alert(t('common.error'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: me && !hasFriends ? 190 : 120 }} keyboardShouldPersistTaps="handled">
          <Label>{t('wizard.whatFor')}</Label>
          <Row>
            {ACTIVITIES.map((a) => (
              <Chip key={a} label={t(`activity.${a}`)} selected={o.activity === a} onPress={() => o.setActivity(a)} />
            ))}
          </Row>

          <Label>{t('wizard.city')}</Label>
          <Row>
            {CITIES.map((ct) => (
              <Chip key={ct} label={t(`city.${ct}`)} selected={o.city === ct} onPress={() => o.setCity(ct)} />
            ))}
          </Row>

          <Label>{t('wizard.when')}</Label>
          <Row>
            {whenOptions.map((w) => (
              <Chip
                key={w.key}
                label={w.label}
                selected={whenKey === w.key}
                onPress={() => {
                  setWhenKey(w.key);
                  o.setDepartAt(w.iso);
                }}
              />
            ))}
          </Row>

          <Label>{t('wizard.people')}</Label>
          {o.people.map((p, i) => {
            const removeBtn =
              o.people.length > 2 ? (
                <Pressable onPress={() => o.removePerson(p.id)} hitSlop={10} accessibilityLabel="remove">
                  <Body muted style={{ fontSize: 20 }}>✕</Body>
                </Pressable>
              ) : null;

            if (p.userId) {
              return (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Body style={{ flex: 1, fontWeight: '700', fontSize: 17 }}>👤 {p.name}</Body>
                    {removeBtn}
                  </View>
                  <Body muted style={{ marginTop: 6 }}>{t('wizard.friendWillDeclare')}</Body>
                </Card>
              );
            }

            return (
              <Card key={p.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Input
                    style={{ flex: 1 }}
                    value={p.name}
                    onChangeText={(name) => o.updatePerson(p.id, { name })}
                    placeholder={`${t('wizard.personName')} ${i + 1}`}
                  />
                  {me ? <Chip label={t('wizard.thisIsMe')} selected={!!p.isMe} onPress={() => o.setMe(p.id)} /> : null}
                  {removeBtn}
                </View>

                <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('wizard.from')}</Body>
                <PlaceSearch
                  city={o.city}
                  personName={p.name.trim() || undefined}
                  value={p.originPlace}
                  onSelect={(pl) => o.updatePerson(p.id, { origin: pl.location, originPlace: pl })}
                />

                <Body muted style={{ marginTop: 12, marginBottom: 6 }}>{t('wizard.how')}</Body>
                <Row>
                  {TRANSPORT_MODES.map((m) => (
                    <Chip key={m} label={t(`mode.${m}`)} selected={p.mode === m} onPress={() => o.updatePerson(p.id, { mode: m })} />
                  ))}
                </Row>
              </Card>
            );
          })}
          {o.people.length < MAX_PARTICIPANTS ? (
            <View style={{ gap: 8 }}>
              {me ? <Button variant="secondary" title={t('wizard.friendsFromList')} onPress={() => setPickerOpen(true)} /> : null}
              <Button variant="secondary" title={t('wizard.addPerson')} onPress={() => o.addPerson()} />
            </View>
          ) : null}
        </ScrollView>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: c.bg }}>
          {!hasFriends ? <Button title={t('wizard.find')} onPress={find} loading={loading} /> : null}
          {me ? (
            <Button variant={hasFriends ? 'primary' : 'secondary'} title={t('wizard.saveInvite')} onPress={save} loading={saving} />
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {me ? (
        <FriendPicker
          visible={pickerOpen}
          me={me}
          exclude={o.people.flatMap((p) => (p.userId ? [p.userId] : []))}
          onClose={() => setPickerOpen(false)}
          onConfirm={(friends) => {
            o.addFriends(friends);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
