import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RecursosModule } from './recursos/recursos.module.js';
import { SolicitudesModule } from './solicitudes/solicitudes.module.js';

@Module({
  imports: [RecursosModule, SolicitudesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
