// Las categorías las define la API (GET /categorias): aquí no se duplican.
export interface Categoria {
  valor: string
  etiqueta: string
}

export async function listarCategorias(): Promise<Categoria[]> {
  const res = await fetch('/api/categorias')
  if (!res.ok) throw await leerError(res)
  return res.json()
}

// Hoy (AAAA-MM-DD) según la hora de Ecuador, para bloquear fechas pasadas en el calendario.
export const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date())

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

// TODO(JWT): cuando haya autenticación, el propietario lo deduce la API del token
// y `propietarioId` deja de enviarse desde aquí.
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
