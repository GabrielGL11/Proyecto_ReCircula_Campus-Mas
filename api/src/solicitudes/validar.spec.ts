import { validarSolicitud } from './validar.js';

const base = { recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' };

describe('validarSolicitud: fechas en el pasado (HU-03)', () => {
  it('rechaza un inicio anterior a hoy', () => {
    const errores = validarSolicitud({ ...base, inicio: '2026-11-09', fin: '2026-11-12' }, '2026-11-10');
    expect(errores).toEqual(['La fecha de inicio no puede estar en el pasado.']);
  });

  it('acepta empezar hoy y también fechas futuras', () => {
    expect(validarSolicitud({ ...base, inicio: '2026-11-10', fin: '2026-11-10' }, '2026-11-10')).toEqual([]);
    expect(validarSolicitud(base, '2026-11-10')).toEqual([]);
  });

  it('no añade el aviso de pasado cuando el inicio ni siquiera es una fecha válida', () => {
    const errores = validarSolicitud({ ...base, inicio: '2026-02-30', fin: '2026-03-02' }, '2026-11-10');
    expect(errores).toEqual(['La fecha de inicio no es válida (usa AAAA-MM-DD).']);
  });

  it('junta todos los mensajes (RNF-02): inicio pasado y fin anterior al inicio', () => {
    const errores = validarSolicitud({ ...base, inicio: '2026-11-05', fin: '2026-11-01' }, '2026-11-10');
    expect(errores).toEqual([
      'La fecha de fin no puede ser anterior a la de inicio.',
      'La fecha de inicio no puede estar en el pasado.',
    ]);
  });
});
