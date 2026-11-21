import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { SesionContext } from './sesion';

// Mantiene la sesión de Supabase y avisa a la web cuando cambia (login, logout, renovación del token).
export default function SesionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => setSession(nueva));
    return () => data.subscription.unsubscribe();
  }, []);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  return <SesionContext.Provider value={{ session, cargando, cerrarSesion }}>{children}</SesionContext.Provider>;
}
