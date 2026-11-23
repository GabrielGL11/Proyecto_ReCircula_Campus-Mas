import { BadRequestException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import type { DbService } from '../db/db.service.js';
import { RecursosPgService } from './recursos.pg.service.js';

const ana: Usuario = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };

// Base de datos falsa: comprobamos qué SQL y qué parámetros manda el servicio.
function crearDbFalsa() {
  const averia = {
    id: 1,
    recursoId: 6,
    reportadaPor: ana.id,
    descripcion: 'La rueda no responde',
    reportadaEn: new Date('2026-11-22T17:00:00Z'),
  };
  const query = vi.fn().mockResolvedValue({ rows: [averia] });
  const clienteQuery = vi.fn().mockResolvedValue({ rows: [averia] });
  const comoActor = vi.fn(async (_id: number, fn: (c: unknown) => Promise<unknown>) => fn({ query: clienteQuery }));
  const db = { query, comoActor } as unknown as DbService;
  return { db, comoActor, clienteQuery, averia };
}

describe('RecursosPgService: reportar avería (HU-06)', () => {
  it('registra la avería a nombre del usuario autenticado y la devuelve', async () => {
    const { db, comoActor, clienteQuery, averia } = crearDbFalsa();

    const resultado = await new RecursosPgService(db).reportarAveria(6, { descripcion: '  La rueda no responde ' }, ana);

    expect(resultado).toEqual(averia);
    expect(comoActor).toHaveBeenCalledWith(ana.id, expect.any(Function));
    expect(clienteQuery.mock.calls[0][0]).toContain('reportar_averia');
    expect(clienteQuery.mock.calls[0][1]).toEqual([6, 'La rueda no responde']);
  });

  it('rechaza una descripción vacía, en blanco o que no sea texto y no toca la base', async () => {
    const { db, comoActor } = crearDbFalsa();
    const service = new RecursosPgService(db);

    await expect(service.reportarAveria(6, { descripcion: '' }, ana)).rejects.toThrow(BadRequestException);
    await expect(service.reportarAveria(6, { descripcion: '   ' }, ana)).rejects.toThrow(BadRequestException);
    await expect(service.reportarAveria(6, { descripcion: 123 }, ana)).rejects.toThrow(BadRequestException);
    await expect(service.reportarAveria(6, {}, ana)).rejects.toThrow(BadRequestException);
    await expect(service.reportarAveria(6, undefined, ana)).rejects.toThrow(BadRequestException);
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('el mensaje de error pide describir la avería', async () => {
    const { db } = crearDbFalsa();
    const error = await new RecursosPgService(db).reportarAveria(6, { descripcion: ' ' }, ana).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ message: ['Describe la avería.'] });
  });

  it('traduce un error de la base a un error HTTP en vez de un 500', async () => {
    const { db, comoActor } = crearDbFalsa();
    comoActor.mockRejectedValueOnce({ code: '23503', message: 'violates foreign key constraint' });

    await expect(
      new RecursosPgService(db).reportarAveria(999, { descripcion: 'No enciende' }, ana),
    ).rejects.toThrow(BadRequestException);
  });
});