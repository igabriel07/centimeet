/**
 * «Πού πάρκαρα;»
 *  - ενότητα στην αρχική: τελευταία θέση (πάτημα → Google Maps) + εικονίδιο ιστορικού + «Πρόσθεσε θέση»
 *  - pop-up προσθήκης: αναζήτηση διεύθυνσης, πινέζα στον χάρτη, η τοποθεσία μου
 *  - λίστα θέσεων (pop-up ιστορικού και καρτέλα «Στάθμευση» στο Ιστορικό)
 */
import type { CityId, ParkedSpot, ResolvedPlace } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { currentPlace, LocationDeniedError } from '@/lib/myLocation';
import { openInGoogleMaps, useParking } from '@/lib/parking';
import { useAddressSearch } from '@/lib/useAddressSearch';
import { useOuting } from '@/store/outing';
import { radius, space, typeScale } from '@/theme';
import { AddressResults } from './AddressResults';
import { MapPicker } from './MapPicker';
import { Sheet } from './Sheet';
import { AppText as Text, Input, useTheme } from './ui';

/** Πόσες θέσεις δείχνει το pop-up της αρχικής· οι υπόλοιπες στο Ιστορικό → Στάθμευση */
const POPUP_MAX = 4;

type IconName = ComponentProps<typeof Ionicons>['name'];

/** «Κυρ 15 Νοε, 14:30» στη γλώσσα της εφαρμογής */
export function useFormatWhen() {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : 'el-GR';
  return (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
}

/** Ενότητα της αρχικής, πάνω από τις καρτέλες */
/** Παρατεταμένο πάτημα → αντιγραφή διεύθυνσης· `copied` = id της θέσης που μόλις αντιγράφηκε (για 1,5″) */
function useCopySpot() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = (s: ParkedSpot) => {
    Clipboard.setStringAsync(s.address || s.name)
      .then(() => {
        setCopied(s.id);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => {});
  };
  return { copied, copy };
}

const COLLAPSED_KEY = 'centimeet.parking.collapsed';

/** Μαζεμένο/ανοιχτό «Πού πάρκαρα;» — το θυμάται η συσκευή */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(COLLAPSED_KEY)
      .then((v) => setCollapsed(v === '1'))
      .catch(() => {});
  }, []);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsed((v) => {
      AsyncStorage.setItem(COLLAPSED_KEY, v ? '0' : '1').catch(() => {});
      return !v;
    });
  };
  return [collapsed, toggle] as const;
}

