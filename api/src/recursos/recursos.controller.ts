import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard, type Usuario } from '../auth/auth.guard.js';
import { UsuarioActual } from '../auth/usuario.decorator.js';
import type { CrearRecursoDto } from './recurso.js';
import { RecursosPgService } from './recursos.pg.service.js';

@Controller('recursos')
@UseGuards(AuthGuard)
export class RecursosController {
  constructor(@Inject(RecursosPgService) private readonly recursos: RecursosPgService) {}

  // POST /recursos  { nombre, categoria }   (el propietario sale del token)
  @Post()
  crear(@Body() datos: CrearRecursoDto, @UsuarioActual() usuario: Usuario) {
    return this.recursos.crear(datos, usuario);
  }

  // GET /recursos?categoria=cable&desde=2026-11-20&hasta=2026-11-22
  @Get()
  listar(
    @Query('categoria') categoria?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.recursos.listar({ categoria, desde, hasta });
  }
}
