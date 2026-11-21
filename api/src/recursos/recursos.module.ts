import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RecursosController } from './recursos.controller.js';
import { RecursosPgService } from './recursos.pg.service.js';
import { RecursosService } from './recursos.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RecursosController],
  // RecursosService (en memoria) sigue existiendo para HU-03 y las pruebas unitarias
  // hasta que solicitudes también pase a la base de datos.
  providers: [RecursosService, RecursosPgService],
  exports: [RecursosService, RecursosPgService],
})
export class RecursosModule {}
