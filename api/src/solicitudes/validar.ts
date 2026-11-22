import { esFechaIso, hoyIso } from '../recursos/rango.js';
import type { CrearSolicitudDto } from './solicitud.js';

const vacio = (v: unknown) => v === undefined || v === null || v === '';

const esFecha = (v: unknown): v is string => typeof v === 'string' && esFechaIso(v);

// Mensaje de una fecha suelta (obligatoria y con formato válido), o null si está bien.
function errorDeFecha(valor: unknown, etiqueta: 'inicio' | 'fin'): string | null {
  if (vacio(valor)) return `La fecha de ${etiqueta} es obligatoria.`;
  if (!esFecha(valor)) return `La fecha de ${etiqueta} no es válida (usa AAAA-MM-DD).`;
  return null;
}

// HU-03: validaciones puras de lo que llega por HTTP. Devuelve todos los mensajes juntos (RNF-02).
// `hoy` es un parámetro para poder probar la regla sin depender del reloj.
export function validarSolicitud(datos: CrearSolicitudDto | undefined, hoy: string = hoyIso()): string[] {
  const { recursoId, inicio, fin } = datos ?? {};
  const errores: string[] = [];

  if (!Number.isInteger(recursoId)) errores.push('Elige el recurso que quieres solicitar.');

  for (const error of [errorDeFecha(inicio, 'inicio'), errorDeFecha(fin, 'fin')]) {
    if (error) errores.push(error);
  }

  // Regla R2: el fin no puede ser anterior al inicio.
  if (esFecha(inicio) && esFecha(fin) && fin < inicio) {
    errores.push('La fecha de fin no puede ser anterior a la de inicio.');
  }

  // No se admiten solicitudes que empiecen antes de hoy.
  if (esFecha(inicio) && inicio < hoy) errores.push('La fecha de inicio no puede estar en el pasado.');

  return errores;
}
