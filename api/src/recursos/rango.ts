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
