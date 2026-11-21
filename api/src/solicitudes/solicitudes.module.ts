import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SolicitudesController } from './solicitudes.controller.js';
import { SolicitudesPgService } from './solicitudes.pg.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SolicitudesController],
  providers: [SolicitudesPgService],
  exports: [SolicitudesPgService],
})
export class SolicitudesModule {}
