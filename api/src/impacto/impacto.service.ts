import { Inject, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';

export interface PanelImpacto {
  prestamosCompletados: number;
  reparacionesResueltas: number;
  recursosReutilizados: number;
}

interface FilaPanelImpacto {
  prestamosCompletados?: number;
  reparaciones_resueltas?: number;
  reparacionesResueltas?: number;
  recursosReutilizados?: number;
  prestamos_completados?: number;
  recursos_reutilizados?: number;
}

@Injectable()
export class ImpactoService {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  async obtener(): Promise<PanelImpacto> {
    const { rows } = await this.db.query<FilaPanelImpacto>(
      `select
         prestamos_completados as "prestamosCompletados",
         reparaciones_resueltas as "reparacionesResueltas",
         recursos_reutilizados as "recursosReutilizados"
       from v_panel_impacto`,
    );

    if (rows.length === 0) {
      return {
        prestamosCompletados: 0,
        reparacionesResueltas: 0,
        recursosReutilizados: 0,
      };
    }

    const fila = rows[0];
    return {
      prestamosCompletados: Number(fila.prestamosCompletados ?? fila.prestamos_completados ?? 0),
      reparacionesResueltas: Number(fila.reparacionesResueltas ?? fila.reparaciones_resueltas ?? 0),
      recursosReutilizados: Number(fila.recursosReutilizados ?? fila.recursos_reutilizados ?? 0),
    };
  }
}
