import type { PlaceSuggestion } from '@centimeet/shared';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from './ui';

/** Λίστα αποτελεσμάτων αναζήτησης διεύθυνσης (κύριο + δευτερεύον κείμενο) */
export function AddressResults({
  results,
  loading,
  error,
  query,
  onPick,
}: {
  results: PlaceSuggestion[];
  loading: boolean;
  error: boolean;
  query: string;
  onPick: (s: PlaceSuggestion) => void;
}) {
  const c = useTheme();
  const { t } = useTranslation();
  const q = query.trim();
  if (q.length < 2) return null;

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      {loading && results.length === 0 ? (
        <View style={{ padding: 14, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: c.muted }}>{t('place.searching')}</Text>
        </View>
      ) : null}
      {!loading && error ? <Text style={{ color: c.muted, padding: 14 }}>{t('place.error')}</Text> : null}
      {!loading && !error && results.length === 0 ? <Text style={{ color: c.muted, padding: 14 }}>{t('place.noResults')}</Text> : null}
      {results.map((r, i) => (
        <Pressable
          key={r.placeId}
          onPress={() => onPick(r)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 11,
            backgroundColor: pressed ? c.chip : 'transparent',
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: c.border,
          })}
        >
          <Text style={{ fontSize: 18 }}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
              <Highlight text={r.mainText} query={q} />
            </Text>
            {r.secondaryText ? (
              <Text style={{ color: c.muted, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
                {r.secondaryText}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/** Τονίζει το κομμάτι που ταιριάζει με αυτό που γράφει ο χρήστης (χωρίς τόνους/κεφαλαία) */
function Highlight({ text, query }: { text: string; query: string }) {
  const c = useTheme();
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  // Κανονικοποίηση ανά χαρακτήρα ώστε οι θέσεις να αντιστοιχούν στο αρχικό κείμενο («Ερμού» ~ «ερμου»)
  const normText = text
    .split('')
    .map((ch) => norm(ch) || ch)
    .join('');
  const idx = normText.length === text.length ? normText.indexOf(norm(query)) : -1;
  if (idx < 0 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <Text style={{ color: c.primary }}>{text.slice(idx, idx + query.length)}</Text>
      {text.slice(idx + query.length)}
    </>
  );
}
