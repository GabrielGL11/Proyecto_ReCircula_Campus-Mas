import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { esFechaIso } from '../recursos/rango.js';
import { RecursosService } from '../recursos/recursos.service.js';
import type { CrearSolicitudDto, Solicitud } from './solicitud.js';

@Injectable()
export class SolicitudesService {
  // En memoria por ahora; luego se reemplaza por un repositorio TypeORM.
  private solicitudes: Solicitud[] = [];
  private siguienteId = 1;

  constructor(@Inject(RecursosService) private readonly recursos: RecursosService) {}

  // HU-03: con fechas válidas la solicitud queda "pendiente".
  crear(datos: CrearSolicitudDto): Solicitud {
    const errores = this.validar(datos);
    if (errores.length > 0) throw new BadRequestException(errores);

    const recurso = this.recursos.buscarPorId(datos.recursoId!);
    if (!recurso) throw new NotFoundException(['El recurso no existe.']);
    if (recurso.estado === 'averiado') {
      throw new BadRequestException('El recurso está averiado y no se puede solicitar.');
    }

    const solicitud: Solicitud = {
      id: this.siguienteId++,
      recursoId: recurso.id,
      recursoNombre: recurso.nombre,
      solicitanteId: datos.solicitanteId ?? 0,
      rango: { inicio: datos.inicio!, fin: datos.fin! },
      estado: 'pendiente',
    };
    this.solicitudes.push(solicitud);
    return solicitud;
  }

  listar(filtros: { solicitanteId?: number } = {}): Solicitud[] {
    return this.solicitudes.filter(
      (s) => filtros.solicitanteId === undefined || s.solicitanteId === filtros.solicitanteId,
    );
  }

  private validar({ recursoId, inicio, fin }: CrearSolicitudDto): string[] {
    const errores: string[] = [];
    if (!Number.isInteger(recursoId)) errores.push('Elige el recurso que quieres solicitar.');

    if (!inicio) errores.push('La fecha de inicio es obligatoria.');
    else if (!esFechaIso(inicio)) errores.push('La fecha de inicio no es válida (usa AAAA-MM-DD).');

    if (!fin) errores.push('La fecha de fin es obligatoria.');
    else if (!esFechaIso(fin)) errores.push('La fecha de fin no es válida (usa AAAA-MM-DD).');

    // Regla R2: el fin no puede ser anterior al inicio.
    if (inicio && fin && esFechaIso(inicio) && esFechaIso(fin) && fin < inicio) {
      errores.push('La fecha de fin no puede ser anterior a la de inicio.');
    }
    return errores;
  }
}
