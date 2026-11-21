import { esFechaIso } from '../recursos/rango.js';
import type { CrearSolicitudDto } from './solicitud.js';

const vacio = (v: unknown) => v === undefined || v === null || v === '';

// HU-03: validaciones puras de lo que llega por HTTP. Devuelve todos los mensajes juntos (RNF-02).
export function validarSolicitud(datos: CrearSolicitudDto | undefined): string[] {
  const { recursoId, inicio, fin } = datos ?? {};
  const errores: string[] = [];

  if (!Number.isInteger(recursoId)) errores.push('Elige el recurso que quieres solicitar.');

  if (vacio(inicio)) errores.push('La fecha de inicio es obligatoria.');
  else if (typeof inicio !== 'string' || !esFechaIso(inicio)) {
    errores.push('La fecha de inicio no es válida (usa AAAA-MM-DD).');
  }

  if (vacio(fin)) errores.push('La fecha de fin es obligatoria.');
  else if (typeof fin !== 'string' || !esFechaIso(fin)) {
    errores.push('La fecha de fin no es válida (usa AAAA-MM-DD).');
  }

  // Regla R2: el fin no puede ser anterior al inicio.
  if (typeof inicio === 'string' && typeof fin === 'string' && esFechaIso(inicio) && esFechaIso(fin) && fin < inicio) {
    errores.push('La fecha de fin no puede ser anterior a la de inicio.');
  }

  return errores;
}
