import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ImpactoController } from './impacto.controller.js';
import { ImpactoService } from './impacto.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ImpactoController],
  providers: [ImpactoService],
  exports: [ImpactoService],
})
export class ImpactoModule {}
