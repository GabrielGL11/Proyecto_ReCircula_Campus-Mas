import { esFechaIso } from './rango.js';

describe('esFechaIso', () => {
  it('acepta una fecha ISO válida', () => {
    expect(esFechaIso('2026-11-20')).toBe(true);
  });

  it('rechaza otros formatos, vacíos y fechas que no existen', () => {
    expect(esFechaIso('20/11/2026')).toBe(false);
    expect(esFechaIso('')).toBe(false);
    expect(esFechaIso('2026-02-30')).toBe(false);
  });
});
