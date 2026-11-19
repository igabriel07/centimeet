import { CITY_CONFIG, inServiceArea, type CityId, type ResolvedPlace } from '@centimeet/shared';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { currentPlace, LocationDeniedError } from '@/lib/myLocation';
import { useAddressSearch } from '@/lib/useAddressSearch';
import { AddressResults } from './AddressResults';
import { MapPicker } from './MapPicker';
import { useSavedPlaces } from '@/lib/savedPlaces';
import { FavoriteStar, SavedDropdown, SavedDropdownToggle } from './SavedPlaces';
import { AppText as Text, Chip, Input, useTheme } from './ui';

/**
 * Αφετηρία ενός ατόμου:
 *  - ζωντανή αναζήτηση διεύθυνσης καθώς πληκτρολογείς
 *  - 📍 τρέχουσα τοποθεσία (με πραγματική διεύθυνση)
 *  - 🗺️ επιλογή στον χάρτη με pin
 *  - ⭐ αποθηκευμένες διευθύνσεις (γρήγορα chips) + ☆ για αποθήκευση της επιλεγμένης
 * Μόλις επιλεγεί, φαίνεται μικρός χάρτης· πάτημα πάνω του = αλλαγή στον χάρτη.
 */
export function PlaceSearch({
  city,
  value,
  personName,
  onSelect,
  showSaved = true,
}: {
  city: CityId;
  value?: ResolvedPlace;
  personName?: string;
  onSelect: (place: ResolvedPlace) => void;
  /** ⭐ chips αποθηκευμένων (όχι στη σελίδα διαχείρισής τους) */
  showSaved?: boolean;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const search = useAddressSearch(city);
  const [mapOpen, setMapOpen] = useState(false);
  const [editing, setEditing] = useState(!value);
  const [locating, setLocating] = useState(false);
  /** ▾ Drop-down αποθηκευμένων διευθύνσεων */
  const [savedOpen, setSavedOpen] = useState(false);
  // Το drop-down ανοίγει σε διάφανο Modal στη θέση του κουτιού: πάτημα οπουδήποτε αλλού → κλείνει
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const { height: screenH } = useWindowDimensions();
  const savedCount = useSavedPlaces().data?.length ?? 0;
  const toggleSaved = () => {
    if (savedOpen) return setSavedOpen(false);
    anchor.current?.measureInWindow((x, y, w, h) => {
      setRect({ x, y, w, h });
      setSavedOpen(true);
    });
  };
  // Αν δεν χωράει από κάτω, ανοίγει προς τα πάνω
  const menuH = 40 + savedCount * 56 + 44;
  const below = !rect || rect.y + rect.h + 6 + menuH < screenH - 16;

  function select(p: ResolvedPlace) {
    onSelect(p);
    setEditing(false);
    setSavedOpen(false);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      select(await currentPlace(t('wizard.myLocation')));
    } catch (e) {
      if (e instanceof LocationDeniedError) Alert.alert(t('place.permissionTitle'), t('place.permissionBody'));
      else Alert.alert(t('common.error'), t('place.locationFailed'));
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
            <FavoriteStar place={value} />
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
      <View ref={anchor} collapsable={false}>
        <Input
          value={search.query}
          onChangeText={search.setQuery}
          placeholder={t('wizard.searchAddress')}
          autoCorrect={false}
          returnKeyType="search"
          style={showSaved ? { paddingRight: 44 } : undefined}
        />
        {showSaved ? <SavedDropdownToggle open={savedOpen} onPress={toggleSaved} /> : null}
      </View>
      {showSaved && savedOpen && rect ? (
        <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => setSavedOpen(false)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSavedOpen(false)} accessibilityLabel="close" />
          <View
            style={{
              position: 'absolute',
              left: rect.x,
              width: rect.w,
              ...(below ? { top: rect.y + rect.h + 6 } : { bottom: screenH - rect.y + 6 }),
            }}
          >
            <SavedDropdown onPick={select} onClose={() => setSavedOpen(false)} />
          </View>
        </Modal>
      ) : null}
      <AddressResults
        results={search.results}
        loading={search.loading}
        error={search.error}
        query={search.query}
        onPick={async (s) => {
          const p = await search.pick(s);
          if (p) select(p);
        }}
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

/** Η αφετηρία είναι έξω από την πόλη/τον νομό; (τότε δεν μπαίνει στο δίκαιο σημείο) */
export const outsideArea = (city: CityId, place?: ResolvedPlace) => !!place && !inServiceArea(city, place.location);

/** ⚠️ «Η διεύθυνση είναι εκτός Αττικής» */
export function OutOfAreaNote({ city, place }: { city: CityId; place?: ResolvedPlace }) {
  const { t } = useTranslation();
  const c = useTheme();
  if (!outsideArea(city, place)) return null;
  return (
    <Text style={{ color: c.danger, fontWeight: '600', marginTop: 8 }}>
      ⚠️ {t('place.outsideArea', { region: CITY_CONFIG[city].region.label })}
    </Text>
  );
}