export function ParkingSection() {
  const { t } = useTranslation();
  const c = useTheme();
  const when = useFormatWhen();
  const parking = useParking();
  const city = useOuting((s) => s.city);
  const [open, setOpen] = useState<'add' | 'map' | 'history' | null>(null);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const { copied, copy } = useCopySpot();

  async function save(p: ResolvedPlace) {
    try {
      await parking.add({
        lat: p.location.lat,
        lng: p.location.lng,
        name: p.name,
        address: p.address,
      });
      setOpen(null);
    } catch {
      Alert.alert(t('common.error'), t('parking.saveFailed'));
    }
  }

  const last = parking.last;
  return (
    <View style={[st.section, { borderTopColor: c.border, backgroundColor: c.bg }]}>
      {/* Διακριτική λαβή + τίτλος: πάτημα → μαζεύει (μένει μόνο ο τίτλος) / ανοίγει */}
      <Pressable
        onPress={toggleCollapsed}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        accessibilityLabel={t(collapsed ? 'parking.expand' : 'parking.collapse')}
        hitSlop={{ top: 8 }}
      >
        <View style={st.handleArea}>
          <View style={[st.handle, { backgroundColor: c.border }]} />
        </View>
        <Text
          style={{
            color: c.text,
            fontSize: typeScale.title,
            fontWeight: '700',
          }}
        >
          🅿️ {t('parking.title')}
        </Text>
      </Pressable>

      {collapsed ? null : (
        <>
          {/* Τελευταία θέση + ιστορικό τέρμα δεξιά */}
          <View style={st.lastRow}>
            {last ? (
              <Pressable
                onPress={() => openInGoogleMaps(last)}
                onLongPress={() => copy(last)}
                accessibilityRole="link"
                accessibilityHint={t('parking.openMapsOrCopy')}
                style={({ pressed }) => [st.last, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="location" size={20} color={c.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.primary, fontWeight: '600' }} numberOfLines={1}>
                    {last.name}
                  </Text>
                  {copied === last.id ? (
                    <Text style={{ color: c.good, fontSize: typeScale.small, fontWeight: '600' }}>{t('parking.copied')}</Text>
                  ) : (
                    <Text style={{ color: c.muted, fontSize: typeScale.small }} numberOfLines={1}>
                      {[last.address, when(last.savedAt)].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
                <Ionicons name="open-outline" size={16} color={c.muted} />
              </Pressable>
            ) : (
              <Text style={{ color: c.muted, flex: 1 }}>{parking.loading ? '' : t('parking.none')}</Text>
            )}
            <IconButton icon="time-outline" label={t('parking.history')} onPress={() => setOpen('history')} />
          </View>

          <Pressable
            onPress={() => setOpen('add')}
            accessibilityRole="button"
            style={({ pressed }) => [
              st.addBtn,
              {
                borderColor: c.primary,
                backgroundColor: pressed ? c.chip : 'transparent',
              },
            ]}
          >
            <Ionicons name="add" size={20} color={c.primary} />
            <Text style={{ color: c.primary, fontWeight: '600' }}>{t('parking.add')}</Text>
          </Pressable>
        </>
      )}

      <AddParkingSheet
        visible={open === 'add'}
        city={city}
        saving={parking.saving}
        onClose={() => setOpen(null)}
        onPick={save}
        // Το MapPicker είναι δικό του (πλήρους οθόνης) modal: κλείνουμε πρώτα αυτό
        onOpenMap={() => setOpen('map')}
      />
      <MapPicker
        visible={open === 'map'}
        city={city}
        initial={
          last
            ? {
                placeId: last.id,
                name: last.name,
                address: last.address,
                location: last,
              }
            : undefined
        }
        label={t('parking.mapLabel')}
        onClose={() => setOpen('add')}
        onConfirm={save}
      />
      <Sheet
        visible={open === 'history'}
        title={t('parking.history')}
        onClose={() => setOpen(null)}
        footer={
          parking.spots.length > POPUP_MAX ? (
            // «•••» → όλο το ιστορικό (το κείμενο μένει για τους αναγνώστες οθόνης)
            <Pressable
              onPress={() => {
                setOpen(null);
                router.push({ pathname: '/history', params: { tab: 'parking' } });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('parking.seeAll', { count: parking.spots.length })}
              hitSlop={8}
              style={({ pressed }) => [st.more, { opacity: pressed ? 0.5 : 1 }]}
            >
              <Ionicons name="ellipsis-horizontal" size={30} color={c.primary} />
            </Pressable>
          ) : undefined
        }
      >
        <ParkingList spots={parking.spots.slice(0, POPUP_MAX)} onRemove={parking.remove} />
      </Sheet>
    </View>
  );
}

/** Pop-up: αναζήτηση διεύθυνσης / πινέζα στον χάρτη / η τοποθεσία μου */
function AddParkingSheet({
  visible,
  city,
  saving,
  onClose,
  onPick,
  onOpenMap,
}: {
  visible: boolean;
  city: CityId;
  saving: boolean;
  onClose: () => void;
  onPick: (p: ResolvedPlace) => void;
  onOpenMap: () => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const search = useAddressSearch(city);
  const [locating, setLocating] = useState(false);

  async function myLocation() {
    setLocating(true);
    try {
      // Κενό όνομα αν δεν βρεθεί διεύθυνση → αποθηκεύονται οι συντεταγμένες (χρήσιμο στο ιστορικό)
      onPick(await currentPlace(''));
    } catch (e) {
      if (e instanceof LocationDeniedError) Alert.alert(t('place.permissionTitle'), t('place.permissionBody'));
      else Alert.alert(t('common.error'), t('place.locationFailed'));
    } finally {
      setLocating(false);
    }
  }

  return (
    <Sheet visible={visible} title={t('parking.addTitle')} onClose={onClose}>
      <View style={{ gap: space.sm }}>
        <Input
          value={search.query}
          onChangeText={search.setQuery}
          placeholder={t('parking.searchPlaceholder')}
          autoCorrect={false}
          returnKeyType="search"
        />
        <AddressResults
          results={search.results}
          loading={search.loading}
          error={search.error}
          query={search.query}
          onPick={async (s) => {
            const p = await search.pick(s);
            if (p) onPick(p);
          }}
        />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <OptionButton icon="pin-outline" label={t('parking.onMap')} onPress={onOpenMap} />
          <OptionButton
            icon="locate"
            label={locating ? t('parking.locating') : t('parking.myLocation')}
            busy={locating}
            onPress={myLocation}
          />
        </View>
        {saving ? <ActivityIndicator /> : null}
        <Text
          style={{
            color: c.muted,
            fontSize: typeScale.small,
            textAlign: 'center',
          }}
        >
          {t('parking.onDevice')}
        </Text>
      </View>
    </Sheet>
  );
}

/** Λίστα θέσεων: πάτημα → Google Maps, κάδος → διαγραφή */
export function ParkingList({ spots, onRemove }: { spots: ParkedSpot[]; onRemove: (id: string) => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  const when = useFormatWhen();
  const { copied, copy } = useCopySpot();
  if (!spots.length) return <Text style={{ color: c.muted, textAlign: 'center', padding: space.lg }}>{t('parking.historyEmpty')}</Text>;
  return (
    <View>
      {spots.map((s, i) => (
        <View key={s.id} style={[st.item, { borderTopColor: c.border, borderTopWidth: i ? 1 : 0 }]}>
          <Pressable
            onPress={() => openInGoogleMaps(s)}
            onLongPress={() => copy(s)}
            accessibilityRole="link"
            accessibilityHint={t('parking.openMapsOrCopy')}
            style={({ pressed }) => [
              {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name="location-outline" size={20} color={c.primary} />
            {/* Στο ιστορικό ολόκληρο το κείμενο (χωρίς κόψιμο) */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>{s.name}</Text>
              {s.address && s.address !== s.name ? <Text style={{ color: c.muted, fontSize: typeScale.small }}>{s.address}</Text> : null}
              {copied === s.id ? (
                <Text style={{ color: c.good, fontSize: typeScale.small, fontWeight: '600' }}>{t('parking.copied')}</Text>
              ) : (
                <Text style={{ color: c.muted, fontSize: typeScale.small }}>🕒 {when(s.savedAt)}</Text>
              )}
            </View>
          </Pressable>
          <IconButton icon="trash-outline" label={t('parking.delete')} onPress={() => onRemove(s.id)} muted />
        </View>
      ))}
    </View>
  );
}

function IconButton({ icon, label, onPress, muted }: { icon: IconName; label: string; onPress: () => void; muted?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [st.iconBtn, { backgroundColor: pressed ? c.chip : 'transparent' }]}
    >
      <Ionicons name={icon} size={muted ? 20 : 24} color={muted ? c.muted : c.text} />
    </Pressable>
  );
}

function OptionButton({ icon, label, onPress, busy }: { icon: IconName; label: string; onPress: () => void; busy?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [st.option, { borderColor: c.border, backgroundColor: pressed ? c.chip : c.card }]}
    >
      {busy ? <ActivityIndicator size="small" /> : <Ionicons name={icon} size={22} color={c.primary} />}
      <Text
        style={{
          color: c.text,
          fontWeight: '600',
          fontSize: typeScale.small,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: space.md,
    borderTopWidth: 1,
    gap: space.sm,
  },
  more: { alignSelf: 'stretch', height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  handleArea: { alignItems: 'center', paddingTop: 6, paddingBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
  },
  last: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 10,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
