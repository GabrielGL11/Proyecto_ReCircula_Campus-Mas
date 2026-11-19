import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import type { CrearRecursoDto } from './recurso.js';
import { RecursosService } from './recursos.service.js';

@Controller('recursos')
export class RecursosController {
  constructor(@Inject(RecursosService) private readonly recursos: RecursosService) {}

  @Post()
  crear(@Body() datos: CrearRecursoDto) {
    return this.recursos.crear(datos);
  }

  @Get()
  listar() {
    return this.recursos.listar();
  }
}
