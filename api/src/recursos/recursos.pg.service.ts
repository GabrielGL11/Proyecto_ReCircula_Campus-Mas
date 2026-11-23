import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import { traducirErrorDb } from '../db/db-errores.js';
import { DbService } from '../db/db.service.js';
import type { Averia, CrearRecursoDto, Recurso, ReportarAveriaDto } from './recurso.js';
import type { FiltrosRecursos } from './recursos.service.js';
import { validarFiltroFechas, validarNombreYCategoria } from './validar.js';

// HU-01 y HU-02 sobre Postgres (Supabase). Las reglas viven en la base (01_schema.sql);
// aquí solo se valida lo que llega por HTTP y se traducen los errores.
@Injectable()
export class RecursosPgService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  // HU-01: el propietario sale del token, no del body.
  async crear(datos: CrearRecursoDto | undefined, usuario: Usuario): Promise<Recurso> {
    if (usuario.rol === 'solicitante') {
      throw new ForbiddenException(['Solo un propietario o el coordinador pueden publicar recursos.']);
    }

    const { nombre, categoria } = datos ?? ({} as CrearRecursoDto);
    const { errores, nombre: nombreLimpio, categoria: categoriaValida } = validarNombreYCategoria(nombre, categoria);
    if (errores.length > 0 || !categoriaValida) throw new BadRequestException(errores);

    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<Recurso>(
          `insert into recursos (nombre, categoria, propietario_id)
           values ($1, $2, $3)
           returning id, nombre, categoria, estado, propietario_id as "propietarioId"`,
          [nombreLimpio, categoriaValida, usuario.id],
        );
        return rows[0];
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // HU-02: la base calcula la disponibilidad (buscar_recursos): excluye averiados, retirados
  // y los que tienen un préstamo confirmado en el rango.
  async listar(filtros: FiltrosRecursos = {}): Promise<Recurso[]> {
    const { rango, error } = validarFiltroFechas(filtros.desde, filtros.hasta);
    if (error) throw new BadRequestException([error]);

    try {
      const { rows } = await this.db.query<Recurso>(
        `select id, nombre, categoria, estado, propietario_id as "propietarioId"
           from buscar_recursos($1, $2, $3)`,
        [filtros.categoria || null, rango?.inicio ?? null, rango?.fin ?? null],
      );
      return rows;
    } catch (e) {
      throw traducirErrorDb(e); 
    }
  }

  async reportarAveria(id: number, datos: ReportarAveriaDto | undefined, usuario: Usuario): Promise<Averia> {
    const descripcion = typeof datos?.descripcion === 'string' ? datos.descripcion.trim() : '';
    if (!descripcion) throw new BadRequestException(['Describe la avería.']);

    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<Averia>(
          `select id,
                  recurso_id as "recursoId",
                  reportada_por as "reportadaPor",
                  descripcion,
                  reportada_en as "reportadaEn"
             from reportar_averia($1, $2)`,
          [id, descripcion],
        );
        return rows[0];
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }
}
