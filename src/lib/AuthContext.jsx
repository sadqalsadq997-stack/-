import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isMissingEnv } from '@/integrations/supabase/client';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [session, setSession]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (isMissingEnv) {
      setLoading(false);
      setAuthChecked(true);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      setAuthChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, authChecked, isMissingEnv }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
