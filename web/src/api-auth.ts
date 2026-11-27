import { supabase } from './supabase';

// Error de la API con el código HTTP y los mensajes en español que ya manda el servidor.
export class ErrorApi extends Error {
  readonly estado: number;
  readonly mensajes: string[];
  constructor(estado: number, mensajes: string[]) {
    super(mensajes.join(' '));
    this.estado = estado;
    this.mensajes = mensajes;
  }
}

// fetch que agrega el token de la sesión. Úsalo en lugar de fetch en api.ts:
//   apiFetch<Recurso[]>('/recursos?categoria=cable')
//   apiFetch<Solicitud>('/solicitudes', { method: 'POST', body: JSON.stringify({...}) })
export async function apiFetch<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const encabezados = new Headers(opciones.headers);
  if (opciones.body && !encabezados.has('Content-Type')) {
    encabezados.set('Content-Type', 'application/json');
  }
  if (token) encabezados.set('Authorization', `Bearer ${token}`);

  // El proxy de Vite envía /api/* a http://localhost:4200
  const respuesta = await fetch(`/api${ruta}`, { ...opciones, headers: encabezados });

  if (!respuesta.ok) {
    let mensajes = ['Ocurrió un error. Inténtalo de nuevo.'];
    try {
      const cuerpo = await respuesta.json();
      if (Array.isArray(cuerpo.message)) mensajes = cuerpo.message;
      else if (typeof cuerpo.message === 'string') mensajes = [cuerpo.message];
    } catch {
      /* la respuesta no era JSON: se deja el mensaje genérico */
    }
    // Un error 5xx es del servidor (p. ej. "Internal server error", en inglés): no se le enseña a la persona.
    if (respuesta.status >= 500) mensajes = ['Ocurrió un error en el servidor. Inténtalo de nuevo en unos minutos.'];
    throw new ErrorApi(respuesta.status, mensajes);
  }
  return (respuesta.status === 204 ? undefined : await respuesta.json()) as T;
}
