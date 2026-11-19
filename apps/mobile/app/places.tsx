/** ⭐ Αποθηκευμένες διευθύνσεις: λίστα, προσθήκη, μετονομασία, διαγραφή */
import { CITIES, SAVED_PLACES_MAX, type CityId, type ResolvedPlace, type SavedPlace } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { PlaceSearch } from '@/components/PlaceSearch';
import { SavePlaceSheet } from '@/components/SavedPlaces';
import { AppText as Text, Body, Button, Card, Chip, Label, Row, Screen, useTheme } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useSavedPlaceActions, useSavedPlaces } from '@/lib/savedPlaces';
import { useOuting } from '@/store/outing';

export default function SavedPlacesScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const { session } = useAuth();
  const saved = useSavedPlaces();
  const { remove } = useSavedPlaceActions();
  const [city, setCity] = useState<CityId>(useOuting.getState().city);
  const [adding, setAdding] = useState(false);
  /** Νέα διεύθυνση που διαλέχτηκε → pop-up ονόματος */
  const [picked, setPicked] = useState<ResolvedPlace | undefined>();
  const [editing, setEditing] = useState<SavedPlace | undefined>();
  const list = saved.data ?? [];
  const full = list.length >= SAVED_PLACES_MAX;

  if (!session) {
    return (
      <Screen>
        <View style={{ padding: 20 }}>
          <Body muted>{t('saved.needAccount')}</Body>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Body muted>{t('saved.intro')}</Body>

        {saved.isLoading ? <ActivityIndicator style={{ marginTop: 24 }} color={c.primary} /> : null}
        {!saved.isLoading && !list.length ? (
          <Card style={{ marginTop: 16, alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 32 }}>⭐</Text>
            <Body muted style={{ textAlign: 'center', marginTop: 6 }}>
              {t('saved.empty')}
            </Body>
          </Card>
        ) : null}

        <View style={{ marginTop: 16 }}>
          {list.map((s) => (
            <Card key={s.id} onPress={() => setEditing(s)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontSize: 24 }}>{s.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{s.label}</Text>
                  <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={2}>
                    {s.address ?? s.name}
                  </Text>
                </View>
                <Pressable
                  onPress={() => remove.mutate(s.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('saved.delete')}: ${s.label}`}
                >
                  <Ionicons name="trash-outline" size={20} color={c.danger} />
                </Pressable>
              </View>
            </Card>
          ))}
        </View>

        {adding ? (
          <View>
            <Label>{t('saved.newAddress')}</Label>
            <Row style={{ marginBottom: 10 }}>
              {CITIES.map((ct) => (
                <Chip key={ct} label={t(`city.${ct}`)} selected={city === ct} onPress={() => setCity(ct)} />
              ))}
            </Row>
            <PlaceSearch key={`${city}:${list.length}`} city={city} onSelect={setPicked} showSaved={false} />
            <View style={{ marginTop: 10 }}>
              <Button variant="secondary" title={t('common.cancel')} onPress={() => setAdding(false)} />
            </View>
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            <Button title={`＋ ${t('saved.addNew')}`} onPress={() => setAdding(true)} disabled={full || saved.isLoading} />
            {full ? <Body muted style={{ marginTop: 6, textAlign: 'center' }}>{t('saved.full', { n: SAVED_PLACES_MAX })}</Body> : null}
          </View>
        )}
      </ScrollView>

      <SavePlaceSheet
        visible={!!picked}
        place={picked}
        onClose={() => setPicked(undefined)}
        onSaved={() => setAdding(false)}
      />
      <SavePlaceSheet visible={!!editing} existing={editing} onClose={() => setEditing(undefined)} />
    </Screen>
  );
}
