/** ⭐ Αποθηκευμένες διευθύνσεις: πίνακας saved_places (RLS: μόνο ο ιδιοκτήτης) */
import { cleanLabel, type ResolvedPlace, type SavedPlace } from '@centimeet/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

export const savedKeys = { all: (me: string) => ['saved-places', me] as const };

const COLUMNS = 'id, label, emoji, name, address, place_id, lat, lng, created_at';

export function useSavedPlaces() {
  const { session } = useAuth();
  const me = session?.user.id;
  return useQuery({
    queryKey: savedKeys.all(me ?? ''),
    enabled: !!me,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SavedPlace[]> => {
      const { data, error } = await supabase.from('saved_places').select(COLUMNS).order('created_at');
      if (error) throw error;
      return (data ?? []) as SavedPlace[];
    },
  });
}

export function useSavedPlaceActions() {
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const qc = useQueryClient();
  const key = savedKeys.all(me);
  const done = () => qc.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: async ({ place, label, emoji }: { place: ResolvedPlace; label: string; emoji: string }) => {
      const l = cleanLabel(label);
      if (!l) throw new Error('label');
      const { data, error } = await supabase
        .from('saved_places')
        .insert({
          label: l,
          emoji,
          name: place.name.slice(0, 200),
          address: place.address?.slice(0, 300) ?? null,
          // Τα δικά μας «saved:…» ids δεν ξαναποθηκεύονται
          place_id: place.placeId && !place.placeId.startsWith('saved:') ? place.placeId.slice(0, 300) : null,
          lat: place.location.lat,
          lng: place.location.lng,
        })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return data as SavedPlace;
    },
    onSuccess: done,
  });

  const rename = useMutation({
    mutationFn: async ({ id, label, emoji }: { id: string; label: string; emoji: string }) => {
      const l = cleanLabel(label);
      if (!l) throw new Error('label');
      const { error } = await supabase.from('saved_places').update({ label: l, emoji }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_places').delete().eq('id', id);
      if (error) throw error;
    },
    // Αισιόδοξη αφαίρεση: εξαφανίζεται αμέσως
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SavedPlace[]>(key);
      qc.setQueryData<SavedPlace[]>(key, (l) => l?.filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: done,
  });

  return { add, rename, remove, enabled: !!me };
}
