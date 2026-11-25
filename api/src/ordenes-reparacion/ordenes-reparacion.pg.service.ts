import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Usuario } from '../auth/auth.guard.js';
import { traducirErrorDb } from '../db/db-errores.js';
import { DbService } from '../db/db.service.js';
import {
  esEstadoOrden,
  type AbrirOrdenDto,
  type AvanzarOrdenDto,
  type AveriaSinOrden,
  type CambioEstadoOrden,
  type OrdenReparacion,
} from './orden-reparacion.js';

// Columnas de cualquier consulta de órdenes (alias o = orden, a = avería, r = recurso).
const COLUMNAS_ORDEN = `o.id, o.averia_id as "averiaId", a.recurso_id as "recursoId",
                        r.nombre as "recursoNombre", a.descripcion, o.estado,
                        o.creada_por as "creadaPor", o.creada_en as "creadaEn",
                        o.actualizada_en as "actualizadaEn"`;
const UNIONES_ORDEN = `join averias a on a.id = o.averia_id
                       join recursos r on r.id = a.recurso_id`;

const esIdValido = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isInteger(valor) && valor > 0;

// RNF-03: toda la gestión de órdenes es del coordinador (la base de datos lo vuelve a comprobar).
function exigirCoordinador(usuario: Usuario, mensaje: string): void {
  if (usuario.rol !== 'coordinador') throw new ForbiddenException([mensaje]);
}

// HU-08 sobre Postgres (Supabase). Las reglas viven en la base: abrir_orden_reparacion y avanzar_orden,
// el trigger que impide saltar estados, el historial inmutable y la liberación del recurso al resolver.
// La API valida lo básico, traduce los errores y deja el usuario que actúa (sale del token).
@Injectable()
export class OrdenesReparacionPgService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  // HU-08 (a): la orden nace "abierta" desde una avería.
  async abrir(datos: AbrirOrdenDto | undefined, usuario: Usuario): Promise<OrdenReparacion> {
    exigirCoordinador(usuario, 'Solo el coordinador puede abrir órdenes de reparación.');
    const averiaId = datos?.averiaId;
    if (!esIdValido(averiaId)) throw new BadRequestException(['Indica la avería de la que nace la orden.']);

    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<OrdenReparacion>(
          `with nueva as (select * from abrir_orden_reparacion($1::bigint))
           select ${COLUMNAS_ORDEN}
             from nueva o ${UNIONES_ORDEN}`,
          [averiaId],
        );
        return rows[0];
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // HU-08 (b), (c) y (d): avanza el estado. El trigger de la base rechaza los saltos
  // (abierta → resuelta), al resolver deja el recurso "disponible" y anota quién y cuándo en el historial.
  async avanzar(id: number, datos: AvanzarOrdenDto | undefined, usuario: Usuario): Promise<OrdenReparacion> {
    exigirCoordinador(usuario, 'Solo el coordinador puede cambiar el estado de una orden.');
    if (!esIdValido(id)) throw new BadRequestException(['Indica una orden válida.']);
    const estado = datos?.estado;
    if (!esEstadoOrden(estado)) {
      throw new BadRequestException(['Indica un estado válido: abierta, en_reparacion o resuelta.']);
    }

    try {
      return await this.db.comoActor(usuario.id, async (cliente) => {
        const { rows } = await cliente.query<OrdenReparacion>(
          `with avanzada as (select * from avanzar_orden($1::bigint, $2::text))
           select ${COLUMNAS_ORDEN}
             from avanzada o ${UNIONES_ORDEN}`,
          [id, estado],
        );
        return rows[0];
      });
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // Órdenes en curso primero y, dentro de cada grupo, las más recientes.
  async listar(usuario: Usuario): Promise<OrdenReparacion[]> {
    exigirCoordinador(usuario, 'Solo el coordinador puede consultar las órdenes de reparación.');
    try {
      const { rows } = await this.db.query<OrdenReparacion>(
        `select ${COLUMNAS_ORDEN}
           from ordenes_reparacion o ${UNIONES_ORDEN}
          order by (o.estado = 'resuelta'), o.id desc`,
      );
      return rows;
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // Averías que todavía no tienen orden (una avería solo puede tener una).
  async listarAveriasSinOrden(usuario: Usuario): Promise<AveriaSinOrden[]> {
    exigirCoordinador(usuario, 'Solo el coordinador puede consultar las averías por atender.');
    try {
      const { rows } = await this.db.query<AveriaSinOrden>(
        `select a.id, a.recurso_id as "recursoId", r.nombre as "recursoNombre",
                a.descripcion, a.reportada_en as "reportadaEn"
           from averias a
           join recursos r on r.id = a.recurso_id
          where not exists (select 1 from ordenes_reparacion o where o.averia_id = a.id)
          order by a.reportada_en, a.id`,
      );
      return rows;
    } catch (error) {
      throw traducirErrorDb(error);
    }
  }

  // HU-08 (d): historial de una orden con el estado anterior y nuevo, quién lo cambió y cuándo.
  async historial(id: number, usuario: Usuario): Promise<CambioEstadoOrden[]> {
    exigirCoordinador(usuario, 'Solo el coordinador puede consultar el historial de una orden.');
    if (!esIdValido(id)) throw new BadRequestException(['Indica una orden válida.']);

    let filas: CambioEstadoOrden[];
    try {
      const { rows } = await this.db.query<CambioEstadoOrden>(
        `select h.id, h.orden_id as "ordenId", h.estado_anterior as "estadoAnterior",
                h.estado_nuevo as "estadoNuevo", h.cambiado_por as "cambiadoPor",
                u.nombre as "cambiadoPorNombre", h.cambiado_en as "cambiadoEn"
           from historial_orden h
           join usuarios u on u.id = h.cambiado_por
          where h.orden_id = $1
          order by h.cambiado_en, h.id`,
        [id],
      );
      filas = rows;
    } catch (error) {
      throw traducirErrorDb(error);
    }
    // Toda orden tiene al menos su entrada de creación: sin filas, la orden no existe.
    if (filas.length === 0) throw new NotFoundException(['La orden no existe.']);
    return filas;
  }
}
