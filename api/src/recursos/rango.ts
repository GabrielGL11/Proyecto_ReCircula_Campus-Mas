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
