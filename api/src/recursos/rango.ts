// Rango de fechas en formato ISO (AAAA-MM-DD), con extremos incluidos.
export interface Rango {
  inicio: string;
  fin: string;
}

// Regla R1: dos rangos se superponen si cada uno empieza antes de que termine el otro.
// Las fechas ISO se comparan bien como texto.
export function seSuperpone(a: Rango, b: Rango): boolean {
  return a.inicio <= b.fin && b.inicio <= a.fin;
}

// Una fecha ISO válida: formato AAAA-MM-DD y que exista en el calendario (rechaza 2026-02-30).
export function esFechaIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// "Hoy" según el campus (Ecuador, UTC-5, sin horario de verano). Con la fecha UTC, entre las 19:00 y las
// 24:00 en Ecuador ya sería "mañana" y una solicitud para hoy se rechazaría como si fuera del pasado.
const ZONA_CAMPUS = 'America/Guayaquil';

export function hoyIso(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_CAMPUS }).format(ahora);
}
