import type { CityId, ResolvedPlace } from '@centimeet/shared';
import * as Location from 'expo-location';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '@/lib/api';
import { useAddressSearch } from '@/lib/useAddressSearch';
import { AddressResults } from './AddressResults';
import { MapPicker } from './MapPicker';
import { AppText as Text, Chip, Input, useTheme } from './ui';

/**
 * Αφετηρία ενός ατόμου:
 *  - ζωντανή αναζήτηση διεύθυνσης καθώς πληκτρολογείς
 *  - 📍 τρέχουσα τοποθεσία (με πραγματική διεύθυνση)
 *  - 🗺️ επιλογή στον χάρτη με pin
 * Μόλις επιλεγεί, φαίνεται μικρός χάρτης· πάτημα πάνω του = αλλαγή στον χάρτη.
 */
export function PlaceSearch({
  city,
  value,
  personName,
  onSelect,
}: {
  city: CityId;
  value?: ResolvedPlace;
  personName?: string;
  onSelect: (place: ResolvedPlace) => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const search = useAddressSearch(city);
  const [mapOpen, setMapOpen] = useState(false);
  const [editing, setEditing] = useState(!value);
  const [locating, setLocating] = useState(false);

  function select(p: ResolvedPlace) {
    onSelect(p);
    setEditing(false);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('place.permissionTitle'), t('place.permissionBody'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const place = await api.reverse(loc).catch(() => null);
      select({
        placeId: place?.placeId ?? 'me',
        name: place?.name ?? t('wizard.myLocation'),
        address: place?.address,
        location: loc,
      });
    } catch {
      Alert.alert(t('common.error'), t('place.locationFailed'));
    } finally {
      setLocating(false);
    }
  }

  const picker = (
    <MapPicker
      visible={mapOpen}
      city={city}
      initial={value}
      title={personName ? t('place.whereIs', { name: personName }) : undefined}
      onClose={() => setMapOpen(false)}
      onConfirm={(p) => {
        setMapOpen(false);
        select(p);
      }}
    />
  );

  // Επιλεγμένη αφετηρία: μικρός χάρτης + διεύθυνση
  if (value && !editing) {
    return (
      <View>
        <Pressable onPress={() => setMapOpen(true)} style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
          <View pointerEvents="none">
            <MapView
              style={{ height: 120 }}
              liteMode={Platform.OS === 'android'}
              region={{ latitude: value.location.lat, longitude: value.location.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
            >
              <Marker coordinate={{ latitude: value.location.lat, longitude: value.location.lng }} pinColor={c.primary} />
            </MapView>
          </View>
          <View style={{ padding: 10, backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16 }}>📍</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                {value.name}
              </Text>
              {value.address && value.address !== value.name ? (
                <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>
                  {value.address}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => setEditing(true)} hitSlop={8}>
              <Text style={{ color: c.primary, fontWeight: '600' }}>{t('place.change')}</Text>
            </Pressable>
          </View>
        </Pressable>
        {picker}
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Input
        value={search.query}
        onChangeText={search.setQuery}
        placeholder={t('wizard.searchAddress')}
        autoCorrect={false}
        returnKeyType="search"
      />
      <AddressResults
        results={search.results}
        loading={search.loading}
        error={search.error}
        query={search.query}
        onPick={async (s) => select(await search.pick(s))}
      />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip label={locating ? t('common.loading') : t('wizard.myLocation')} onPress={useMyLocation} />
        <Chip label={t('place.onMap')} onPress={() => setMapOpen(true)} />
        {value ? <Chip label={t('common.cancel')} onPress={() => setEditing(false)} /> : null}
      </View>
      {picker}
    </View>
  );
}
