import { ACTIVITIES, CITIES, TRANSPORT_MODES } from '@centimeet/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Body, Button, Card, Chip, Input, Label, Row, Screen, useTheme } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { toParticipants, useOuting } from '@/store/outing';

/**
 * Οδηγός νέας εξόδου σε μία οθόνη:
 * 1. δραστηριότητα & πόλη  2. ώρα (προαιρετική)  3. άτομα: όνομα, αφετηρία, μέσο
 */
export default function NewOuting() {
  const { t } = useTranslation();
  const c = useTheme();
  const o = useOuting();
  const [loading, setLoading] = useState(false);

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

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
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
          {o.people.map((p, i) => (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Input
                  style={{ flex: 1 }}
                  value={p.name}
                  onChangeText={(name) => o.updatePerson(p.id, { name })}
                  placeholder={`${t('wizard.personName')} ${i + 1}`}
                />
                {o.people.length > 2 ? (
                  <Pressable onPress={() => o.removePerson(p.id)} hitSlop={10} accessibilityLabel="remove">
                    <Body muted style={{ fontSize: 20 }}>✕</Body>
                  </Pressable>
                ) : null}
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
          ))}
          {o.people.length < 12 ? <Button variant="secondary" title={t('wizard.addPerson')} onPress={() => o.addPerson()} /> : null}
        </ScrollView>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: c.bg }}>
          <Button title={t('wizard.find')} onPress={find} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
