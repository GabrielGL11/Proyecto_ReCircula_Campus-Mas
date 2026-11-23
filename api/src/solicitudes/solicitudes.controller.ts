import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

  // GET /solicitudes/pendientes   → las que el propietario (o el coordinador) debe decidir
  @Get('pendientes')
  listarPendientes(@UsuarioActual() usuario: Usuario) {
    return this.solicitudes.listarPendientes(usuario);
  }

  // PATCH /solicitudes/:id/aprobar   → queda "confirmada" y el recurso se bloquea en esas fechas
  @Patch(':id/aprobar')
  aprobar(@Param('id') id: string, @UsuarioActual() usuario: Usuario) {
    return this.solicitudes.aprobar(Number(id), usuario);
  }

  // PATCH /solicitudes/:id/rechazar
  @Patch(':id/rechazar')
  rechazar(@Param('id') id: string, @UsuarioActual() usuario: Usuario) {
    return this.solicitudes.rechazar(Number(id), usuario);
  }
}
