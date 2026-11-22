import { esFechaIso, hoyIso } from './rango.js';

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

describe('hoyIso', () => {
  it('usa la fecha del campus (Ecuador), no la de UTC', () => {
    // 20:58 del 21/11 en Ecuador ya es el 22/11 en UTC: una solicitud para "hoy" no debe verse como pasada.
    expect(hoyIso(new Date('2026-11-22T01:58:00Z'))).toBe('2026-11-21');
  });

  it('cambia de día a la medianoche de Ecuador', () => {
    expect(hoyIso(new Date('2026-11-22T04:59:00Z'))).toBe('2026-11-21');
    expect(hoyIso(new Date('2026-11-22T05:00:00Z'))).toBe('2026-11-22');
  });
});
