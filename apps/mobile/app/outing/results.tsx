import type { ScoredVenue } from '@centimeet/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Body, Card, Label, Row, Screen, useResponsive, useTheme } from '@/components/ui';
import { useOuting } from '@/store/outing';

/** Λίστα προτάσεων. Σε tablet: λίστα αριστερά, χάρτης δεξιά. */
export default function Results() {
  const { t } = useTranslation();
  const { isTablet } = useResponsive();
  const { suggestions, people } = useOuting();

  if (!suggestions) return <Screen />;
  const areaLabel = (id: string) => suggestions.areas.find((a) => a.id === id)?.label ?? '';
  const primaryArea = suggestions.areas.find((a) => a.isPrimary)!;
  const all = [...suggestions.primary, ...suggestions.alternatives];

  const list = (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {all.length === 0 ? <Body muted>{t('results.empty')}</Body> : null}
      {suggestions.primary.length ? <Label>{`${t('results.primary')} · ${primaryArea.label}`}</Label> : null}
      {suggestions.primary.map((s) => (
        <VenueCard key={s.venue.id} s={s} />
      ))}
      {suggestions.alternatives.length ? <Label>{t('results.alternatives')}</Label> : null}
      {suggestions.alternatives.map((s) => (
        <VenueCard key={s.venue.id} s={s} area={areaLabel(s.areaId)} />
      ))}
    </ScrollView>
  );

  const map = (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: primaryArea.center.lat,
        longitude: primaryArea.center.lng,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      }}
    >
      {people.map((p) =>
        p.origin ? (
          <Marker key={p.id} coordinate={{ latitude: p.origin.lat, longitude: p.origin.lng }} title={p.name} pinColor="#3B6FE0" />
        ) : null,
      )}
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
          <View style={{ flex: 1 }}>{map}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ height: 220 }}>{map}</View>
          <View style={{ flex: 1 }}>{list}</View>
        </View>
      )}
    </Screen>
  );
}

function VenueCard({ s, area }: { s: ScoredVenue; area?: string }) {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    <Card onPress={() => router.push(`/outing/venue/${encodeURIComponent(s.venue.id)}`)}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Body style={{ fontWeight: '700', fontSize: 17, flexShrink: 1 }}>{s.venue.name}</Body>
        <Body style={{ color: c.good, fontWeight: '700' }}>{s.score}</Body>
      </Row>
      <Body muted style={{ marginTop: 4 }}>
        {[area, s.venue.rating ? `★ ${s.venue.rating}` : null, s.venue.priceLevel ? '€'.repeat(s.venue.priceLevel) : null]
          .filter(Boolean)
          .join(' · ')}
      </Body>
      <Body style={{ marginTop: 6 }}>⏱ {t('results.range', { min: s.minMin, max: s.maxMin })}</Body>
    </Card>
  );
}
