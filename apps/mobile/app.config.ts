/**
 * Δυναμικές ρυθμίσεις πάνω στο app.json: κλειδιά που ΔΕΝ μπαίνουν στο repo.
 *
 * GOOGLE_MAPS_ANDROID_API_KEY: ο χάρτης στο Android (react-native-maps) θέλει κλειδί «Maps SDK for Android»
 *   — δωρεάν χωρίς όριο. Περιορίστε το στο package app.centimeet + SHA-1 του build (βλ. docs/RELEASE.md).
 *   Στο Expo Go δεν χρειάζεται. Στο iOS ο χάρτης είναι της Apple (δωρεάν, χωρίς κλειδί).
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    name: config.name ?? 'CentiMeet',
    slug: config.slug ?? 'centimeet',
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        ...(mapsKey ? { googleMaps: { apiKey: mapsKey } } : {}),
      },
    },
  };
};
