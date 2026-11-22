export const CATEGORIAS = ['calculadora', 'cable', 'periferico', 'kit-laboratorio', 'otro'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export function esCategoria(valor: unknown): valor is Categoria {
  return typeof valor === 'string' && (CATEGORIAS as readonly string[]).includes(valor);
}

export interface Recurso {
  id: number;
  nombre: string;
  categoria: Categoria;
  estado: 'disponible' | 'averiado';
  propietarioId: number;
}

// Lo que llega en el body del POST. Los campos son `unknown` porque el cliente
// puede mandar cualquier cosa (números, null, objetos...) y hay que validarlos.
export interface CrearRecursoDto {
  nombre?: unknown;
  categoria?: unknown;
  // El servicio lo ignora: el propietario sale del token (RNF-03), nunca del body.
  propietarioId?: unknown;
}
