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
  estado: 'disponible' | 'averiado'
  propietarioId: number
}

async function leerError(res: Response): Promise<string[]> {
  try {
    const cuerpo = await res.json()
    const msg = cuerpo.message
    return Array.isArray(msg) ? msg : [String(msg ?? 'Error inesperado.')]
  } catch {
    return ['Error inesperado. Intenta de nuevo.']
  }
}

export interface Filtros {
  categoria?: string
  desde?: string
  hasta?: string
}

export async function listarRecursos(filtros: Filtros = {}): Promise<Recurso[]> {
  const params = new URLSearchParams()
  if (filtros.categoria) params.set('categoria', filtros.categoria)
  if (filtros.desde) params.set('desde', filtros.desde)
  if (filtros.hasta) params.set('hasta', filtros.hasta)
  const consulta = params.toString()
  const res = await fetch(`/api/recursos${consulta ? `?${consulta}` : ''}`)
  if (!res.ok) throw await leerError(res)
  return res.json()
}

export async function publicarRecurso(datos: {
  nombre: string
  categoria: string
  propietarioId: number
}): Promise<Recurso> {
  const res = await fetch('/api/recursos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!res.ok) throw await leerError(res)
  return res.json()
}

export interface Solicitud {
  id: number
  recursoId: number
  recursoNombre: string
  solicitanteId: number
  rango: { inicio: string; fin: string }
  estado: 'pendiente' | 'confirmada' | 'rechazada' | 'devuelta'
}

export async function crearSolicitud(datos: {
  recursoId: number
  inicio: string
  fin: string
  solicitanteId: number
}): Promise<Solicitud> {
  const res = await fetch('/api/solicitudes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  if (!res.ok) throw await leerError(res)
  return res.json()
}

export async function listarSolicitudes(solicitanteId: number): Promise<Solicitud[]> {
  const res = await fetch(`/api/solicitudes?solicitanteId=${solicitanteId}`)
  if (!res.ok) throw await leerError(res)
  return res.json()
}
