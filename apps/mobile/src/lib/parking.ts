/**
 * «Πού πάρκαρα;»: οι θέσεις στάθμευσης μένουν ΜΟΝΟ σε αυτή τη συσκευή (AsyncStorage), χωριστά ανά χρήστη.
 * Η λογική (σειρά, όριο, διπλές εγγραφές, link Google Maps) είναι στο @centimeet/shared/parking.
 */
import { addParkedSpot, googleMapsUrl, parseParkedSpots, removeParkedSpot, type NewParkedSpot, type ParkedSpot } from '@centimeet/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Linking } from 'react-native';
import { useAuth } from './auth';

const storageKey = (owner: string) => `centimeet.parking.${owner}`;

async function read(owner: string): Promise<ParkedSpot[]> {
  try {
    return parseParkedSpots(await AsyncStorage.getItem(storageKey(owner)));
  } catch {
    return [];
  }
}

async function write(owner: string, list: ParkedSpot[]) {
  await AsyncStorage.setItem(storageKey(owner), JSON.stringify(list));
}

export function useParking() {
  const { session } = useAuth();
  const owner = session?.user.id ?? 'guest';
  const qc = useQueryClient();
  const key = ['parking', owner] as const;

  const query = useQuery({ queryKey: key, queryFn: () => read(owner), staleTime: Infinity });

  /** Διαβάζει πάντα από την αποθήκευση πριν γράψει (δεν χάνονται εγγραφές από διπλό πάτημα) */
  const update = useMutation({
    mutationFn: async (fn: (list: ParkedSpot[]) => ParkedSpot[]) => {
      const next = fn(await read(owner));
      await write(owner, next);
      return next;
    },
    onSuccess: (next) => qc.setQueryData(key, next),
  });

  const spots = query.data ?? [];
  return {
    spots,
    last: spots[0],
    loading: query.isLoading,
    saving: update.isPending,
    add: (spot: NewParkedSpot) => update.mutateAsync((list) => addParkedSpot(list, spot)),
    remove: (id: string) => update.mutateAsync((list) => removeParkedSpot(list, id)),
  };
}

export const openInGoogleMaps = (p: { lat: number; lng: number }) => Linking.openURL(googleMapsUrl(p)).catch(() => {});
