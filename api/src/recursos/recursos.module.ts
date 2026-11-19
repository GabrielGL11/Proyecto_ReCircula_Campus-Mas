import { Module } from '@nestjs/common';
import { RecursosController } from './recursos.controller.js';
import { RecursosService } from './recursos.service.js';

@Module({
  controllers: [RecursosController],
  providers: [RecursosService],
})
export class RecursosModule {}
