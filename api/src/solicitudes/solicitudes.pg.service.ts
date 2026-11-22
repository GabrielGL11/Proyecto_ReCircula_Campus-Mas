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

// Columnas que devuelve cualquier consulta de solicitudes (alias s = solicitud, r = recurso).
const COLUMNAS = `s.id, s.recurso_id as "recursoId", r.nombre as "recursoNombre",
                  s.solicitante_id as "solicitanteId", s.inicio, s.fin, s.estado`;

// HU-04: cada decisión llama a su función de la base y tiene su propio mensaje de 403.
type Accion = 'aprobar' | 'rechazar';
const DECISIONES: Record<Accion, { funcion: string; sinPermiso: string }> = {
  aprobar: {
    funcion: 'aprobar_solicitud',
    sinPermiso: 'Solo el propietario o el coordinador pueden aprobar una solicitud.',
  },
  rechazar: {
    funcion: 'rechazar_solicitud',
    sinPermiso: 'Solo el propietario o el coordinador pueden rechazar una solicitud.',
  },
};

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
             select $1::bigint, $2::bigint, $3::date, $4::date
              where not exists (
                select 1 from solicitudes d
                 where d.recurso_id = $1 and d.solicitante_id = $2
                   and d.inicio = $3 and d.fin = $4 and d.estado = 'pendiente')
             returning id, recurso_id, solicitante_id, inicio, fin, estado
           )
           select n.id, n.recurso_id as "recursoId", r.nombre as "recursoNombre",
                  n.solicitante_id as "solicitanteId", n.inicio, n.fin, n.estado
             from nueva n join recursos r on r.id = n.recurso_id`,
          [recursoId, usuario.id, inicio, fin],
        );
        // Sin filas: la base no insertó porque ya había una pendiente idéntica.
        if (rows.length === 0) {
          throw new BadRequestException(['Ya tienes una solicitud pendiente para este recurso en esas fechas.']);
        }
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
        `select ${COLUMNAS}
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

  // HU-04: el propietario (o el coordinador) aprueba o rechaza. R1 y R3 las aplica la base.
  aprobar(id: number, usuario: Usuario): Promise<Solicitud> {
    return this.decidir('aprobar', id, usuario);
  }

  rechazar(id: number, usuario: Usuario): Promise<Solicitud> {
    return this.decidir('rechazar', id, usuario);
  }

  private async decidir(accion: Accion, id: number, usuario: Usuario): Promise<Solicitud> {
    const { funcion, sinPermiso } = DECISIONES[accion];
    if (usuario.rol === 'solicitante') throw new ForbiddenException([sinPermiso]);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(['Indica una solicitud válida.']);
    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        // `funcion` sale de DECISIONES (lista cerrada), nunca del cliente: es seguro interpolarla.
        const { rows } = await cliente.query<Fila>(
          `with decidida as (select * from ${funcion}($1))
           select ${COLUMNAS} from decidida s join recursos r on r.id = s.recurso_id`,
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
        `select ${COLUMNAS}
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
