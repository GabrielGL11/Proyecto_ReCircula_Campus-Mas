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

export async function listarRecursos(): Promise<Recurso[]> {
  const res = await fetch('/api/recursos')
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
