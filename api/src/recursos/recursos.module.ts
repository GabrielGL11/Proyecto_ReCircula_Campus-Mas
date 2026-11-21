import { Module } from '@nestjs/common';
import { CategoriasController } from './categorias.controller.js';
import { RecursosController } from './recursos.controller.js';
import { RecursosService } from './recursos.service.js';

@Module({
  controllers: [RecursosController, CategoriasController],
  providers: [RecursosService],
  exports: [RecursosService],
})
export class RecursosModule {}
