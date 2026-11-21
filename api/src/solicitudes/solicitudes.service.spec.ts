import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecursosService } from '../recursos/recursos.service.js';
import { SolicitudesService } from './solicitudes.service.js';

describe('SolicitudesService: solicitar préstamo (HU-03)', () => {
  let recursos: RecursosService;
  let service: SolicitudesService;
  let casio: { id: number };

  beforeEach(() => {
    recursos = new RecursosService();
    service = new SolicitudesService(recursos);
    casio = recursos.crear({ nombre: 'Casio fx-991', categoria: 'calculadora', propietarioId: 1 });
  });

  // Criterio (a)
  it('con fechas válidas la solicitud queda pendiente', () => {
    const s = service.crear({ recursoId: casio.id, inicio: '2026-11-20', fin: '2026-11-22', solicitanteId: 2 });
    expect(s).toMatchObject({
      recursoId: casio.id,
      recursoNombre: 'Casio fx-991',
      solicitanteId: 2,
      rango: { inicio: '2026-11-20', fin: '2026-11-22' },
      estado: 'pendiente',
    });
    expect(service.listar()).toEqual([s]);
  });

  it('acepta un préstamo de un solo día (inicio igual a fin)', () => {
    const s = service.crear({ recursoId: casio.id, inicio: '2026-11-20', fin: '2026-11-20' });
    expect(s.estado).toBe('pendiente');
  });

  it('asigna ids distintos a cada solicitud', () => {
    const a = service.crear({ recursoId: casio.id, inicio: '2026-11-20', fin: '2026-11-21' });
    const b = service.crear({ recursoId: casio.id, inicio: '2026-11-25', fin: '2026-11-26' });
    expect(a.id).not.toBe(b.id);
  });

  // Criterio (b), regla R2
  it('rechaza una fecha de fin anterior a la de inicio con mensaje y no crea la solicitud', () => {
    expect(() => service.crear({ recursoId: casio.id, inicio: '2026-11-22', fin: '2026-11-20' })).toThrow(
      BadRequestException,
    );
    try {
      service.crear({ recursoId: casio.id, inicio: '2026-11-22', fin: '2026-11-20' });
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        message: ['La fecha de fin no puede ser anterior a la de inicio.'],
      });
    }
    expect(service.listar()).toHaveLength(0);
  });

  it('exige recurso y las dos fechas, y devuelve todos los mensajes juntos', () => {
    try {
      service.crear({});
      expect.unreachable();
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        message: [
          'Elige el recurso que quieres solicitar.',
          'La fecha de inicio es obligatoria.',
          'La fecha de fin es obligatoria.',
        ],
      });
    }
  });

  it('rechaza fechas con formato inválido o que no existen', () => {
    expect(() => service.crear({ recursoId: casio.id, inicio: '20/11/2026', fin: '2026-11-22' })).toThrow(
      BadRequestException,
    );
    expect(() => service.crear({ recursoId: casio.id, inicio: '2026-02-30', fin: '2026-03-02' })).toThrow(
      BadRequestException,
    );
    expect(service.listar()).toHaveLength(0);
  });

  it('rechaza un recurso que no existe', () => {
    expect(() => service.crear({ recursoId: 999, inicio: '2026-11-20', fin: '2026-11-22' })).toThrow(
      NotFoundException,
    );
  });

  it('rechaza un recurso averiado', () => {
    const roto = recursos.crear({ nombre: 'Mouse', categoria: 'periferico', propietarioId: 1 });
    recursos.buscarPorId(roto.id)!.estado = 'averiado';
    expect(() => service.crear({ recursoId: roto.id, inicio: '2026-11-20', fin: '2026-11-22' })).toThrow(
      /averiado/,
    );
    expect(service.listar()).toHaveLength(0);
  });

  it('filtra las solicitudes por solicitante', () => {
    const mia = service.crear({ recursoId: casio.id, inicio: '2026-11-20', fin: '2026-11-21', solicitanteId: 2 });
    service.crear({ recursoId: casio.id, inicio: '2026-11-25', fin: '2026-11-26', solicitanteId: 3 });
    expect(service.listar({ solicitanteId: 2 })).toEqual([mia]);
  });
});
