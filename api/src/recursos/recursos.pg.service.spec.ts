import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import type { DbService } from '../db/db.service.js';
import { RecursosPgService } from './recursos.pg.service.js';

const carlos: Usuario = { id: 2, nombre: 'Carlos Vaca', rol: 'propietario' };
const ana: Usuario = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };

// Base de datos falsa: comprobamos qué SQL y qué parámetros manda el servicio.
function crearDbFalsa() {
  const casio = { id: 6, nombre: 'Casio fx-991', categoria: 'calculadora', estado: 'disponible', propietarioId: 2 };
  const query = vi.fn().mockResolvedValue({ rows: [casio] });
  const clienteQuery = vi.fn().mockResolvedValue({ rows: [casio] });
  const comoActor = vi.fn(async (_id: number, fn: (c: unknown) => Promise<unknown>) => fn({ query: clienteQuery }));
  const db = { query, comoActor } as unknown as DbService;
  return { db, query, clienteQuery, comoActor, casio };
}

describe('RecursosPgService: publicar (HU-01)', () => {
  it('guarda el recurso a nombre del usuario autenticado y lo devuelve disponible', async () => {
    const { db, comoActor, clienteQuery, casio } = crearDbFalsa();
    const service = new RecursosPgService(db);

    const recurso = await service.crear({ nombre: '  Casio fx-991 ', categoria: 'calculadora' }, carlos);

    expect(recurso).toEqual(casio);
    expect(comoActor).toHaveBeenCalledWith(carlos.id, expect.any(Function));
    expect(clienteQuery.mock.calls[0][1]).toEqual(['Casio fx-991', 'calculadora', carlos.id]);
  });

  it('ignora el propietarioId que mande el cliente en el body', async () => {
    const { db, clienteQuery } = crearDbFalsa();
    await new RecursosPgService(db).crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 99 }, carlos);
    expect(clienteQuery.mock.calls[0][1]).toEqual(['Casio', 'calculadora', carlos.id]);
  });

  it('rechaza sin nombre o sin categoría y no toca la base', async () => {
    const { db, comoActor } = crearDbFalsa();
    const service = new RecursosPgService(db);

    await expect(service.crear({ categoria: 'cable' }, carlos)).rejects.toThrow(BadRequestException);
    await expect(service.crear({ nombre: 'HDMI' }, carlos)).rejects.toThrow(BadRequestException);
    await expect(service.crear(undefined, carlos)).rejects.toThrow(BadRequestException);
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('un solicitante no puede publicar recursos', async () => {
    const { db, comoActor } = crearDbFalsa();
    await expect(
      new RecursosPgService(db).crear({ nombre: 'Casio', categoria: 'calculadora' }, ana),
    ).rejects.toThrow(ForbiddenException);
    expect(comoActor).not.toHaveBeenCalled();
  });

  it('traduce un error de la base (categoría inexistente) a 400', async () => {
    const { db, comoActor } = crearDbFalsa();
    comoActor.mockRejectedValueOnce({ code: '23503', message: 'violates foreign key constraint' });
    await expect(
      new RecursosPgService(db).crear({ nombre: 'Casio', categoria: 'calculadora' }, carlos),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('RecursosPgService: consultar disponibilidad (HU-02)', () => {
  it('sin filtros pide el catálogo completo a buscar_recursos', async () => {
    const { db, query, casio } = crearDbFalsa();
    const lista = await new RecursosPgService(db).listar();

    expect(lista).toEqual([casio]);
    expect(query.mock.calls[0][0]).toContain('buscar_recursos');
    expect(query.mock.calls[0][1]).toEqual([null, null, null]);
  });

  it('pasa la categoría y las fechas a la base', async () => {
    const { db, query } = crearDbFalsa();
    await new RecursosPgService(db).listar({ categoria: 'calculadora', desde: '2026-11-22', hasta: '2026-11-23' });
    expect(query.mock.calls[0][1]).toEqual(['calculadora', '2026-11-22', '2026-11-23']);
  });

  it('devuelve lista vacía cuando no hay recursos libres (la web muestra "sin resultados")', async () => {
    const { db, query } = crearDbFalsa();
    query.mockResolvedValueOnce({ rows: [] });
    expect(await new RecursosPgService(db).listar({ desde: '2026-11-22', hasta: '2026-11-23' })).toEqual([]);
  });

  it('rechaza fechas incompletas, inválidas o en desorden sin consultar la base', async () => {
    const { db, query } = crearDbFalsa();
    const service = new RecursosPgService(db);

    await expect(service.listar({ desde: '2026-11-22' })).rejects.toThrow(BadRequestException);
    await expect(service.listar({ desde: '22/11/2026', hasta: '23/11/2026' })).rejects.toThrow(BadRequestException);
    await expect(service.listar({ desde: '2026-11-25', hasta: '2026-11-20' })).rejects.toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
