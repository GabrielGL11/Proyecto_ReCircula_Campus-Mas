import { esCategoria, type Categoria } from './recurso.js';
import type { Rango } from './rango.js';

// Validaciones puras (sin Nest ni base de datos). Las usan el servicio en memoria y el de Postgres.

export function validarNombreYCategoria(
  nombre: unknown,
  categoria: unknown,
): { errores: string[]; nombre: string; categoria?: Categoria } {
  const errores: string[] = [];

  let nombreLimpio = '';
  if (typeof nombre === 'string') {
    nombreLimpio = nombre.trim();
    if (!nombreLimpio) errores.push('El nombre es obligatorio.');
  } else if (nombre === undefined || nombre === null) {
    errores.push('El nombre es obligatorio.');
  } else {
    errores.push('El nombre debe ser texto.');
  }

  if (categoria === undefined || categoria === null || categoria === '') {
    errores.push('La categoría es obligatoria.');
  } else if (!esCategoria(categoria)) {
    errores.push('La categoría no es válida.');
  }

  return { errores, nombre: nombreLimpio, categoria: esCategoria(categoria) ? categoria : undefined };
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// HU-02: sin fechas no hay filtro; con fechas deben venir las dos, válidas y en orden.
export function validarFiltroFechas(desde?: string, hasta?: string): { rango: Rango | null; error?: string } {
  if (!desde && !hasta) return { rango: null };
  if (!desde || !hasta) return { rango: null, error: 'Indica la fecha inicial y la final.' };
  const valida = (f: string) => FECHA_ISO.test(f) && !Number.isNaN(Date.parse(f));
  if (!valida(desde) || !valida(hasta)) {
    return { rango: null, error: 'Las fechas no son válidas (usa AAAA-MM-DD).' };
  }
  if (hasta < desde) return { rango: null, error: 'La fecha final no puede ser anterior a la inicial.' };
  return { rango: { inicio: desde, fin: hasta } };
}
