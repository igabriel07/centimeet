import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type MyProfile = { username: string; display_name: string };

/** Το προφίλ του συνδεδεμένου χρήστη (κοινή cache για Προφίλ, Νέα έξοδο κ.λπ.) */
export function useMyProfile() {
  const { session } = useAuth();
  const me = session?.user.id;
  return useQuery({
    queryKey: ['profile', me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('username, display_name').eq('id', me!).single();
      if (error) throw error;
      return data as MyProfile;
    },
  });
}
