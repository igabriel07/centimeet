import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { ACTIVITIES } from '@centimeet/shared';
import { Body, Button, Card, H1, Label, Row, Screen } from '@/components/ui';
import { useOuting } from '@/store/outing';

const EMOJI = { coffee: '☕', food: '🍽️', drinks: '🍸', cinema: '🎬', dessert: '🍰', brunch: '🥞' } as const;

/** Αρχική: γρήγορη έναρξη ανά δραστηριότητα. (Λίστα αποθηκευμένων εξόδων: επόμενο βήμα) */
export default function OutingsHome() {
  const { t } = useTranslation();
  const { reset, setActivity } = useOuting();

  const start = (a?: (typeof ACTIVITIES)[number]) => {
    reset();
    if (a) setActivity(a);
    router.push('/outing/new');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <H1>{t('wizard.whatFor')}</H1>
        <Row style={{ marginTop: 8 }}>
          {ACTIVITIES.map((a) => (
            <Card key={a} onPress={() => start(a)} style={{ width: 150, alignItems: 'center', paddingVertical: 20 }}>
              <Body style={{ fontSize: 32 }}>{EMOJI[a]}</Body>
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
