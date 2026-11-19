import { ACTIVITIES, categoriesFor, type Activity, type ActivityCategory } from '@centimeet/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text, Body, Screen, useTheme } from '@/components/ui';
import { CategoryPicker } from '@/components/CategoryPicker';
import { HomeInvites } from '@/components/HomeInvites';
import { ParkingSection } from '@/components/Parking';
import { HamburgerButton, SideMenu, type MenuItem } from '@/components/SideMenu';
import { APP_INFO } from '@/legal/content';
import { useAuth } from '@/lib/auth';
import { useInviteRefresh } from '@/lib/push';
import { useSignOut } from '@/lib/useSignOut';
import { ACTIVITY_EMOJI, fetchMyOutings, fetchSavedOutings, outingKeys } from '@/lib/outings';
import { useOuting } from '@/store/outing';

/** Αρχική: γρήγορη έναρξη ανά δραστηριότητα + ενεργές προσκλήσεις (με λογαριασμό) */
export default function OutingsHome() {
  const { t } = useTranslation();
  const c = useTheme();
  const { reset, setActivity } = useOuting();
  const { session } = useAuth();
  const me = session?.user.id;

  const mine = useQuery({ queryKey: outingKeys.mine, enabled: !!me, queryFn: fetchMyOutings });
  const saved = useQuery({ queryKey: outingKeys.saved, enabled: !!me, queryFn: fetchSavedOutings });
  const refetch = useCallback(() => {
    mine.refetch();
    saved.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.refetch, saved.refetch]);
  // Νέα πρόσκληση ενώ η εφαρμογή είναι ανοιχτή → ανανέωση λίστας
  useInviteRefresh(!!me, refetch);
  useFocusEffect(
    useCallback(() => {
      if (me) refetch();
    }, [me, refetch]),
  );

  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const [menu, setMenu] = useState<'left' | 'right' | null>(null);

  /** ☰ αριστερά: πλοήγηση */
  const leftItems: MenuItem[] = [
    { icon: 'location-outline', label: t('tabs.outings'), onPress: () => {}, active: true },
    { icon: 'chatbubbles-outline', label: t('tabs.messages'), onPress: () => router.navigate('/(tabs)/messages') },
    { icon: 'people-outline', label: t('tabs.friends'), onPress: () => router.navigate('/(tabs)/friends') },
    { icon: 'time-outline', label: t('menu.history'), onPress: () => router.push('/history') },
    { icon: 'star-outline', label: t('saved.title'), onPress: () => router.push('/places') },
    { icon: 'person-circle-outline', label: t('tabs.profile'), onPress: () => router.navigate('/(tabs)/profile') },
  ];
  /** Εικονίδιο προφίλ δεξιά: λογαριασμός, ενέργειες & πληροφορίες */
  const rightItems: MenuItem[] = [
    { icon: 'person-circle-outline', label: t('tabs.profile'), onPress: () => router.navigate('/(tabs)/profile') },
    { icon: 'add-circle-outline', label: t('wizard.newOuting'), onPress: () => start() },
    { icon: 'star-outline', label: t('saved.title'), onPress: () => router.push('/places') },
    { icon: 'document-text-outline', label: t('profile.terms'), onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } }) },
    { icon: 'shield-checkmark-outline', label: t('profile.privacy'), onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } }) },
    { icon: 'mail-outline', label: t('menu.contact'), onPress: () => Linking.openURL(`mailto:${APP_INFO.contactEmail}`).catch(() => {}) },
    { icon: 'log-out-outline', label: t('profile.signOut'), onPress: signOut, danger: true },
  ];

  const start = (a?: Activity, category?: ActivityCategory) => {
    reset();
    if (a) setActivity(a, category);
    router.push('/outing/new');
  };

  /** Πάτημα σε δραστηριότητα: με κατηγορίες → pop-up επιλογής, αλλιώς (π.χ. «Σημείο») κατευθείαν */
  const [picking, setPicking] = useState<Activity | null>(null);
  const onActivity = (a: Activity) => (categoriesFor(a).length ? setPicking(a) : start(a));


  return (
    <Screen>
      {/* Πάνω μπάρα: ☰ αριστερά, προφίλ δεξιά */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: insets.top + 8, paddingHorizontal: 12 }}>
        <HamburgerButton onPress={() => setMenu('left')} />
        <HamburgerButton onPress={() => setMenu('right')} label={t('tabs.profile')} icon="person-circle-outline" />
      </View>
      <SideMenu side="left" visible={menu === 'left'} onClose={() => setMenu(null)} title={t('menu.navigation')} items={leftItems} />
      <SideMenu side="right" visible={menu === 'right'} onClose={() => setMenu(null)} title={t('tabs.profile')} items={rightItems} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 8 }}>
        {/* «Πού πάμε;» σε μία μικρή σειρά — περισσότερος χώρος για «Οι έξοδοί μου» */}
        <Body style={{ fontWeight: '700', fontSize: 17 }}>{t('wizard.whatFor')}</Body>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          {ACTIVITIES.map((a) => (
            <Pressable
              key={a}
              onPress={() => onActivity(a)}
              accessibilityRole="button"
              accessibilityLabel={t(`activity.${a}`)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.border,
                backgroundColor: pressed ? c.chip : c.card,
              })}
            >
              <Text style={{ fontSize: 20 }}>{ACTIVITY_EMOJI[a]}</Text>
              <Text style={{ color: c.text, fontWeight: '600', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                {t(`activity.${a}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Ενεργές προσκλήσεις (με λογαριασμό) */}
        {me && mine.data ? <HomeInvites rows={mine.data} saved={saved.data ?? []} onChanged={() => refetch()} /> : null}
      </ScrollView>

      {/* «Πού πάρκαρα;» — σταθερά κάτω, πάνω από τις καρτέλες */}
      <ParkingSection />

      {picking ? (
        <CategoryPicker
          activity={picking}
          visible
          onClose={() => setPicking(null)}
          onSelect={(category) => {
            const a = picking;
            setPicking(null);
            start(a, category);
          }}
        />
      ) : null}
    </Screen>
  );
}

