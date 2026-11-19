import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, supabaseConfigured } from './supabase';

/** Στην ανάπτυξη η «Παράλειψη» θυμάται και μετά από refresh (F5) — στην παραγωγή όχι. */
const DEV_GUEST_KEY = 'centimeet.devGuest';

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** Λειτουργία δοκιμής χωρίς λογαριασμό (μόνο εύρεση σημείου, χωρίς φίλους/μηνύματα) */
  guest: boolean;
  setGuest: (g: boolean) => void;
};

const Ctx = createContext<AuthState>({ session: null, loading: true, guest: false, setGuest: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [guest, setGuestState] = useState(false);

  const setGuest = (g: boolean) => {
    setGuestState(g);
    if (__DEV__) (g ? AsyncStorage.setItem(DEV_GUEST_KEY, '1') : AsyncStorage.removeItem(DEV_GUEST_KEY)).catch(() => {});
  };

  useEffect(() => {
    if (!supabaseConfigured) return;
    const devGuest = __DEV__ ? AsyncStorage.getItem(DEV_GUEST_KEY).catch(() => null) : Promise.resolve(null);
    Promise.all([supabase.auth.getSession(), devGuest]).then(([{ data }, g]) => {
      setSession(data.session);
      if (g === '1') setGuestState(true);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={{ session, loading, guest, setGuest }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
