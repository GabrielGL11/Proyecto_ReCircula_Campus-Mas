export const CATEGORIAS = ['calculadora', 'cable', 'periferico', 'kit-laboratorio', 'otro'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export interface Recurso {
  id: number;
  nombre: string;
  categoria: Categoria;
  estado: 'disponible' | 'averiado';
  propietarioId: number;
}

export interface CrearRecursoDto {
  nombre?: string;
  categoria?: string;
  propietarioId?: number;
}
