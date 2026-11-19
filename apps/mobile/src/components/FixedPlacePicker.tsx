/**
 * «Διαλέγω εγώ το μέρος»: ο διοργανωτής ορίζει το μαγαζί/σημείο από πριν.
 *  - αναζήτηση (μπάρα) / πινέζα στον χάρτη / η τοποθεσία μου  (PlaceSearch)
 *  - 🔥 δημοφιλή μαγαζιά της κατηγορίας στην πόλη (όχι για «Σημείο»)
 */
import type { Activity, ActivityCategory, CityId, FixedVenue, Venue } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { openInGoogleMaps } from '@/lib/parking';
import { radius, typeScale } from '@/theme';
import { PlaceSearch } from './PlaceSearch';
import { AppText as Text, Body, useTheme } from './ui';

export const venueFromPlace = (v: Venue): FixedVenue => ({
  id: v.id,
  name: v.name,
  address: v.address,
  location: v.location,
  rating: v.rating,
  ratingCount: v.ratingCount,
});

/** ★ 4.7 (2,1k) */
export function ratingText(rating?: number, count?: number) {
  if (rating == null) return '';
  const n = count == null ? '' : count >= 1000 ? ` (${(count / 1000).toFixed(1).replace('.0', '')}k)` : ` (${count})`;
  return `★ ${rating.toFixed(1)}${n}`;
}

export function FixedPlacePicker({
  city,
  activity,
  category,
  value,
  onChange,
}: {
  city: CityId;
  activity: Activity;
  category?: ActivityCategory;
  value?: FixedVenue;
  onChange: (v: FixedVenue | undefined) => void;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const venueActivity = activity === 'spot' ? null : activity;
  const popular = useQuery({
    queryKey: ['popular', city, activity, category ?? null],
    enabled: !!venueActivity && !value,
    staleTime: 30 * 60_000,
    queryFn: () => api.popularVenues({ city, activity: venueActivity!, category }),
  });

  if (value) return <ChosenVenue venue={value} onChange={() => onChange(undefined)} />;

  return (
    <View style={{ gap: 12 }}>
      <PlaceSearch
        city={city}
        onSelect={(pl) => onChange({ id: pl.placeId, name: pl.name, address: pl.address, location: pl.location })}
      />
      {venueActivity ? (
        <View>
          <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
            🔥 {t('fixed.popular')}
          </Text>
          {popular.isLoading ? <ActivityIndicator style={{ padding: 12 }} /> : null}
          {popular.isError ? <Body muted>{t('fixed.popularError')}</Body> : null}
          {popular.data && !popular.data.venues.length ? <Body muted>{t('fixed.popularEmpty')}</Body> : null}
          {popular.data?.venues.map((v, i) => (
            <Pressable
              key={v.id}
              onPress={() => onChange(venueFromPlace(v))}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 10,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: c.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Ionicons name="storefront-outline" size={20} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>{v.name}</Text>
                {v.address ? (
                  <Text style={{ color: c.muted, fontSize: typeScale.small }} numberOfLines={1}>
                    {v.address}
                  </Text>
                ) : null}
              </View>
              {v.rating != null ? <Text style={{ color: c.warn, fontWeight: '700', fontSize: typeScale.small }}>{ratingText(v.rating, v.ratingCount)}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Το μέρος που επιλέχθηκε (κάρτα) — με «Αλλαγή» ή «Google Maps» */
export function ChosenVenue({ venue, onChange }: { venue: FixedVenue; onChange?: () => void }) {
  const { t } = useTranslation();
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.card }}>
      <Ionicons name="location" size={24} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{venue.name}</Text>
        {venue.address && venue.address !== venue.name ? <Text style={{ color: c.muted, fontSize: typeScale.small }}>{venue.address}</Text> : null}
        {venue.rating != null ? <Text style={{ color: c.warn, fontWeight: '700', fontSize: typeScale.small, marginTop: 2 }}>{ratingText(venue.rating, venue.ratingCount)}</Text> : null}
      </View>
      {onChange ? (
        <Pressable onPress={onChange} hitSlop={10} accessibilityRole="button">
          <Text style={{ color: c.primary, fontWeight: '600' }}>{t('place.change')}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => openInGoogleMaps(venue.location)} hitSlop={10} accessibilityRole="link" accessibilityLabel={t('fixed.openMaps')}>
          <Ionicons name="open-outline" size={20} color={c.primary} />
        </Pressable>
      )}
    </View>
  );
}
