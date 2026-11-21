import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type Usuario } from './auth.guard.js';
import { UsuarioActual } from './usuario.decorator.js';

// TEMPORAL: sirve para comprobar el login. GET /auth/yo devuelve quién eres.
@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  @Get('yo')
  yo(@UsuarioActual() usuario: Usuario) {
    return usuario;
  }
}
