import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

// Uso en un controlador:  crear(@UsuarioActual() usuario: Usuario) { ... }
export const UsuarioActual = createParamDecorator((_dato: unknown, contexto: ExecutionContext) => {
  return contexto.switchToHttp().getRequest().usuario;
});
