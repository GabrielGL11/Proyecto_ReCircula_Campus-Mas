import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import { traducirErrorDb } from '../db/db-errores.js';
import { DbService } from '../db/db.service.js';
import { validarSolicitud } from '../solicitudes/validar.js';
import type { CrearEsperaDto, EntradaEspera, EstadoEspera } from './lista-espera.js';

interface FilaEspera {
  id: number;
  recursoId: number;
  recursoNombre: string;
  solicitanteId: number;
  inicio: string;
  fin: string;
  estado: EstadoEspera;
  solicitudId: number | null;
  creadoEn: string;
}

const aEntradaEspera = (f: FilaEspera): EntradaEspera => ({
  id: f.id,
  recursoId: f.recursoId,
  recursoNombre: f.recursoNombre,
  solicitanteId: f.solicitanteId,
  rango: { inicio: f.inicio, fin: f.fin },
  estado: f.estado,
  solicitudId: f.solicitudId,
  creadoEn: f.creadoEn,
});

const COLUMNAS_ESPERA = `e.id, e.recurso_id as "recursoId", r.nombre as "recursoNombre",
                         e.solicitante_id as "solicitanteId", e.inicio, e.fin, e.estado,
                         e.solicitud_id as "solicitudId", e.creado_en as "creadoEn"`;

@Injectable()
export class ListaEsperaPgService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  // HU-07 (a): Anotarse en lista de espera cuando el recurso esté ocupado.
  async anotar(datos: CrearEsperaDto | undefined, usuario: Usuario): Promise<EntradaEspera> {
    if (usuario.rol !== 'solicitante') {
      throw new ForbiddenException(['Solo un solicitante puede anotarse en la lista de espera.']);
    }
    const errores = validarSolicitud(datos);
    if (errores.length > 0) throw new BadRequestException(errores);
    const { recursoId, inicio, fin } = datos as Required<CrearEsperaDto>;

    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<FilaEspera>(
          `with anotada as (
             select * from anotar_en_lista_espera($1::bigint, $2::date, $3::date)
           )
           select ${COLUMNAS_ESPERA}
             from anotada e
             join recursos r on r.id = e.recurso_id`,
          [recursoId, inicio, fin],
        );
        return aEntradaEspera(rows[0]);
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // Lista las entradas de lista de espera del solicitante autenticado.
  async listar(usuario: Usuario): Promise<EntradaEspera[]> {
    try {
      const { rows } = await this.db.query<FilaEspera>(
        `select ${COLUMNAS_ESPERA}
           from lista_espera e
           join recursos r on r.id = e.recurso_id
          where e.solicitante_id = $1
          order by e.creado_en desc, e.id desc`,
        [usuario.id],
      );
      return rows.map(aEntradaEspera);
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // Permite al solicitante cancelar su lugar en la lista de espera si ya no lo necesita.
  async cancelar(id: number, usuario: Usuario): Promise<EntradaEspera> {
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(['Indica una entrada válida.']);
    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<FilaEspera>(
          `with cancelada as (
             update lista_espera
                set estado = 'cancelada'
              where id = $1 and solicitante_id = $2 and estado = 'en_espera'
             returning *
           )
           select ${COLUMNAS_ESPERA}
             from cancelada e
             join recursos r on r.id = e.recurso_id`,
          [id, usuario.id],
        );
        if (rows.length === 0) {
          throw new BadRequestException(['No se puede cancelar: no existe o no está en espera.']);
        }
        return aEntradaEspera(rows[0]);
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }
}
