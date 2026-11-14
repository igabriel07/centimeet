import { ACTIVITIES, type MyOutingRow } from '@centimeet/shared';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { Body, Button, Card, H1, Label, Row, useTheme, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ACTIVITY_EMOJI, fetchMyOutings, outingKeys } from '@/lib/outings';
import { useOuting } from '@/store/outing';

/** Αρχική: οι έξοδοί μου (με λογαριασμό) + γρήγορη έναρξη ανά δραστηριότητα */
export default function OutingsHome() {
  const { t } = useTranslation();
  const { reset, setActivity } = useOuting();
  const { session } = useAuth();
  const me = session?.user.id;

  const mine = useQuery({ queryKey: outingKeys.mine, enabled: !!me, queryFn: fetchMyOutings });
  const { refetch } = mine;
  useFocusEffect(
    useCallback(() => {
      if (me) refetch();
    }, [me, refetch]),
  );

  const start = (a?: (typeof ACTIVITIES)[number]) => {
    reset();
    if (a) setActivity(a);
    router.push('/outing/new');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {mine.data?.length ? (
          <>
            <H1>{t('outing.myOutings')}</H1>
            {mine.data.map((o) => (
              <OutingCard key={o.id} o={o} />
            ))}
            <Label>{t('wizard.newOuting')}</Label>
          </>
        ) : null}

        <H1>{t('wizard.whatFor')}</H1>
        <Row style={{ marginTop: 8 }}>
          {ACTIVITIES.map((a) => (
            <Card key={a} onPress={() => start(a)} style={{ width: 150, alignItems: 'center', paddingVertical: 20 }}>
              <Body style={{ fontSize: 32 }}>{ACTIVITY_EMOJI[a]}</Body>
              <Body style={{ fontWeight: '600', marginTop: 6 }}>{t(`activity.${a}`)}</Body>
            </Card>
          ))}
        </Row>
        <Label>{t('wizard.newOuting')}</Label>
        <Button title={t('wizard.newOuting')} onPress={() => start()} />
      </ScrollView>
    </Screen>
  );
}

function OutingCard({ o }: { o: MyOutingRow }) {
  const { t } = useTranslation();
  const c = useTheme();
  const waitingForMe = !o.my_declared && o.my_rsvp !== 'declined';
  const when = o.meet_at
    ? new Date(o.meet_at).toLocaleString('el-GR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <Card onPress={() => router.push(`/outing/${o.id}`)}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Body style={{ fontWeight: '700', fontSize: 17, flexShrink: 1 }}>
          {ACTIVITY_EMOJI[o.activity]} {o.title ?? `${t(`activity.${o.activity}`)} · ${t(`city.${o.city}`)}`}
        </Body>
        <Body muted>{t('outing.progress', { declared: o.declared_count, total: o.total_count })}</Body>
      </Row>
      {when ? <Body muted style={{ marginTop: 4 }}>{when}</Body> : null}
      {waitingForMe ? <Body style={{ marginTop: 6, color: c.primary, fontWeight: '600' }}>⏳ {t('outing.waitingForYou')}</Body> : null}
    </Card>
  );
}
