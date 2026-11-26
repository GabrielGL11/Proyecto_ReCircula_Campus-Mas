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
  fechaDevolucionReal?: string
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

export function listarConfirmadas(): Promise<Solicitud[]> {
  return conMensajes(apiFetch<Solicitud[]>('/solicitudes/confirmadas'))
}

export function registrarDevolucion(id: number): Promise<Solicitud> {
  return conMensajes(apiFetch<Solicitud>(`/solicitudes/${id}/devolucion`, { method: 'PATCH' }))
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
export function reportarAveria(id: number, descripcion: string) {
  return conMensajes(
    apiFetch(`/recursos/${id}/averias`, {
      method: 'POST',
      body: JSON.stringify({ descripcion }),
    }),
  )
}

export interface EntradaEspera {
  id: number
  recursoId: number
  recursoNombre: string
  solicitanteId: number
  rango: { inicio: string; fin: string }
  estado: 'en_espera' | 'promovida' | 'cancelada'
  solicitudId?: number | null
  creadoEn: string
}

// HU-07: anotarse en la lista de espera de un recurso ocupado.
export function anotarEnListaEspera(datos: { recursoId: number; inicio: string; fin: string }): Promise<EntradaEspera> {
  return conMensajes(apiFetch<EntradaEspera>('/lista-espera', { method: 'POST', body: JSON.stringify(datos) }))
}

export function listarListaEspera(): Promise<EntradaEspera[]> {
  return conMensajes(apiFetch<EntradaEspera[]>('/lista-espera'))
}

export function cancelarListaEspera(id: number): Promise<EntradaEspera> {
  return conMensajes(apiFetch<EntradaEspera>(`/lista-espera/${id}/cancelar`, { method: 'PATCH' }))
}

export type EstadoOrden = 'abierta' | 'en_reparacion' | 'resuelta'

export interface OrdenReparacion {
  id: number
  averiaId: number
  recursoId: number
  recursoNombre: string
  descripcion: string
  estado: EstadoOrden
  creadaPor: number
  creadaEn: string
  actualizadaEn: string
}

export interface AveriaSinOrden {
  id: number
  recursoId: number
  recursoNombre: string
  descripcion: string
  reportadaEn: string
}

export interface CambioEstadoOrden {
  id: number
  ordenId: number
  estadoAnterior: EstadoOrden | null
  estadoNuevo: EstadoOrden
  cambiadoPor: number
  cambiadoPorNombre: string
  cambiadoEn: string
}

// HU-08 (solo coordinador): averías que todavía no tienen orden de reparación.
export function listarAveriasSinOrden(): Promise<AveriaSinOrden[]> {
  return conMensajes(apiFetch<AveriaSinOrden[]>('/ordenes-reparacion/averias-sin-orden'))
}

export function listarOrdenes(): Promise<OrdenReparacion[]> {
  return conMensajes(apiFetch<OrdenReparacion[]>('/ordenes-reparacion'))
}

// (a) La orden nace "abierta" desde una avería.
export function abrirOrden(averiaId: number): Promise<OrdenReparacion> {
  return conMensajes(
    apiFetch<OrdenReparacion>('/ordenes-reparacion', { method: 'POST', body: JSON.stringify({ averiaId }) }),
  )
}

// (b) y (c) Solo abierta → en_reparacion → resuelta; la base rechaza los saltos.
export function avanzarOrden(id: number, estado: EstadoOrden): Promise<OrdenReparacion> {
  return conMensajes(
    apiFetch<OrdenReparacion>(`/ordenes-reparacion/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
  )
}

// (d) Quién cambió cada estado y cuándo.
export function listarHistorialOrden(id: number): Promise<CambioEstadoOrden[]> {
  return conMensajes(apiFetch<CambioEstadoOrden[]>(`/ordenes-reparacion/${id}/historial`))
}
