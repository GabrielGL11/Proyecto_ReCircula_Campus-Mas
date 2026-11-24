import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type Usuario } from '../auth/auth.guard.js';
import { UsuarioActual } from '../auth/usuario.decorator.js';
import type { CrearEsperaDto } from './lista-espera.js';
import { ListaEsperaPgService } from './lista-espera.pg.service.js';

@Controller('lista-espera')
@UseGuards(AuthGuard)
export class ListaEsperaController {
  constructor(@Inject(ListaEsperaPgService) private readonly listaEspera: ListaEsperaPgService) {}

  // POST /lista-espera  { recursoId, inicio, fin }
  @Post()
  anotar(@Body() datos: CrearEsperaDto, @UsuarioActual() usuario: Usuario) {
    return this.listaEspera.anotar(datos, usuario);
  }

  // GET /lista-espera
  @Get()
  listar(@UsuarioActual() usuario: Usuario) {
    return this.listaEspera.listar(usuario);
  }

  // PATCH /lista-espera/:id/cancelar
  @Patch(':id/cancelar')
  cancelar(@Param('id') id: string, @UsuarioActual() usuario: Usuario) {
    return this.listaEspera.cancelar(Number(id), usuario);
  }
}
