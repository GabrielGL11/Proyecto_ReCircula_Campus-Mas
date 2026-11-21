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
