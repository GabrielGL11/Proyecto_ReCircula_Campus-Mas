import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

// Convierte los errores de Postgres (triggers, funciones y restricciones de 01_schema.sql)
// en respuestas HTTP con el mensaje en español que ya escribió la base.
export function traducirErrorDb(error: unknown): unknown {
  const e = error as { code?: string; message?: string } | null;
  switch (e?.code) {
    case '23514': // check / regla de negocio (averiado, fechas, transición no permitida...)
    case '22023': // parámetro inválido
    case '23P01': // superposición de préstamos confirmados (R1)
      return new BadRequestException([e.message ?? 'Los datos no son válidos.']);
    case '23503': // clave foránea: categoría, recurso o usuario que no existe
      return new BadRequestException(['La categoría, el recurso o el usuario indicado no existe.']);
    case '42501': // sin permiso
      return new ForbiddenException([e.message ?? 'No tienes permiso para hacer esto.']);
    case 'P0002': // no existe
      return new NotFoundException([e.message ?? 'No se encontró lo solicitado.']);
    default:
      return error;
  }
}
