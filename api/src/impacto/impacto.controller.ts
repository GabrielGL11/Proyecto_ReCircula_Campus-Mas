import { Controller, ForbiddenException, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard, type Usuario } from '../auth/auth.guard.js';
import { UsuarioActual } from '../auth/usuario.decorator.js';
import { ImpactoService } from './impacto.service.js';

@Controller('impacto')
@UseGuards(AuthGuard)
export class ImpactoController {
  constructor(@Inject(ImpactoService) private readonly impacto: ImpactoService) {}

  @Get()
  obtener(@UsuarioActual() usuario: Usuario) {
    if (usuario.rol !== 'coordinador') {
      throw new ForbiddenException(['Solo el coordinador puede consultar el panel de impacto.']);
    }
    return this.impacto.obtener();
  }
}
