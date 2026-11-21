import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface EstadoSesion {
  session: Session | null;
  cargando: boolean;
  cerrarSesion: () => Promise<void>;
}

export const SesionContext = createContext<EstadoSesion | null>(null);

export function useSesion(): EstadoSesion {
  const valor = useContext(SesionContext);
  if (!valor) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return valor;
}
