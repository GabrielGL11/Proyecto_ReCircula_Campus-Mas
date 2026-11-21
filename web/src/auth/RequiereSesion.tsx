import type { ReactNode } from 'react';
import Login from './Login';
import { useSesion } from './sesion';

// Muestra el login si no hay sesión; si la hay, muestra la aplicación.
export default function RequiereSesion({ children }: { children: ReactNode }) {
  const { session, cargando } = useSesion();
  if (cargando) return <p role="status">Cargando…</p>;
  if (!session) return <Login />;
  return <>{children}</>;
}
