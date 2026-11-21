import { createClient } from '@supabase/supabase-js';

// Solo la clave PÚBLICA (publishable/anon). Nunca pongas aquí una service_role o sb_secret_.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const clave = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

if (!url || !clave) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_KEY en web/.env');
}

export const supabase = createClient(url, clave);
