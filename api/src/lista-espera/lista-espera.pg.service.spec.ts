import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import type { DbService } from '../db/db.service.js';
import { ListaEsperaPgService } from './lista-espera.pg.service.js';

const ana: Usuario = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };
const carlos: Usuario = { id: 2, nombre: 'Carlos Vaca', rol: 'propietario' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T12:00:00-05:00'));
});
afterEach(() => {
  vi.useRealTimers();
});

function crearDbFalsa() {
  const fila = {
    id: 10,
    recursoId: 6,
    recursoNombre: 'Casio fx-991',
    solicitanteId: 4,
    inicio: '2026-11-20',
    fin: '2026-11-22',
    estado: 'en_espera',
    solicitudId: null,
    creadoEn: '2026-11-10T12:00:00.000Z',
  };
  const query = vi.fn().mockResolvedValue({ rows: [fila] });
  const clienteQuery = vi.fn().mockResolvedValue({ rows: [fila] });
  const comoActor = vi.fn(async (_id: number, fn: (c: unknown) => Promise<unknown>) => fn({ query: clienteQuery }));
  const db = { query, comoActor } as unknown as DbService;
  return { db, query, clienteQuery, comoActor, fila };
}

describe('ListaEsperaPgService (HU-07)', () => {
  describe('Anotarse en lista de espera - Criterio (a)', () => {
    it('con recurso ocupado y fechas válidas, el solicitante queda anotado en_espera', async () => {
      const { db, comoActor, clienteQuery, fila } = crearDbFalsa();
      const servicio = new ListaEsperaPgService(db);

      const resultado = await servicio.anotar({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' }, ana);

      expect(resultado).toEqual({
        id: 10,
        recursoId: 6,
        recursoNombre: 'Casio fx-991',
        solicitanteId: 4,
        rango: { inicio: '2026-11-20', fin: '2026-11-22' },
        estado: 'en_espera',
        solicitudId: null,
        creadoEn: fila.creadoEn,
      });
      expect(comoActor).toHaveBeenCalledWith(ana.id, expect.any(Function));
      expect(clienteQuery.mock.calls[0][1]).toEqual([6, '2026-11-20', '2026-11-22']);
    });

    it('rechaza si quien intenta anotarse no es solicitante', async () => {
      const { db } = crearDbFalsa();
      const servicio = new ListaEsperaPgService(db);

      await expect(servicio.anotar({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' }, carlos)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rechaza una fecha de fin anterior a la de inicio con mensaje de error', async () => {
      const { db } = crearDbFalsa();
      const servicio = new ListaEsperaPgService(db);

      await expect(
        servicio.anotar({ recursoId: 6, inicio: '2026-11-25', fin: '2026-11-20' }, ana),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza fechas faltantes o con formato inválido', async () => {
      const { db } = crearDbFalsa();
      const servicio = new ListaEsperaPgService(db);

      await expect(servicio.anotar({ recursoId: 6 }, ana)).rejects.toThrow(BadRequestException);
      await expect(
        servicio.anotar({ recursoId: 6, inicio: '2026-13-40', fin: '2026-11-22' }, ana),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza fechas que ya pasaron', async () => {
      const { db } = crearDbFalsa();
      const servicio = new ListaEsperaPgService(db);

      await expect(
        servicio.anotar({ recursoId: 6, inicio: '2026-11-01', fin: '2026-11-05' }, ana),
      ).rejects.toThrow(BadRequestException);
    });

    it('traduce el error de la base cuando el recurso está libre en esas fechas', async () => {
      const { db, comoActor } = crearDbFalsa();
      comoActor.mockRejectedValue({
        code: '23514',
        message: 'El recurso está libre en esas fechas: solicítelo directamente',
      });
      const servicio = new ListaEsperaPgService(db);

      const error = await servicio.anotar({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' }, ana).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: ['El recurso está libre en esas fechas: solicítelo directamente'],
      });
    });

    it('traduce el error de la base cuando el recurso está averiado o no existe', async () => {
      const { db, comoActor } = crearDbFalsa();
      comoActor.mockRejectedValue({
        code: '23514',
        message: 'El recurso no está disponible (estado: averiado)',
      });
      const servicio = new ListaEsperaPgService(db);

      const error = await servicio.anotar({ recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' }, ana).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        message: ['El recurso no está disponible (estado: averiado)'],
      });
    });
  });

  describe('Listar y cancelar entradas', () => {
    it('lista las entradas de lista de espera del solicitante', async () => {
      const { db, query, fila } = crearDbFalsa();
      const servicio = new ListaEsperaPgService(db);

      const lista = await servicio.listar(ana);

      expect(lista).toHaveLength(1);
      expect(lista[0].id).toBe(fila.id);
      expect(query.mock.calls[0][1]).toEqual([ana.id]);
    });

    it('permite cancelar una entrada en espera', async () => {
      const { db, comoActor, clienteQuery, fila } = crearDbFalsa();
      clienteQuery.mockResolvedValue({ rows: [{ ...fila, estado: 'cancelada' }] });
      const servicio = new ListaEsperaPgService(db);

      const cancelada = await servicio.cancelar(10, ana);

      expect(cancelada.estado).toBe('cancelada');
      expect(comoActor).toHaveBeenCalledWith(ana.id, expect.any(Function));
    });
  });
});
