/** «© OpenStreetMap contributors» — υποχρεωτικό (ODbL) όπου δείχνουμε δεδομένα OpenStreetMap */
import * as Linking from 'expo-linking';
import { AppText as Text, useTheme } from './ui';

export function OsmAttribution({ style }: { style?: object }) {
  const c = useTheme();
  return (
    <Text
      onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright').catch(() => {})}
      accessibilityRole="link"
      style={[{ color: c.muted, fontSize: 11, textAlign: 'center', marginTop: 12 }, style]}
    >
      © OpenStreetMap contributors
    </Text>
  );
}

/** «~» μπροστά από χρόνους που είναι εκτίμηση (όχι πραγματική διαδρομή) */
export const tilde = (estimated?: boolean) => (estimated ? '~' : '');
/** Κάποιος από τους χρόνους είναι εκτίμηση; */
export const anyEstimated = (travel?: { estimated?: boolean }[]) => !!travel?.some((x) => x.estimated);
