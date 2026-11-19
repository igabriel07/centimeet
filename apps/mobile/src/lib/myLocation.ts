import type { ResolvedPlace } from '@centimeet/shared';
import * as Location from 'expo-location';
import { api } from './api';

export class LocationDeniedError extends Error {
  constructor() {
    super('location permission denied');
  }
}

/** Τρέχουσα θέση του κινητού με πραγματική διεύθυνση (αν βρεθεί). Ρίχνει LocationDeniedError χωρίς άδεια. */
export async function currentPlace(fallbackName: string): Promise<ResolvedPlace> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationDeniedError();
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const place = await api.reverse(loc).catch(() => null);
  return { placeId: place?.placeId ?? 'me', name: place?.name ?? fallbackName, address: place?.address, location: loc };
}
