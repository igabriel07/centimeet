import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Body, H1, Label, Screen } from '@/components/ui';
import { LEGAL_DOCS, type LegalDocId } from '@/legal/content';

/** Πολιτική απορρήτου / όροι χρήσης (το κείμενο είναι στο src/legal/content.ts) */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = LEGAL_DOCS[doc && Object.hasOwn(LEGAL_DOCS, doc) ? (doc as LegalDocId) : 'privacy'];
  return (
    <Screen>
      <Stack.Screen options={{ title: content.title }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <H1>{content.title}</H1>
        {content.sections.map((s) => (
          <View key={s.h}>
            <Label>{s.h}</Label>
            {s.p.map((p, i) => (
              <Body key={i} style={{ marginBottom: 10, lineHeight: 22 }}>
                {p}
              </Body>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
