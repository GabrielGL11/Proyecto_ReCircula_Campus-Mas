import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ListaEsperaController } from './lista-espera.controller.js';
import { ListaEsperaPgService } from './lista-espera.pg.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ListaEsperaController],
  providers: [ListaEsperaPgService],
  exports: [ListaEsperaPgService],
})
export class ListaEsperaModule {}
