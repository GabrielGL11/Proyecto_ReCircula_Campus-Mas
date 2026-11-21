import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { CrearSolicitudDto } from './solicitud.js';
import { SolicitudesService } from './solicitudes.service.js';

@Controller('solicitudes')
export class SolicitudesController {
  constructor(@Inject(SolicitudesService) private readonly solicitudes: SolicitudesService) {}

  // POST /solicitudes  { recursoId, inicio, fin, solicitanteId }
  @Post()
  crear(@Body() datos: CrearSolicitudDto) {
    return this.solicitudes.crear(datos);
  }

  // GET /solicitudes?solicitanteId=2
  @Get()
  listar(@Query('solicitanteId') solicitanteId?: string) {
    const id = solicitanteId === undefined || solicitanteId === '' ? undefined : Number(solicitanteId);
    return this.solicitudes.listar({ solicitanteId: Number.isNaN(id) ? undefined : id });
  }
}
