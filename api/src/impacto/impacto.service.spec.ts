import { ForbiddenException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import type { DbService } from '../db/db.service.js';
import { ImpactoController } from './impacto.controller.js';
import { ImpactoService } from './impacto.service.js';

const coordinacion: Usuario = { id: 5, nombre: 'Coordinación', rol: 'coordinador' };
const ana: Usuario = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };
const carlos: Usuario = { id: 2, nombre: 'Carlos Vaca', rol: 'propietario' };

// Base de datos falsa: solo devuelve las filas que le digamos
function dbFalsa(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { db: { query } as unknown as DbService, query };
}

describe('ImpactoService: panel de impacto (HU-10)', () => {
  // Criterio (a): las cifras coinciden con los registros
  it('devuelve las cifras que entrega la vista v_panel_impacto', async () => {
    const { db, query } = dbFalsa([
      { prestamosCompletados: 12, reparacionesResueltas: 3, recursosReutilizados: 8 },
    ]);

    const panel = await new ImpactoService(db).obtener();

    expect(panel).toEqual({ prestamosCompletados: 12, reparacionesResueltas: 3, recursosReutilizados: 8 });
    expect(query.mock.calls[0][0]).toContain('v_panel_impacto');
  });

  // Criterio (b): sin datos, ceros y no falla
  it('sin filas devuelve ceros y no lanza error', async () => {
    const { db } = dbFalsa([]);
    await expect(new ImpactoService(db).obtener()).resolves.toEqual({
      prestamosCompletados: 0,
      reparacionesResueltas: 0,
      recursosReutilizados: 0,
    });
  });
});

describe('ImpactoController: solo el coordinador (RNF-03)', () => {
  const panel = { prestamosCompletados: 1, reparacionesResueltas: 2, recursosReutilizados: 1 };
  const crear = () => {
    const obtener = vi.fn().mockResolvedValue(panel);
    return { controlador: new ImpactoController({ obtener } as unknown as ImpactoService), obtener };
  };

  it('el coordinador recibe el panel', async () => {
    const { controlador } = crear();
    await expect(controlador.obtener(coordinacion)).resolves.toEqual(panel);
  });

  it.each([
    ['solicitante', ana],
    ['propietario', carlos],
  ])('el %s recibe 403 y no se consulta la base', (_rol, usuario) => {
    const { controlador, obtener } = crear();
    expect(() => controlador.obtener(usuario)).toThrow(ForbiddenException);
    expect(obtener).not.toHaveBeenCalled();
  });
});