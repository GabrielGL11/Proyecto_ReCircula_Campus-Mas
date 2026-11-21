import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type Usuario } from '../auth/auth.guard.js';
import { UsuarioActual } from '../auth/usuario.decorator.js';
import type { CrearSolicitudDto } from './solicitud.js';
import { SolicitudesPgService } from './solicitudes.pg.service.js';

@Controller('solicitudes')
@UseGuards(AuthGuard)
export class SolicitudesController {
  constructor(@Inject(SolicitudesPgService) private readonly solicitudes: SolicitudesPgService) {}

  // POST /solicitudes  { recursoId, inicio, fin }   (el solicitante sale del token)
  @Post()
  crear(@Body() datos: CrearSolicitudDto, @UsuarioActual() usuario: Usuario) {
    return this.solicitudes.crear(datos, usuario);
  }

  // GET /solicitudes   → las solicitudes de la persona autenticada
  @Get()
  listar(@UsuarioActual() usuario: Usuario) {
    return this.solicitudes.listar(usuario);
  }
}
