import { isVenueActivity, type ScoredVenue, type SuggestionArea } from '@centimeet/shared';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { PeopleLegend, PersonMarkers, type MapPerson } from '@/components/PeopleOnMap';
import { Body, Button, Card, Label, Row, Screen, useResponsive, useTheme } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { toParticipants, useOuting } from '@/store/outing';

/** Λίστα προτάσεων. Σε tablet: λίστα αριστερά, χάρτης δεξιά. */
export default function Results() {
  const { t } = useTranslation();
  const { isTablet } = useResponsive();
  const c = useTheme();
  const { suggestions, people, activity } = useOuting();
  const mapRef = useRef<ComponentRef<typeof MapView>>(null);

  if (!suggestions) return <Screen />;
  const primaryArea = suggestions.areas.find((a) => a.isPrimary);
  if (!primaryArea) {
    return (
      <Screen>
        <Body muted style={{ padding: 16 }}>{t('results.empty')}</Body>
      </Screen>
    );
  }
  const isSpot = !isVenueActivity(activity);
  const altAreas = suggestions.areas.filter((a) => !a.isPrimary);
  const all = [...suggestions.primary, ...suggestions.alternatives];
  const notices = suggestions.notices ?? {};

  const list = isSpot ? (
    <SpotList areas={suggestions.areas} estimated={!!notices.estimatedTimes} />
  ) : (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {notices.estimatedTimes || notices.basicVenues ? (
        <Card>
          {notices.estimatedTimes ? <Body muted>ℹ️ {t('results.estimatedTimes')}</Body> : null}
          {notices.basicVenues ? <Body muted>ℹ️ {t('results.basicVenues')}</Body> : null}
        </Card>
      ) : null}
      {suggestions.primary.length === 0 ? <Body muted>{t('results.empty')}</Body> : null}
      {suggestions.primary.length ? <Label>{`${t('results.primary')} · ${primaryArea.label}`}</Label> : null}
      {suggestions.primary.length ? (
        <Body muted style={{ marginBottom: 10 }}>
          {t('results.areaSummary', { min: primaryArea.minMin, max: primaryArea.maxMin, radius: primaryArea.radiusM })}
        </Body>
      ) : null}
      {suggestions.primary.map((s) => (
        <VenueCard key={s.venue.id} s={s} groupSize={people.length} />
      ))}
      {altAreas.length ? <Label>{t('results.alternatives')}</Label> : null}
      {altAreas.map((a) => (
        <View key={a.id} style={{ marginBottom: 8 }}>
          <Body style={{ fontWeight: '700', marginBottom: 6 }}>
            📍 {a.label} · <Body muted>{t('results.range', { min: a.minMin, max: a.maxMin })}</Body>
          </Body>
          {a.hasVenues ? (
            suggestions.alternatives
              .filter((s) => s.areaId === a.id)
              .map((s) => <VenueCard key={s.venue.id} s={s} groupSize={people.length} />)
          ) : (
            <AreaLoader area={a} />
          )}
        </View>
      ))}
    </ScrollView>
  );

  // Ο χάρτης χωράει όλους: αφετηρίες της παρέας + μαγαζιά / σημεία
  const fitAll = () => {
    const coords = [
      ...people.flatMap((p) => (p.origin ? [{ latitude: p.origin.lat, longitude: p.origin.lng }] : [])),
      ...(isSpot ? suggestions.areas.map((a) => a.center) : all.map((s) => s.venue.location)).map((l) => ({ latitude: l.lat, longitude: l.lng })),
    ];
    if (coords.length > 1) mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 50, right: 40, bottom: 40, left: 40 }, animated: false });
  };
  const focusPerson = (p: MapPerson) =>
    p.origin && mapRef.current?.animateToRegion({ latitude: p.origin.lat, longitude: p.origin.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }, 400);

  const map = (
    <MapView
      ref={mapRef}
      onMapReady={fitAll}
      style={{ flex: 1 }}
      initialRegion={{
        latitude: primaryArea.center.lat,
        longitude: primaryArea.center.lng,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }}
    >
      <PersonMarkers people={people} />
      {isSpot
        ? suggestions.areas.map((a) => (
            <Marker
              key={a.id}
              coordinate={{ latitude: a.center.lat, longitude: a.center.lng }}
              title={a.label}
              description={t('results.range', { min: a.minMin, max: a.maxMin })}
              pinColor={a.isPrimary ? c.venue : c.muted}
            />
          ))
        : null}
      {all.map((s) => (
        <Marker
          key={s.venue.id}
          coordinate={{ latitude: s.venue.location.lat, longitude: s.venue.location.lng }}
          title={s.venue.name}
          description={t('results.range', { min: s.minMin, max: s.maxMin })}
          onCalloutPress={() => router.push(`/outing/venue/${encodeURIComponent(s.venue.id)}`)}
        />
      ))}
    </MapView>
  );

  return (
    <Screen>
      {isTablet ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: 420 }}>{list}</View>
          <View style={{ flex: 1 }}>
            {map}
            <PeopleLegend people={people} onFocus={focusPerson} />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ height: 240 }}>{map}</View>
          <PeopleLegend people={people} onFocus={focusPerson} />
          <View style={{ flex: 1 }}>{list}</View>
        </View>
      )}
    </Screen>
  );
}

