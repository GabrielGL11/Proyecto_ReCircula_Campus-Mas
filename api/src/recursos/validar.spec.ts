import { validarFiltroFechas } from './validar.js';

describe('validarFiltroFechas (HU-02)', () => {
  it('sin fechas no hay filtro', () => {
    expect(validarFiltroFechas(undefined, undefined)).toEqual({ rango: null });
  });

  it('con las dos fechas válidas y en orden devuelve el rango', () => {
    expect(validarFiltroFechas('2026-11-26', '2026-11-27')).toEqual({
      rango: { inicio: '2026-11-26', fin: '2026-11-27' },
    });
  });

  it('pide las dos fechas si falta una', () => {
    expect(validarFiltroFechas('2026-11-26', undefined).error).toBe('Indica la fecha inicial y la final.');
  });

  it('rechaza fechas que no existen en el calendario (RNF-02), no solo las de formato incorrecto', () => {
    const esperado = { rango: null, error: 'Las fechas no son válidas (usa AAAA-MM-DD).' };
    expect(validarFiltroFechas('2026-02-30', '2026-03-02')).toEqual(esperado);
    expect(validarFiltroFechas('2026-11-26', '2026-11-31')).toEqual(esperado);
    expect(validarFiltroFechas('26/11/2026', '27/11/2026')).toEqual(esperado);
  });

  it('rechaza una fecha final anterior a la inicial', () => {
    expect(validarFiltroFechas('2026-11-27', '2026-11-26').error).toBe(
      'La fecha final no puede ser anterior a la inicial.',
    );
  });
});
