// Μόνο για προεπισκόπηση στον browser (npm run web): το react-native-maps δεν υποστηρίζει web,
// οπότε το metro.config.js το αντικαθιστά εδώ με ένα απλό πλαίσιο. Στο κινητό δεν χρησιμοποιείται.
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

type Props = { style?: StyleProp<ViewStyle>; children?: ReactNode } & Record<string, any>;

const MapView = forwardRef<unknown, Props>(function MapView({ style }, ref) {
  useImperativeHandle(ref, () => ({ animateToRegion() {}, animateCamera() {}, fitToCoordinates() {} }));
  return (
    <View style={[{ backgroundColor: '#dfe6dc', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ color: '#5b6b58' }}>🗺️ Χάρτης (εμφανίζεται μόνο στο κινητό)</Text>
    </View>
  );
});

export const Marker = (_: Record<string, unknown>) => null;
export const Callout = (_: Record<string, unknown>) => null;
export const PROVIDER_GOOGLE = 'google';
export default MapView;
