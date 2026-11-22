import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import type { DbService } from '../db/db.service.js';
import { SolicitudesPgService } from './solicitudes.pg.service.js';

const ana: Usuario = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };
const carlos: Usuario = { id: 2, nombre: 'Carlos Vaca', rol: 'propietario' };
const coordinacion: Usuario = { id: 5, nombre: 'Coordinación', rol: 'coordinador' };

// Base de datos falsa: comprobamos qué SQL y parámetros manda el servicio y cómo traduce los errores.
function crearDbFalsa() {
  const fila = {
    id: 7,
    recursoId: 6,
    recursoNombre: 'Casio fx-991',
    solicitanteId: 4,
    inicio: '2026-11-20',
    fin: '2026-11-22',
    estado: 'pendiente',
  };
  const query = vi.fn().mockResolvedValue({ rows: [fila] });
  const clienteQuery = vi.fn().mockResolvedValue({ rows: [fila] });
  const comoActor = vi.fn(async (_id: number, fn: (c: unknown) => Promise<unknown>) => fn({ query: clienteQuery }));
  const db = { query, comoActor } as unknown as DbService;
  return { db, query, clienteQuery, comoActor };
}

describe('SolicitudesPgService: solicitar préstamo (HU-03)', () => {
  // Criterio (a)
  it('con fechas válidas devuelve la solicitud pendiente, a nombre del usuario autenticado', async () => {
    const { db, comoActor, clienteQuery } = crearDbFalsa();
    const s = await new SolicitudesPgService(db).crear({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' }, ana);

    expect(s).toEqual({
      id: 7,
      recursoId: 6,
      recursoNombre: 'Casio fx-991',
      solicitanteId: 4,
      rango: { inicio: '2026-11-20', fin: '2026-11-22' },
      estado: 'pendiente',
    });
    expect(comoActor).toHaveBeenCalledWith(ana.id, expect.any(Function));
    expect(clienteQuery.mock.calls[0][1]).toEqual([6, ana.id, '2026-11-20', '2026-11-22']);
  });

  it('acepta un préstamo de un solo día (inicio igual a fin)', async () => {
    const { db, comoActor } = crearDbFalsa();
    await new SolicitudesPgService(db).crear({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-20' }, ana);
    expect(comoActor).toHaveBeenCalledOnce();
  });

  // RNF-03: la identidad sale del token
  it('ignora el solicitanteId que mande el cliente en el body', async () => {
    const { db, clienteQuery } = crearDbFalsa();
    const cuerpo = { recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22', solicitanteId: 99 };
    await new SolicitudesPgService(db).crear(cuerpo, ana);
    expect(clienteQuery.mock.calls[0][1]).toEqual([6, ana.id, '2026-11-20', '2026-11-22']);
  });

  // Criterio (b), regla R2, y RNF-02: no toca la base
  it('rechaza fin anterior a inicio con mensaje y no toca la base', async () => {
    const { db, comoActor } = crearDbFalsa();
    const servicio = new SolicitudesPgService(db);
    await expect(servicio.crear({ recursoId: 6, inicio: '2026-11-22', fin: '2026-11-20' }, ana)).rejects.toMatchObject({
      response: { message: ['La fecha de fin no puede ser anterior a la de inicio.'] },
    });
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('exige recurso y las dos fechas, y devuelve todos los mensajes juntos', async () => {
    const { db, comoActor } = crearDbFalsa();
    await expect(new SolicitudesPgService(db).crear({}, ana)).rejects.toMatchObject({
      response: {
        message: [
          'Elige el recurso que quieres solicitar.',
          'La fecha de inicio es obligatoria.',
          'La fecha de fin es obligatoria.',
        ],
      },
    });
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('responde 400 si no llega body', async () => {
    const { db } = crearDbFalsa();
    await expect(new SolicitudesPgService(db).crear(undefined, ana)).rejects.toThrow(BadRequestException);
  });

  it('rechaza fechas con formato inválido o que no existen', async () => {
    const { db, comoActor } = crearDbFalsa();
    const servicio = new SolicitudesPgService(db);
    await expect(servicio.crear({ recursoId: 6, inicio: '20/11/2026', fin: '2026-11-22' }, ana)).rejects.toThrow(
      BadRequestException,
    );
    await expect(servicio.crear({ recursoId: 6, inicio: '2026-02-30', fin: '2026-03-02' }, ana)).rejects.toThrow(
      BadRequestException,
    );
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('traduce "recurso no existe" de la base a 404', async () => {
    const { db, comoActor } = crearDbFalsa();
    comoActor.mockRejectedValueOnce({ code: 'P0002', message: 'El recurso 999 no existe' });
    await expect(
      new SolicitudesPgService(db).crear({ recursoId: 999, inicio: '2026-11-20', fin: '2026-11-22' }, ana),
    ).rejects.toThrow(NotFoundException);
  });

  it('traduce "recurso averiado" de la base a 400 con el mensaje de la base', async () => {
    const { db, comoActor } = crearDbFalsa();
    comoActor.mockRejectedValueOnce({ code: '23514', message: 'El recurso está averiado y no se puede solicitar' });
    await expect(
      new SolicitudesPgService(db).crear({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' }, ana),
    ).rejects.toMatchObject({ response: { message: ['El recurso está averiado y no se puede solicitar'] } });
  });

  // RNF-03: HU-03 es solo para solicitantes
  it('un propietario o el coordinador no pueden solicitar y no se toca la base', async () => {
    const { db, comoActor } = crearDbFalsa();
    const servicio = new SolicitudesPgService(db);
    const datos = { recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' };
    await expect(servicio.crear(datos, carlos)).rejects.toThrow(ForbiddenException);
    await expect(servicio.crear(datos, coordinacion)).rejects.toThrow(ForbiddenException);
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('lista solo las solicitudes del usuario autenticado', async () => {
    const { db, query } = crearDbFalsa();
    const lista = await new SolicitudesPgService(db).listar(ana);
    expect(query.mock.calls[0][1]).toEqual([ana.id]);
    expect(lista).toHaveLength(1);
    expect(lista[0].rango).toEqual({ inicio: '2026-11-20', fin: '2026-11-22' });
  });
});

// ---------------------------------------------------------------------------------------------
// HU-04: aprobar o rechazar una solicitud.  TDD · Ciclo 1: superposición de fechas (regla R1).
// La base ya aplica R1 y R3 (aprobar_solicitud / rechazar_solicitud); aquí se prueba que la API
// llame a esas funciones con el usuario del token y que traduzca cada error a un mensaje claro (RNF-02).
// ---------------------------------------------------------------------------------------------
function crearDbDecision(estado: 'confirmada' | 'rechazada') {
  const fila = {
    id: 10,
    recursoId: 6,
    recursoNombre: 'Casio fx-991',
    solicitanteId: 4,
    inicio: '2026-11-20',
    fin: '2026-11-22',
    estado,
  };
  const clienteQuery = vi.fn().mockResolvedValue({ rows: [fila] });
  const comoActor = vi.fn(async (_id: number, fn: (c: unknown) => Promise<unknown>) => fn({ query: clienteQuery }));
  const query = vi.fn().mockResolvedValue({ rows: [{ ...fila, estado: 'pendiente' }] });
  const db = { query, comoActor } as unknown as DbService;
  return { db, query, clienteQuery, comoActor };
}

describe('SolicitudesPgService: aprobar solicitud (HU-04)', () => {
  // Criterio (a): sin superposición, la aprobación confirma el préstamo
  it('(a) aprueba una solicitud pendiente y queda confirmada', async () => {
    const { db, comoActor, clienteQuery } = crearDbDecision('confirmada');
    const s = await new SolicitudesPgService(db).aprobar(10, carlos);

    expect(s).toEqual({
      id: 10,
      recursoId: 6,
      recursoNombre: 'Casio fx-991',
      solicitanteId: 4,
      rango: { inicio: '2026-11-20', fin: '2026-11-22' },
      estado: 'confirmada',
    });
    expect(comoActor).toHaveBeenCalledWith(carlos.id, expect.any(Function));
    expect(clienteQuery.mock.calls[0][0]).toContain('aprobar_solicitud');
    expect(clienteQuery.mock.calls[0][1]).toEqual([10]);
  });

  // Criterio (b): CON superposición la aprobación falla (alternativa del BPMN: error, la solicitud sigue pendiente)
  it('(b) con superposición la aprobación falla con un mensaje comprensible', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    comoActor.mockRejectedValueOnce({
      code: '23P01',
      message: 'La solicitud se superpone con un préstamo confirmado',
    });

    const error = await new SolicitudesPgService(db).aprobar(10, carlos).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: ['La solicitud se superpone con un préstamo confirmado'],
    });
  });

  // Criterio (c): solo el propietario o el coordinador
  it('(c) el coordinador también puede aprobar', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    await new SolicitudesPgService(db).aprobar(10, coordinacion);
    expect(comoActor).toHaveBeenCalledWith(coordinacion.id, expect.any(Function));
  });

  it('(c) un solicitante no puede aprobar y no se toca la base', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    await expect(new SolicitudesPgService(db).aprobar(10, ana)).rejects.toThrow(ForbiddenException);
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('(c) un propietario que no es dueño del recurso recibe 403 con el mensaje de la base', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    comoActor.mockRejectedValueOnce({
      code: '42501',
      message: 'Solo el propietario o el coordinador pueden aprobar una solicitud',
    });
    const error = await new SolicitudesPgService(db).aprobar(10, carlos).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      message: ['Solo el propietario o el coordinador pueden aprobar una solicitud'],
    });
  });

  // RNF-02: casos negativos con mensaje comprensible
  it('RNF-02: una solicitud que no existe responde 404', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    comoActor.mockRejectedValueOnce({
      code: 'P0002',
      message: 'La solicitud 999 no existe',
    });
    await expect(new SolicitudesPgService(db).aprobar(999, carlos)).rejects.toThrow(NotFoundException);
  });

  it('RNF-02: una solicitud que ya no está pendiente responde 400 con el mensaje de la base', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    comoActor.mockRejectedValueOnce({
      code: '23514',
      message: 'Solo se puede aprobar una solicitud pendiente (estado actual: confirmada)',
    });
    const error = await new SolicitudesPgService(db).aprobar(10, carlos).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: ['Solo se puede aprobar una solicitud pendiente (estado actual: confirmada)'],
    });
  });

  it('RNF-02: un id inválido responde 400 y no toca la base', async () => {
    const { db, comoActor } = crearDbDecision('confirmada');
    const servicio = new SolicitudesPgService(db);
    for (const id of [0, -3, 1.5, Number.NaN]) {
      const error = await servicio.aprobar(id, carlos).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: ['Indica una solicitud válida.'],
      });
    }
    expect(comoActor).not.toHaveBeenCalled();
  });
});

describe('SolicitudesPgService: rechazar solicitud (HU-04)', () => {
  it('rechaza una solicitud pendiente y queda rechazada', async () => {
    const { db, comoActor, clienteQuery } = crearDbDecision('rechazada');
    const s = await new SolicitudesPgService(db).rechazar(10, carlos);
    expect(s.estado).toBe('rechazada');
    expect(comoActor).toHaveBeenCalledWith(carlos.id, expect.any(Function));
    expect(clienteQuery.mock.calls[0][0]).toContain('rechazar_solicitud');
    expect(clienteQuery.mock.calls[0][1]).toEqual([10]);
  });

  it('un solicitante no puede rechazar y no se toca la base', async () => {
    const { db, comoActor } = crearDbDecision('rechazada');
    await expect(new SolicitudesPgService(db).rechazar(10, ana)).rejects.toThrow(ForbiddenException);
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('RNF-02: un propietario ajeno al recurso recibe 403 con el mensaje de la base', async () => {
    const { db, comoActor } = crearDbDecision('rechazada');
    comoActor.mockRejectedValueOnce({
      code: '42501',
      message: 'Solo el propietario o el coordinador pueden rechazar una solicitud',
    });
    await expect(new SolicitudesPgService(db).rechazar(10, carlos)).rejects.toThrow(ForbiddenException);
  });

  it('RNF-02: un id inválido responde 400 y no toca la base', async () => {
    const { db, comoActor } = crearDbDecision('rechazada');
    await expect(new SolicitudesPgService(db).rechazar(Number.NaN, carlos)).rejects.toThrow(BadRequestException);
    expect(comoActor).not.toHaveBeenCalled();
  });
});

describe('SolicitudesPgService: solicitudes pendientes por decidir (HU-04)', () => {
  it('el propietario ve solo las pendientes de sus recursos', async () => {
    const { db, query } = crearDbDecision('confirmada');
    const lista = await new SolicitudesPgService(db).listarPendientes(carlos);
    expect(query.mock.calls[0][1]).toEqual([carlos.id, false]);
    expect(lista[0].estado).toBe('pendiente');
  });

  it('el coordinador ve las pendientes de todos los recursos', async () => {
    const { db, query } = crearDbDecision('confirmada');
    await new SolicitudesPgService(db).listarPendientes(coordinacion);
    expect(query.mock.calls[0][1]).toEqual([coordinacion.id, true]);
  });

  it('un solicitante no puede ver las pendientes por decidir', async () => {
    const { db, query } = crearDbDecision('confirmada');
    await expect(new SolicitudesPgService(db).listarPendientes(ana)).rejects.toThrow(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
});
