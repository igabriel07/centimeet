import { CITY_CONFIG, type CityId, type LatLng, type ResolvedPlace } from '@centimeet/shared';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Keyboard, Modal, Pressable, StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAddressSearch } from '@/lib/useAddressSearch';
import { AddressResults } from './AddressResults';
import { AppText as Text, Button, Input, useTheme } from './ui';

const ZOOMED = { latitudeDelta: 0.006, longitudeDelta: 0.006 };
const CITY_ZOOM = { latitudeDelta: 0.15, longitudeDelta: 0.15 };

/**
 * Επιλογή αφετηρίας στον χάρτη (όπως στα apps ταξί):
 * μετακινείς τον χάρτη, το pin μένει στο κέντρο και η διεύθυνση ενημερώνεται αυτόματα.
 * Πάνω υπάρχει και ζωντανή αναζήτηση διεύθυνσης.
 */
export function MapPicker({
  visible,
  city,
  initial,
  title,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  city: CityId;
  initial?: ResolvedPlace;
  title?: string;
  onClose: () => void;
  onConfirm: (place: ResolvedPlace) => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const mapRef = useRef<MapView>(null);
  const search = useAddressSearch(city);
  const [place, setPlace] = useState<ResolvedPlace | undefined>(initial);
  const [resolving, setResolving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [locating, setLocating] = useState(false);
  /** Όταν μετακινούμε τον χάρτη από αναζήτηση, έχουμε ήδη τη διεύθυνση – όχι reverse */
  const skipNextReverse = useRef(false);
  const reverseCtrl = useRef<AbortController | null>(null);

  const start: LatLng = initial?.location ?? CITY_CONFIG[city].center;

  useEffect(() => {
    if (visible) {
      setPlace(initial);
      search.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function moveTo(loc: LatLng) {
    mapRef.current?.animateToRegion({ latitude: loc.lat, longitude: loc.lng, ...ZOOMED }, 400);
  }

  async function onRegionChangeComplete(r: Region) {
    setDragging(false);
    const loc = { lat: r.latitude, lng: r.longitude };
    if (skipNextReverse.current) {
      skipNextReverse.current = false;
      return;
    }
    reverseCtrl.current?.abort();
    const ctrl = new AbortController();
    reverseCtrl.current = ctrl;
    setResolving(true);
    try {
      const p = await api.reverse(loc, ctrl.signal);
      if (!ctrl.signal.aborted) setPlace({ ...p, location: loc });
    } catch {
      if (!ctrl.signal.aborted) setPlace({ placeId: 'coords', name: t('place.pinnedPoint'), location: loc });
    } finally {
      if (!ctrl.signal.aborted) setResolving(false);
    }
  }

  async function pickResult(s: Parameters<typeof search.pick>[0]) {
    Keyboard.dismiss();
    const p = await search.pick(s);
    setPlace(p);
    skipNextReverse.current = true;
    moveTo(p.location);
  }

  async function goToMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      moveTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); // το reverse γίνεται στο onRegionChangeComplete
    } finally {
      setLocating(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={{ latitude: start.lat, longitude: start.lng, ...(initial ? ZOOMED : CITY_ZOOM) }}
          onRegionChange={() => !dragging && setDragging(true)}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
        />

        {/* Pin σταθερό στο κέντρο της οθόνης – η μύτη του δείχνει το σημείο */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <View style={[styles.pin, { transform: [{ translateY: dragging ? -10 : 0 }] }]}>
            <View style={[styles.pinHead, { backgroundColor: c.primary }]}>
              <View style={styles.pinDot} />
            </View>
            <View style={[styles.pinStem, { backgroundColor: c.primary }]} />
          </View>
          <View style={[styles.pinShadow, { opacity: dragging ? 0.15 : 0.3 }]} />
        </View>

        {/* Πάνω: κλείσιμο + αναζήτηση */}
        <SafeAreaView edges={['top']} style={styles.top}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Pressable onPress={onClose} hitSlop={10} style={[styles.roundBtn, { backgroundColor: c.card }]} accessibilityLabel={t('common.back')}>
              <Text style={{ fontSize: 18, color: c.text }}>✕</Text>
            </Pressable>
            <Input
              style={{ flex: 1, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 }}
              value={search.query}
              onChangeText={search.setQuery}
              placeholder={title ?? t('wizard.searchAddress')}
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <View style={{ marginTop: 6, marginLeft: 48 }}>
            <AddressResults
              results={search.results}
              loading={search.loading}
              error={search.error}
              query={search.query}
              onPick={pickResult}
            />
          </View>
        </SafeAreaView>

        {/* Κάτω: διεύθυνση + επιβεβαίωση */}
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: c.card }]}>
          <Pressable
            onPress={goToMyLocation}
            style={[styles.roundBtn, styles.locateBtn, { backgroundColor: c.card }]}
            accessibilityLabel={t('wizard.myLocation')}
          >
            {locating ? <ActivityIndicator size="small" /> : <Text style={{ fontSize: 20 }}>◎</Text>}
          </Pressable>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{t('place.startingPoint')}</Text>
          <View style={{ minHeight: 44, justifyContent: 'center', marginVertical: 6 }}>
            {resolving || dragging ? (
              <ActivityIndicator style={{ alignSelf: 'flex-start' }} />
            ) : place ? (
              <>
                <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
                  {place.name}
                </Text>
                {place.address && place.address !== place.name ? (
                  <Text style={{ color: c.muted }} numberOfLines={1}>
                    {place.address}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: c.muted }}>{t('place.moveMap')}</Text>
            )}
          </View>
          <Button
            title={t('place.confirm')}
            disabled={!place || resolving || dragging}
            onPress={() => place && onConfirm(place)}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const PIN = 34;
const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, paddingTop: 8 },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  locateBtn: { position: 'absolute', right: 16, top: -56 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  // Το κάτω άκρο του pin (μύτη) πέφτει ακριβώς στο κέντρο του χάρτη
  pinWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -PIN / 2, marginTop: -(PIN + 14), alignItems: 'center', width: PIN },
  pin: { alignItems: 'center' },
  pinHead: { width: PIN, height: PIN, borderRadius: PIN / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  pinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  pinStem: { width: 4, height: 14, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { width: 14, height: 5, borderRadius: 7, backgroundColor: '#000', marginTop: -2 },
});
