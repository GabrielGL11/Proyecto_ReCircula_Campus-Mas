import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import { traducirErrorDb } from '../db/db-errores.js';
import { DbService } from '../db/db.service.js';
import type { CrearSolicitudDto, EstadoSolicitud, Solicitud } from './solicitud.js';
import { validarSolicitud } from './validar.js';

interface Fila {
  id: number;
  recursoId: number;
  recursoNombre: string;
  solicitanteId: number;
  inicio: string;
  fin: string;
  estado: EstadoSolicitud;
}

const aSolicitud = (f: Fila): Solicitud => ({
  id: f.id,
  recursoId: f.recursoId,
  recursoNombre: f.recursoNombre,
  solicitanteId: f.solicitanteId,
  rango: { inicio: f.inicio, fin: f.fin },
  estado: f.estado,
});

// HU-03 sobre Postgres (Supabase). Las reglas viven en la base (trigger trg_solicitud_insert):
// fin >= inicio (R2), recurso existente, no averiado, no retirado y estado inicial "pendiente".
@Injectable()
export class SolicitudesPgService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  // El solicitante sale del token, nunca del body (RNF-03).
  async crear(datos: CrearSolicitudDto | undefined, usuario: Usuario): Promise<Solicitud> {
    if (usuario.rol !== 'solicitante') {
      throw new ForbiddenException(['Solo un solicitante puede pedir recursos en préstamo.']);
    }
    const errores = validarSolicitud(datos);
    if (errores.length > 0) throw new BadRequestException(errores);
    const { recursoId, inicio, fin } = datos as Required<CrearSolicitudDto>;

    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<Fila>(
          `with nueva as (
             insert into solicitudes (recurso_id, solicitante_id, inicio, fin)
             values ($1, $2, $3, $4)
             returning id, recurso_id, solicitante_id, inicio, fin, estado
           )
           select n.id, n.recurso_id as "recursoId", r.nombre as "recursoNombre",
                  n.solicitante_id as "solicitanteId", n.inicio, n.fin, n.estado
             from nueva n join recursos r on r.id = n.recurso_id`,
          [recursoId, usuario.id, inicio, fin],
        );
        return aSolicitud(rows[0]);
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // "Mis solicitudes": solo las del usuario autenticado.
  async listar(usuario: Usuario): Promise<Solicitud[]> {
    try {
      const { rows } = await this.db.query<Fila>(
        `select s.id, s.recurso_id as "recursoId", r.nombre as "recursoNombre",
                s.solicitante_id as "solicitanteId", s.inicio, s.fin, s.estado
           from solicitudes s join recursos r on r.id = s.recurso_id
          where s.solicitante_id = $1
          order by s.id desc`,
        [usuario.id],
      );
      return rows.map(aSolicitud);
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // HU-04: el propietario (o el coordinador) aprueba. R1 y R3 las aplica aprobar_solicitud en la base.
  async aprobar(id: number, usuario: Usuario): Promise<Solicitud> {
    if (usuario.rol === 'solicitante') {
      throw new ForbiddenException(['Solo el propietario o el coordinador pueden aprobar una solicitud.']);
    }
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(['Indica una solicitud válida.']);
    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<Fila>(
          `with decidida as (select * from aprobar_solicitud($1))
           select d.id, d.recurso_id as "recursoId", r.nombre as "recursoNombre",
                  d.solicitante_id as "solicitanteId", d.inicio, d.fin, d.estado
             from decidida d join recursos r on r.id = d.recurso_id`,
          [id],
        );
        return aSolicitud(rows[0]);
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  async rechazar(id: number, usuario: Usuario): Promise<Solicitud> {
    if (usuario.rol === 'solicitante') {
      throw new ForbiddenException(['Solo el propietario o el coordinador pueden rechazar una solicitud.']);
    }
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(['Indica una solicitud válida.']);
    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<Fila>(
          `with decidida as (select * from rechazar_solicitud($1))
           select d.id, d.recurso_id as "recursoId", r.nombre as "recursoNombre",
                  d.solicitante_id as "solicitanteId", d.inicio, d.fin, d.estado
             from decidida d join recursos r on r.id = d.recurso_id`,
          [id],
        );
        return aSolicitud(rows[0]);
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // Pendientes por decidir: el propietario ve las de sus recursos; el coordinador, todas.
  async listarPendientes(usuario: Usuario): Promise<Solicitud[]> {
    if (usuario.rol === 'solicitante') {
      throw new ForbiddenException(['Solo el propietario o el coordinador pueden ver las solicitudes por decidir.']);
    }
    try {
      const { rows } = await this.db.query<Fila>(
        `select s.id, s.recurso_id as "recursoId", r.nombre as "recursoNombre",
                s.solicitante_id as "solicitanteId", s.inicio, s.fin, s.estado
           from solicitudes s join recursos r on r.id = s.recurso_id
          where s.estado = 'pendiente' and ($2 or r.propietario_id = $1)
          order by s.creado_en, s.id`,
        [usuario.id, usuario.rol === 'coordinador'],
      );
      return rows.map(aSolicitud);
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }
}
