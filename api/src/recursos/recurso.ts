// Única fuente de verdad de las categorías: el frontend las pide con GET /categorias.
// Para agregar una categoría basta con añadirla aquí.
export const ETIQUETAS_CATEGORIA = {
  calculadora: 'Calculadora',
  cable: 'Cable',
  periferico: 'Periférico (ratón, teclado…)',
  'kit-laboratorio': 'Kit de laboratorio',
  otro: 'Otro',
} as const;

export type Categoria = keyof typeof ETIQUETAS_CATEGORIA;
export const CATEGORIAS = Object.keys(ETIQUETAS_CATEGORIA) as Categoria[];

export function esCategoria(valor: unknown): valor is Categoria {
  return typeof valor === 'string' && (CATEGORIAS as string[]).includes(valor);
}

export function listarCategorias(): { valor: Categoria; etiqueta: string }[] {
  return CATEGORIAS.map((valor) => ({ valor, etiqueta: ETIQUETAS_CATEGORIA[valor] }));
}

export type EstadoRecurso = 'disponible' | 'averiado';

export interface Recurso {
  id: number;
  nombre: string;
  categoria: Categoria;
  estado: EstadoRecurso;
  propietarioId: number;
}

// Lo que llega en el body del POST. Los campos son `unknown` porque el cliente
// puede mandar cualquier cosa (números, null, objetos...) y hay que validarlos.
export interface CrearRecursoDto {
  nombre?: unknown;
  categoria?: unknown;
  // TODO(JWT): cuando exista autenticación, el propietario saldrá del token y este
  // campo desaparecerá del body. Por ahora lo manda el cliente (no es seguro).
  propietarioId?: unknown;
}
