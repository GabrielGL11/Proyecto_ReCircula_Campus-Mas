import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import type { CrearRecursoDto } from './recurso.js';
import { RecursosService } from './recursos.service.js';

@Controller('recursos')
export class RecursosController {
  constructor(@Inject(RecursosService) private readonly recursos: RecursosService) {}

  @Post()
  crear(@Body() datos: CrearRecursoDto) {
    return this.recursos.crear(datos);
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
