import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import type { DbService } from '../db/db.service.js';
import { OrdenesReparacionPgService } from './ordenes-reparacion.pg.service.js';

const coordinacion: Usuario = { id: 3, nombre: 'Coordinación', rol: 'coordinador' };
const carlos: Usuario = { id: 2, nombre: 'Carlos Vaca', rol: 'propietario' };
const ana: Usuario = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };

function crearDbFalsa() {
  const fila = {
    id: 20,
    averiaId: 5,
    recursoId: 8,
    recursoNombre: 'Ratón inalámbrico Logitech',
    descripcion: 'La rueda de desplazamiento no responde',
    estado: 'abierta',
    creadaPor: 3,
    creadaEn: '2026-11-25T12:00:00.000Z',
    actualizadaEn: '2026-11-25T12:00:00.000Z',
  };
  const query = vi.fn().mockResolvedValue({ rows: [fila] });
  const clienteQuery = vi.fn().mockResolvedValue({ rows: [fila] });
  const comoActor = vi.fn(async (_id: number, fn: (c: unknown) => Promise<unknown>) => fn({ query: clienteQuery }));
  const db = { query, comoActor } as unknown as DbService;
  return { db, query, clienteQuery, comoActor, fila };
}

describe('OrdenesReparacionPgService (HU-08)', () => {
  describe('Abrir la orden desde una avería - Criterio (a)', () => {
    it('el coordinador abre una orden desde una avería y nace "abierta"', async () => {
      const { db, comoActor, clienteQuery, fila } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      const orden = await servicio.abrir({ averiaId: 5 }, coordinacion);

      expect(orden).toEqual(fila);
      expect(orden.estado).toBe('abierta');
      expect(comoActor).toHaveBeenCalledWith(coordinacion.id, expect.any(Function));
      expect(clienteQuery.mock.calls[0][0]).toContain('abrir_orden_reparacion($1::bigint)');
      expect(clienteQuery.mock.calls[0][1]).toEqual([5]);
    });

    it.each([carlos, ana])('rechaza abrir una orden a quien no es coordinador (%o)', async (usuario) => {
      const { db, comoActor } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.abrir({ averiaId: 5 }, usuario)).rejects.toThrow(ForbiddenException);
      expect(comoActor).not.toHaveBeenCalled();
    });

    it.each([undefined, null, 0, -1, 1.5, '5'])('rechaza una avería inválida (%o)', async (averiaId) => {
      const { db, comoActor } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.abrir({ averiaId }, coordinacion)).rejects.toThrow(BadRequestException);
      await expect(servicio.abrir(undefined, coordinacion)).rejects.toThrow(BadRequestException);
      expect(comoActor).not.toHaveBeenCalled();
    });

    it('responde 404 si la avería no existe', async () => {
      const { db, comoActor } = crearDbFalsa();
      comoActor.mockRejectedValue({ code: 'P0002', message: 'La avería 99 no existe' });
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.abrir({ averiaId: 99 }, coordinacion)).rejects.toThrow(NotFoundException);
    });

    it('responde 409 si la avería ya tiene una orden', async () => {
      const { db, comoActor } = crearDbFalsa();
      comoActor.mockRejectedValue({ code: '23505', constraint: 'ordenes_reparacion_averia_id_key' });
      const servicio = new OrdenesReparacionPgService(db);

      const error = await servicio.abrir({ averiaId: 5 }, coordinacion).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        message: ['Esa avería ya tiene una orden de reparación.'],
      });
    });
  });

  describe('Avanzar el estado sin saltar pasos - Criterio (b)', () => {
    it('permite pasar de abierta a en_reparacion', async () => {
      const { db, comoActor, clienteQuery, fila } = crearDbFalsa();
      clienteQuery.mockResolvedValue({ rows: [{ ...fila, estado: 'en_reparacion' }] });
      const servicio = new OrdenesReparacionPgService(db);

      const orden = await servicio.avanzar(20, { estado: 'en_reparacion' }, coordinacion);

      expect(orden.estado).toBe('en_reparacion');
      expect(comoActor).toHaveBeenCalledWith(coordinacion.id, expect.any(Function));
      expect(clienteQuery.mock.calls[0][0]).toContain('avanzar_orden($1::bigint, $2::text)');
      expect(clienteQuery.mock.calls[0][1]).toEqual([20, 'en_reparacion']);
    });

    it('permite pasar de en_reparacion a resuelta - Criterio (c)', async () => {
      // Que el recurso vuelva a quedar "disponible" lo hace el trigger de la base (db/04_tests.sql, HU-08 c):
      // la API solo tiene que pedir el avance y devolver la orden ya resuelta.
      const { db, clienteQuery, fila } = crearDbFalsa();
      clienteQuery.mockResolvedValue({ rows: [{ ...fila, estado: 'resuelta' }] });
      const servicio = new OrdenesReparacionPgService(db);

      const orden = await servicio.avanzar(20, { estado: 'resuelta' }, coordinacion);

      expect(orden.estado).toBe('resuelta');
      expect(clienteQuery.mock.calls[0][1]).toEqual([20, 'resuelta']);
    });

    it('no deja saltar estados: el mensaje de la base llega como 400', async () => {
      const { db, comoActor } = crearDbFalsa();
      comoActor.mockRejectedValue({ code: '23514', message: 'Transición no permitida: abierta → resuelta' });
      const servicio = new OrdenesReparacionPgService(db);

      const error = await servicio.avanzar(20, { estado: 'resuelta' }, coordinacion).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: ['Transición no permitida: abierta → resuelta'],
      });
    });

    it.each([undefined, null, 'cerrada', 5])('rechaza un estado que no existe (%o)', async (estado) => {
      const { db, comoActor } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.avanzar(20, { estado }, coordinacion)).rejects.toThrow(BadRequestException);
      expect(comoActor).not.toHaveBeenCalled();
    });

    it.each([0, -3, 2.5, Number.NaN])('rechaza una orden inválida (%o)', async (id) => {
      const { db, comoActor } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.avanzar(id, { estado: 'en_reparacion' }, coordinacion)).rejects.toThrow(
        BadRequestException,
      );
      expect(comoActor).not.toHaveBeenCalled();
    });

    it.each([carlos, ana])('rechaza cambiar el estado a quien no es coordinador (%o)', async (usuario) => {
      const { db, comoActor } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.avanzar(20, { estado: 'en_reparacion' }, usuario)).rejects.toThrow(ForbiddenException);
      expect(comoActor).not.toHaveBeenCalled();
    });

    it('responde 404 si la orden no existe', async () => {
      const { db, comoActor } = crearDbFalsa();
      comoActor.mockRejectedValue({ code: 'P0002', message: 'La orden 99 no existe' });
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.avanzar(99, { estado: 'en_reparacion' }, coordinacion)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Consultas e historial - Criterio (d)', () => {
    it('el historial muestra quién cambió cada estado y cuándo', async () => {
      const { db, query } = crearDbFalsa();
      const cambios = [
        {
          id: 1,
          ordenId: 20,
          estadoAnterior: null,
          estadoNuevo: 'abierta',
          cambiadoPor: 3,
          cambiadoPorNombre: 'Coordinación',
          cambiadoEn: '2026-11-25T12:00:00.000Z',
        },
        {
          id: 2,
          ordenId: 20,
          estadoAnterior: 'abierta',
          estadoNuevo: 'en_reparacion',
          cambiadoPor: 3,
          cambiadoPorNombre: 'Coordinación',
          cambiadoEn: '2026-11-25T13:00:00.000Z',
        },
      ];
      query.mockResolvedValue({ rows: cambios });
      const servicio = new OrdenesReparacionPgService(db);

      const historial = await servicio.historial(20, coordinacion);

      expect(historial).toEqual(cambios);
      expect(historial[1]).toMatchObject({ cambiadoPorNombre: 'Coordinación', cambiadoEn: expect.any(String) });
      expect(query.mock.calls[0][1]).toEqual([20]);
    });

    it('responde 404 si la orden del historial no existe', async () => {
      const { db, query } = crearDbFalsa();
      query.mockResolvedValue({ rows: [] });
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.historial(99, coordinacion)).rejects.toThrow(NotFoundException);
    });

    it('lista las órdenes y las averías sin orden al coordinador', async () => {
      const { db, query, fila } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      expect(await servicio.listar(coordinacion)).toEqual([fila]);

      const averia = { id: 6, recursoId: 9, recursoNombre: 'Probeta', descripcion: 'Rota', reportadaEn: '2026-11-25' };
      query.mockResolvedValue({ rows: [averia] });
      expect(await servicio.listarAveriasSinOrden(coordinacion)).toEqual([averia]);
    });

    it.each([carlos, ana])('las consultas son solo del coordinador (%o)', async (usuario) => {
      const { db, query } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.listar(usuario)).rejects.toThrow(ForbiddenException);
      await expect(servicio.listarAveriasSinOrden(usuario)).rejects.toThrow(ForbiddenException);
      await expect(servicio.historial(20, usuario)).rejects.toThrow(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rechaza consultar el historial de una orden inválida', async () => {
      const { db, query } = crearDbFalsa();
      const servicio = new OrdenesReparacionPgService(db);

      await expect(servicio.historial(0, coordinacion)).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });
  });
});
