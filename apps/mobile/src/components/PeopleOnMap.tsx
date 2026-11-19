/**
 * 👥 Οι αφετηρίες της παρέας στον χάρτη των προτάσεων:
 *  - κάθε άτομο με δικό του χρώμα & το αρχικό του (φούσκα + όνομα από κάτω)
 *  - «υπόμνημα» κάτω από τον χάρτη (και στο web, όπου δεν υπάρχει χάρτης)· πάτημα → ο χάρτης πάει εκεί
 */
import type { LatLng } from '@centimeet/shared';
import { ScrollView, Pressable, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { AppText as Text, useTheme } from './ui';

export type MapPerson = { id: string; name: string; origin?: LatLng };

/** Ξεχωριστά χρώματα ανά άτομο (κανένα κόκκινο: αυτό είναι για τα μαγαζιά) */
const PERSON_COLORS = ['#3B6FE0', '#2E9E5B', '#8E44AD', '#E08E0B', '#0FA3B1', '#D6457A', '#5D6D7E', '#7CB342'];
export const personColor = (i: number) => PERSON_COLORS[i % PERSON_COLORS.length]!;

const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase();

export function PersonMarkers({ people }: { people: MapPerson[] }) {
  return (
    <>
      {people.map((p, i) =>
        p.origin ? (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.origin.lat, longitude: p.origin.lng }}
            title={p.name}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={10}
          >
            <View style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: personColor(i),
                  borderWidth: 2,
                  borderColor: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{initial(p.name)}</Text>
              </View>
              <View style={{ marginTop: 2, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 6, paddingHorizontal: 4 }}>
                <Text style={{ color: '#1B1B1F', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                  {p.name.split(' ')[0]}
                </Text>
              </View>
            </View>
          </Marker>
        ) : null,
      )}
    </>
  );
}

/** Υπόμνημα: «● Μαρία ● Νίκος …» — πάτημα σε άτομο → onFocus */
export function PeopleLegend({ people, onFocus }: { people: MapPerson[]; onFocus?: (p: MapPerson) => void }) {
  const c = useTheme();
  const withOrigin = people.filter((p) => p.origin);
  if (!withOrigin.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.card }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' }}
    >
      {people.map((p, i) =>
        p.origin ? (
          <Pressable
            key={p.id}
            onPress={() => onFocus?.(p)}
            accessibilityRole="button"
            accessibilityLabel={p.name}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: pressed ? c.border : c.chip,
            })}
          >
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: personColor(i), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{initial(p.name)}</Text>
            </View>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>{p.name}</Text>
          </Pressable>
        ) : null,
      )}
    </ScrollView>
  );
}
