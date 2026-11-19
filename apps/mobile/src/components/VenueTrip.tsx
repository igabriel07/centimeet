/**
 * 📍 Ενιαίο πλαίσιο «Αποφασίστηκε»: μαγαζί (όνομα, διεύθυνση, βαθμολογία) + η διαδρομή μου
 * (μέσο · χρόνος · κόστος, και για συγκοινωνίες τα ακριβή μέσα:
 *  🚶 4′ → 🚌 31 (Πανεπιστήμιο – Σύνταγμα) → 🚶 → Ⓜ 2 (Σύνταγμα – Ομόνοια)) + Πλοήγηση.
 */
import type { FixedVenue, TransitStep } from '@centimeet/shared';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { radius, typeScale } from '@/theme';
import { openInGoogleMaps } from '@/lib/parking';
import { ratingText } from './FixedPlacePicker';
import { AppText as Text, Button, useTheme } from './ui';

export type TripPlan = {
  mode?: string;
  durationMin?: number;
  costEur?: number;
  navigationUrl?: string;
  steps?: Partial<TransitStep>[];
};

const STEP_EMOJI: Record<TransitStep['kind'], string> = { walk: '🚶', bus: '🚌', metro: 'M', tram: '🚊', train: '🚆', trolley: '🚎', other: '🚐' };
const STEP_COLOR: Record<TransitStep['kind'], string> = {
  walk: '#6B6B76',
  bus: '#1E88E5',
  metro: '#E53935',
  tram: '#43A047',
  train: '#6D4C41',
  trolley: '#F9A825',
  other: '#5D6D7E',
};

/** 🚶 → 🚌 31 (στάση – στάση) → 🚶 → Ⓜ 2 (στάση – στάση) */
export function TransitChain({ steps }: { steps: Partial<TransitStep>[] }) {
  const c = useTheme();
  const list = steps.filter((s) => s.kind);
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6, columnGap: 4 }}>
      {list.map((s, i) => {
        const kind = s.kind!;
        const color = STEP_COLOR[kind];
        const stops = s.from && s.to ? `${s.from} – ${s.to}` : null;
        return (
          <Fragment key={i}>
            {i > 0 ? <Ionicons name="arrow-forward" size={14} color={c.muted} /> : null}
            {kind === 'walk' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 16 }}>🚶</Text>
                {s.durationMin ? <Text style={{ color: c.muted, fontSize: 12 }}>{s.durationMin}′</Text> : null}
              </View>
            ) : (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingVertical: 3,
                  paddingHorizontal: 7,
                  borderRadius: radius.md,
                  backgroundColor: `${color}1A`,
                  borderWidth: 1,
                  borderColor: `${color}55`,
                  maxWidth: '100%',
                }}
              >
                {kind === 'metro' ? (
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>M</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 15 }}>{STEP_EMOJI[kind]}</Text>
                )}
                {s.line ? <Text style={{ color, fontWeight: '800' }}>{s.line}</Text> : null}
                {stops ? (
                  <Text style={{ color: c.muted, fontSize: 12, flexShrink: 1 }} numberOfLines={2}>
                    ({stops})
                  </Text>
                ) : null}
              </View>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

export function DecidedVenue({ venue, plan, title }: { venue: FixedVenue; plan?: TripPlan | null; title?: string }) {
  const { t } = useTranslation();
  const c = useTheme();
  const summary = plan
    ? [
        plan.mode ? t(`mode.${plan.mode}`) : null,
        plan.durationMin != null ? t('venue.duration', { min: plan.durationMin }) : null,
        plan.costEur != null ? `${plan.costEur.toFixed(2)}€` : null,
      ].filter(Boolean)
    : [];
  return (
    <View style={{ borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.card, overflow: 'hidden' }}>
      {title ? (
        <View style={{ backgroundColor: `${c.good}1A`, paddingVertical: 6, paddingHorizontal: 14 }}>
          <Text style={{ color: c.good, fontWeight: '700' }}>{title}</Text>
        </View>
      ) : null}

      {/* Μαγαζί */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 }}>
        <Ionicons name="location" size={26} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{venue.name}</Text>
          {venue.address && venue.address !== venue.name ? <Text style={{ color: c.muted, fontSize: typeScale.small }}>{venue.address}</Text> : null}
          {venue.rating != null ? (
            <Text style={{ color: c.warn, fontWeight: '700', fontSize: typeScale.small, marginTop: 2 }}>{ratingText(venue.rating, venue.ratingCount)}</Text>
          ) : null}
        </View>
        <Pressable onPress={() => openInGoogleMaps(venue.location)} hitSlop={10} accessibilityRole="link" accessibilityLabel={t('fixed.openMaps')}>
          <Ionicons name="open-outline" size={20} color={c.primary} />
        </Pressable>
      </View>

      {/* Η διαδρομή μου */}
      {plan ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: c.text, fontWeight: '700' }}>🧭 {t('decide.yourTrip')}</Text>
            {summary.length ? <Text style={{ color: c.muted }}>· {summary.join(' · ')}</Text> : null}
          </View>
          {plan.steps?.length ? <TransitChain steps={plan.steps} /> : null}
          {plan.navigationUrl ? <Button title={`🧭 ${t('venue.navigate')}`} onPress={() => Linking.openURL(plan.navigationUrl!)} /> : null}
        </View>
      ) : null}
    </View>
  );
}
