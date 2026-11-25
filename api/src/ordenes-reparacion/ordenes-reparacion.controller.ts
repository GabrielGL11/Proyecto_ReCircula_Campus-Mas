import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type Usuario } from '../auth/auth.guard.js';
import { UsuarioActual } from '../auth/usuario.decorator.js';
import type { AbrirOrdenDto, AvanzarOrdenDto } from './orden-reparacion.js';
import { OrdenesReparacionPgService } from './ordenes-reparacion.pg.service.js';

@Controller('ordenes-reparacion')
@UseGuards(AuthGuard)
export class OrdenesReparacionController {
  constructor(@Inject(OrdenesReparacionPgService) private readonly ordenes: OrdenesReparacionPgService) {}

  // POST /ordenes-reparacion  { averiaId }   → la orden nace "abierta" (solo coordinador)
  @Post()
  abrir(@Body() datos: AbrirOrdenDto, @UsuarioActual() usuario: Usuario) {
    return this.ordenes.abrir(datos, usuario);
  }

  // GET /ordenes-reparacion   → todas las órdenes, las en curso primero
  @Get()
  listar(@UsuarioActual() usuario: Usuario) {
    return this.ordenes.listar(usuario);
  }

  // GET /ordenes-reparacion/averias-sin-orden   → averías que aún no tienen orden
  @Get('averias-sin-orden')
  listarAveriasSinOrden(@UsuarioActual() usuario: Usuario) {
    return this.ordenes.listarAveriasSinOrden(usuario);
  }

  // GET /ordenes-reparacion/:id/historial   → quién cambió cada estado y cuándo
  @Get(':id/historial')
  historial(@Param('id') id: string, @UsuarioActual() usuario: Usuario) {
    return this.ordenes.historial(Number(id), usuario);
  }

  // PATCH /ordenes-reparacion/:id/estado  { estado }   → abierta → en_reparacion → resuelta
  @Patch(':id/estado')
  avanzar(@Param('id') id: string, @Body() datos: AvanzarOrdenDto, @UsuarioActual() usuario: Usuario) {
    return this.ordenes.avanzar(Number(id), datos, usuario);
  }
}
