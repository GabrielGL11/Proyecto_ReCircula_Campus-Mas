import { ErrorApi, apiFetch } from './api-auth.ts'

export const CATEGORIAS = [
  { valor: 'calculadora', etiqueta: 'Calculadora' },
  { valor: 'cable', etiqueta: 'Cable' },
  { valor: 'periferico', etiqueta: 'Periférico (ratón, teclado…)' },
  { valor: 'kit-laboratorio', etiqueta: 'Kit de laboratorio' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const

export interface Recurso {
  id: number
  nombre: string
  categoria: string
  estado: 'disponible' | 'averiado' | 'retirado'
  propietarioId: number
}

export interface Filtros {
  categoria?: string
  desde?: string
  hasta?: string
}

// Las pantallas esperan un arreglo de mensajes en español (string[]), así que el ErrorApi
// de apiFetch se convierte aquí. Cualquier otro fallo (API apagada, sin red) pasa tal cual.
async function conMensajes<T>(peticion: Promise<T>): Promise<T> {
  try {
    return await peticion
  } catch (error) {
    if (error instanceof ErrorApi) throw error.mensajes
    throw error
  }
}

export function listarRecursos(filtros: Filtros = {}): Promise<Recurso[]> {
  const params = new URLSearchParams()
  if (filtros.categoria) params.set('categoria', filtros.categoria)
  if (filtros.desde) params.set('desde', filtros.desde)
  if (filtros.hasta) params.set('hasta', filtros.hasta)
  const consulta = params.toString()
  return conMensajes(apiFetch<Recurso[]>(`/recursos${consulta ? `?${consulta}` : ''}`))
}

// El propietario sale del token en la API: ya no se manda propietarioId.
export function publicarRecurso(datos: { nombre: string; categoria: string }): Promise<Recurso> {
  return conMensajes(apiFetch<Recurso>('/recursos', { method: 'POST', body: JSON.stringify(datos) }))
}

export interface Solicitud {
  id: number
  recursoId: number
  recursoNombre: string
  solicitanteId: number
  rango: { inicio: string; fin: string }
  estado: 'pendiente' | 'confirmada' | 'rechazada' | 'devuelta' | 'en_espera_mantenimiento'
}

// El solicitante sale del token en la API: ya no se manda solicitanteId.
export function crearSolicitud(datos: { recursoId: number; inicio: string; fin: string }): Promise<Solicitud> {
  return conMensajes(apiFetch<Solicitud>('/solicitudes', { method: 'POST', body: JSON.stringify(datos) }))
}

// Devuelve las solicitudes de la persona con sesión iniciada.
export function listarSolicitudes(): Promise<Solicitud[]> {
  return conMensajes(apiFetch<Solicitud[]>('/solicitudes'))
}

// HU-04: solicitudes pendientes que le toca decidir al propietario (o a la coordinación).
export function listarPendientes(): Promise<Solicitud[]> {
  return conMensajes(apiFetch<Solicitud[]>('/solicitudes/pendientes'))
}

export function aprobarSolicitud(id: number): Promise<Solicitud> {
  return conMensajes(apiFetch<Solicitud>(`/solicitudes/${id}/aprobar`, { method: 'PATCH' }))
}

export function rechazarSolicitud(id: number): Promise<Solicitud> {
  return conMensajes(apiFetch<Solicitud>(`/solicitudes/${id}/rechazar`, { method: 'PATCH' }))
}

export interface Usuario {
  id: number
  nombre: string
  rol: 'solicitante' | 'propietario' | 'coordinador'
}

// Quién es la persona con sesión iniciada y qué rol tiene (GET /auth/yo).
export function obtenerUsuario(): Promise<Usuario> {
  return conMensajes(apiFetch<Usuario>('/auth/yo'))
}
