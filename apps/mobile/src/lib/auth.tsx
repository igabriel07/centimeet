import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, supabaseConfigured } from './supabase';

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
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={{ session, loading, guest, setGuest }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
