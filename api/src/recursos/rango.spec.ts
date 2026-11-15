import { seSuperpone } from './rango.js';

describe('seSuperpone (regla R1)', () => {
  it('detecta rangos que se cruzan', () => {
    expect(seSuperpone({ inicio: '2026-11-10', fin: '2026-11-15' }, { inicio: '2026-11-12', fin: '2026-11-20' })).toBe(true);
  });

  it('detecta un rango contenido en otro', () => {
    expect(seSuperpone({ inicio: '2026-11-10', fin: '2026-11-30' }, { inicio: '2026-11-12', fin: '2026-11-14' })).toBe(true);
  });

  it('cuenta los extremos como ocupados (mismo día de fin e inicio)', () => {
    expect(seSuperpone({ inicio: '2026-11-10', fin: '2026-11-15' }, { inicio: '2026-11-15', fin: '2026-11-18' })).toBe(true);
  });

  it('no se superponen rangos separados', () => {
    expect(seSuperpone({ inicio: '2026-11-10', fin: '2026-11-14' }, { inicio: '2026-11-15', fin: '2026-11-18' })).toBe(false);
  });
});
