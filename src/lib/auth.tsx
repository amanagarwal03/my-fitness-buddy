import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type AuthContextValue = {
  session: Session | null;
  initializing: boolean;
  // null = not yet known, true = needs onboarding, false = onboarded.
  needsOnboarding: boolean | null;
  // True after a password-recovery link is opened — the app should show the
  // "set a new password" screen until cleared.
  recovering: boolean;
  endRecovery: () => void;
  refreshOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  initializing: true,
  needsOnboarding: null,
  recovering: false,
  endRecovery: () => {},
  refreshOnboarding: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [recovering, setRecovering] = useState(false);

  // A user needs onboarding until they have a profile row with a height set.
  const checkOnboarding = useCallback(async (current: Session | null) => {
    if (!current) {
      setNeedsOnboarding(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('height_cm').maybeSingle();
    setNeedsOnboarding(!data || data.height_cm == null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
      checkOnboarding(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      checkOnboarding(newSession);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });

    return () => sub.subscription.unsubscribe();
  }, [checkOnboarding]);

  // Email confirmation & password-reset links open the app with a `?code=` we
  // exchange for a session. (PKCE flow — see supabase.ts.)
  useEffect(() => {
    const exchange = async (url: string | null) => {
      if (!url) return;
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code === 'string' && code.length > 0) {
        await supabase.auth.exchangeCodeForSession(code);
      }
    };
    Linking.getInitialURL().then(exchange);
    const sub = Linking.addEventListener('url', ({ url }) => exchange(url));
    return () => sub.remove();
  }, []);

  const endRecovery = useCallback(() => setRecovering(false), []);

  const refreshOnboarding = useCallback(() => checkOnboarding(session), [checkOnboarding, session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, initializing, needsOnboarding, recovering, endRecovery, refreshOnboarding, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
