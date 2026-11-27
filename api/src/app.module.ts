import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { DbModule } from './db/db.module.js';
import { RecursosModule } from './recursos/recursos.module.js';
import { SolicitudesModule } from './solicitudes/solicitudes.module.js';
import { ListaEsperaModule } from './lista-espera/lista-espera.module.js';
import { OrdenesReparacionModule } from './ordenes-reparacion/ordenes-reparacion.module.js';
import { ImpactoModule } from './impacto/impacto.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    RecursosModule,
    SolicitudesModule,
    ListaEsperaModule,
    OrdenesReparacionModule,
    ImpactoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
