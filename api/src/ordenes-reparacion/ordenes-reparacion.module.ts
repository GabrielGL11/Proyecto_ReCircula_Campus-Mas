import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrdenesReparacionController } from './ordenes-reparacion.controller.js';
import { OrdenesReparacionPgService } from './ordenes-reparacion.pg.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrdenesReparacionController],
  providers: [OrdenesReparacionPgService],
  exports: [OrdenesReparacionPgService],
})
export class OrdenesReparacionModule {}