/** «Σημείο»: μόνο σημεία συνάντησης — χρόνος, απόσταση και κόστος ανά άτομο + οδηγίες στους χάρτες */
function SpotList({ areas, estimated }: { areas: SuggestionArea[]; estimated: boolean }) {
  const { t } = useTranslation();
  const [primary, ...others] = [...areas].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {estimated ? (
        <Card>
          <Body muted>ℹ️ {t('results.estimatedTimes')}</Body>
        </Card>
      ) : null}
      {primary ? (
        <>
          <Label>{t('results.spotPrimary')}</Label>
          <SpotCard area={primary} />
        </>
      ) : null}
      {others.length ? <Label>{t('results.spotAlternatives')}</Label> : null}
      {others.map((a) => (
        <SpotCard key={a.id} area={a} />
      ))}
    </ScrollView>
  );
}

function SpotCard({ area }: { area: SuggestionArea }) {
  const { t } = useTranslation();
  const c = useTheme();
  const { people } = useOuting();
  const avgKm = area.travel.reduce((s, x) => s + x.distanceKm, 0) / Math.max(1, area.travel.length);
  const name = (id: string) => people.find((p) => p.id === id)?.name.trim() || '—';
  const openMaps = () => {
    const { lat, lng } = area.center;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
  };
  return (
    <Card>
      <Body style={{ fontWeight: '700', fontSize: 17 }}>📍 {area.label}</Body>
      <Body muted style={{ marginTop: 4 }}>
        {t('results.spotSummary', { min: area.minMin, max: area.maxMin, km: avgKm.toFixed(1) })}
      </Body>
      <View style={{ marginTop: 10, gap: 4 }}>
        {area.travel.map((x) => (
          <Row key={x.participantId} style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <Body style={{ flexShrink: 1 }}>{name(x.participantId)}</Body>
            <Body muted>
              {t('results.personTrip', { min: x.durationMin, km: x.distanceKm, cost: x.costEur > 0 ? ` · ${x.costEur.toFixed(2)}€` : '' })}
            </Body>
          </Row>
        ))}
      </View>
      <Pressable onPress={openMaps} accessibilityRole="link" style={{ marginTop: 10 }}>
        <Body style={{ color: c.primary, fontWeight: '600' }}>🧭 {t('results.directions')}</Body>
      </Pressable>
    </Card>
  );
}

/** Λιτή λειτουργία: τα μαγαζιά μιας εναλλακτικής περιοχής φορτώνουν μόνο αν τα ζητήσει ο χρήστης */
function AreaLoader({ area }: { area: SuggestionArea }) {
  const { t } = useTranslation();
  const o = useOuting();
  const [loading, setLoading] = useState(false);

  async function load() {
    const participants = toParticipants(o.people);
    if (!participants || !o.suggestions) return;
    setLoading(true);
    try {
      const res = await api.areaVenues({
        city: o.city,
        activity: o.activity,
        category: o.category,
        departAt: o.departAt,
        participants,
        area: { id: area.id, label: area.label, center: area.center, travel: area.travel },
        excludeIds: [...o.suggestions.primary, ...o.suggestions.alternatives].map((s) => s.venue.id),
      });
      o.addAreaVenues(res);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return <Button variant="secondary" title={t('results.showVenuesHere')} onPress={load} loading={loading} />;
}

function VenueCard({ s, area, groupSize }: { s: ScoredVenue; area?: string; groupSize: number }) {
  const { t } = useTranslation();
  const c = useTheme();
  const v = s.venue;
  const reviews = v.ratingCount ? (v.ratingCount >= 1000 ? `${(v.ratingCount / 1000).toFixed(1)}k` : String(v.ratingCount)) : null;
  return (
    <Card onPress={() => router.push(`/outing/venue/${encodeURIComponent(v.id)}`)}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Body style={{ fontWeight: '700', fontSize: 17, flexShrink: 1 }}>{v.name}</Body>
        <Row style={{ flexWrap: 'nowrap' }}>
          {s.crowd?.callAhead ? <CrowdBadge s={s} groupSize={groupSize} /> : null}
          <Body style={{ color: c.good, fontWeight: '700' }}>{s.score}</Body>
        </Row>
      </Row>
      <Body muted style={{ marginTop: 4 }}>
        {[
          area,
          v.rating ? `★ ${v.rating}${reviews ? ` (${reviews})` : ''}` : null,
          v.priceLevel ? '€'.repeat(v.priceLevel) : null,
          t('results.fromPoint', { m: s.distanceM }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Body>
      <Body style={{ marginTop: 6 }}>⏱ {t('results.range', { min: s.minMin, max: s.maxMin })}</Body>
    </Card>
  );
}

/** 📞 «Ίσως έχει κόσμο» — εκτίμηση, όχι μέτρηση. Με τηλέφωνο: κουμπί κλήσης. */
function CrowdBadge({ s, groupSize }: { s: ScoredVenue; groupSize: number }) {
  const { t } = useTranslation();
  const phone = s.venue.phone;
  const open = () => {
    const lines = [t('crowd.body', { count: groupSize })];
    if (s.venue.reservable) lines.push(t('crowd.reservable'));
    if (!phone) lines.push(t('crowd.noPhone'));
    Alert.alert(
      t('crowd.title'),
      lines.join('\n\n'),
      phone
        ? [
            { text: t('common.cancel'), style: 'cancel' },
            { text: `${t('crowd.call')} ${phone}`, onPress: () => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`) },
          ]
        : [{ text: 'OK' }],
    );
  };
  return (
    <Pressable onPress={open} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('crowd.title')}>
      <Body style={{ fontSize: 18 }}>{phone ? '📞' : '⚠️'}</Body>
    </Pressable>
  );
}
