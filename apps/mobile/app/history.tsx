/**
 * Ιστορικό: καρτέλα «Έξοδοι» (όλες όσες συμμετείχες, με φίλτρο ανά δραστηριότητα, π.χ. μόνο καφές)
 * και καρτέλα «Στάθμευση» (όλες οι θέσεις που αποθήκευσες).
 */
import { filterHistory, historyDate, type Activity, type OutingHistoryRow } from '@centimeet/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ParkingList, useFormatWhen } from '@/components/Parking';
import { AppText as Text, Body, Card, Chip, Screen, useTheme } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ACTIVITY_EMOJI, activityTitle, errorMessage, fetchOutingHistory, outingKeys } from '@/lib/outings';
import { useParking } from '@/lib/parking';
import { radius, space, typeScale } from '@/theme';

type Tab = 'outings' | 'parking';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'parking' ? 'parking' : 'outings');

  return (
    <Screen>
      {/* Καρτέλες */}
      <View style={[st.tabs, { backgroundColor: c.chip }]}>
        {(['outings', 'parking'] as const).map((k) => {
          const active = tab === k;
          return (
            <Pressable
              key={k}
              onPress={() => setTab(k)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[st.tab, active && { backgroundColor: c.card, shadowOpacity: 0.08 }]}
            >
              <Text style={{ color: active ? c.text : c.muted, fontWeight: active ? '700' : '500' }}>
                {k === 'outings' ? `🗓️ ${t('history.outings')}` : `🅿️ ${t('history.parking')}`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {tab === 'outings' ? <OutingsTab /> : <ParkingTab />}
    </Screen>
  );
}

function OutingsTab() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [activity, setActivity] = useState<Activity | undefined>();
  const history = useQuery({ queryKey: outingKeys.history, enabled: !!session, queryFn: fetchOutingHistory });

  if (!session) return <Empty text={t('history.signIn')} />;
  if (history.isLoading) return <ActivityIndicator style={{ marginTop: space.xl }} />;
  if (history.error) return <Empty text={errorMessage(history.error)} />;

  const { rows, activities } = filterHistory(history.data ?? [], activity);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: space.sm, gap: space.sm }}>
      {activities.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.sm }}>
          <Chip label={t('history.all')} selected={!activity} onPress={() => setActivity(undefined)} />
          {activities.map((a) => (
            <Chip key={a} label={`${ACTIVITY_EMOJI[a]} ${t(`activity.${a}`)}`} selected={activity === a} onPress={() => setActivity(a)} />
          ))}
        </ScrollView>
      ) : null}
      {rows.length ? rows.map((r) => <HistoryCard key={r.id} r={r} />) : <Empty text={t(activity ? 'history.emptyFiltered' : 'history.empty')} />}
    </ScrollView>
  );
}

function HistoryCard({ r }: { r: OutingHistoryRow }) {
  const { t } = useTranslation();
  const c = useTheme();
  const when = useFormatWhen();
  const faded = r.status === 'cancelled';
  const statusColor = r.status === 'done' || r.status === 'decided' ? c.primary : r.status === 'cancelled' ? c.danger : c.muted;
  return (
    <Card onPress={() => router.push(`/outing/${r.id}`)} style={{ opacity: faded ? 0.65 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Body style={{ fontWeight: '700', fontSize: 16, flex: 1 }}>
          {r.title ? `${ACTIVITY_EMOJI[r.activity]} ${r.title}` : activityTitle(t, r.activity, r.category)}
        </Body>
        <View style={[st.badge, { borderColor: statusColor }]}>
          <Text style={{ color: statusColor, fontSize: typeScale.small, fontWeight: '600' }}>{t(`history.status.${r.status}`)}</Text>
        </View>
      </View>
      {r.venue_name ? <Body style={{ marginTop: 4, fontWeight: '600' }}>📍 {r.venue_name}</Body> : null}
      <Body muted style={{ marginTop: 4, fontSize: typeScale.small }}>
        {[when(historyDate(r)), t(`city.${r.city}`), r.is_organizer ? t('history.organizer') : null].filter(Boolean).join(' · ')}
      </Body>
    </Card>
  );
}

function ParkingTab() {
  const parking = useParking();
  if (parking.loading) return <ActivityIndicator style={{ marginTop: space.xl }} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: space.sm }}>
      <Card>
        <ParkingList spots={parking.spots} onRemove={parking.remove} />
      </Card>
    </ScrollView>
  );
}

function Empty({ text }: { text: string }) {
  const c = useTheme();
  return <Text style={{ color: c.muted, textAlign: 'center', padding: space.xl }}>{text}</Text>;
}

const st = StyleSheet.create({
  tabs: { flexDirection: 'row', margin: 20, marginBottom: space.sm, padding: 4, borderRadius: radius.md },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md - 2,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
});
