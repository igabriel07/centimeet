import { FriendGroupsSchema } from '@centimeet/shared';
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

export type Profile = { id: string; username: string; display_name: string };
export type FriendshipRow = {
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  requester: Profile;
  addressee: Profile;
};

/** Όλες οι (μη απορριφθείσες) φιλίες του χρήστη, με τα προφίλ και των δύο πλευρών */
export function useFriendships(me: string | undefined) {
  return useQuery({
    queryKey: ['friendships', me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          'requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(id, username, display_name), addressee:profiles!friendships_addressee_id_fkey(id, username, display_name)',
        )
        .neq('status', 'declined');
      if (error) throw error;
      return data as unknown as FriendshipRow[];
    },
  });
}

/** Τα προφίλ των φίλων (αποδεκτές φιλίες) */
export function acceptedFriends(rows: FriendshipRow[] | undefined, me: string | undefined): Profile[] {
  return (rows ?? [])
    .filter((r) => r.status === 'accepted')
    .map((r) => (r.requester_id === me ? r.addressee : r.requester));
}

/** Οι ομάδες φίλων μου (με τα μέλη που είναι ακόμη φίλοι) */
export function useMyGroups(me: string | undefined) {
  return useQuery({
    queryKey: ['friend-groups', me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_groups');
      if (error) throw error;
      return FriendGroupsSchema.parse(data);
    },
  });
}
