import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { traducirErrorDb } from './db-errores.js';

describe('traducirErrorDb', () => {
  it('convierte las reglas de negocio de la base en 400 con su mensaje', () => {
    const error = traducirErrorDb({ code: '23514', message: 'Transición no permitida: abierta → resuelta' });

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: ['Transición no permitida: abierta → resuelta'],
    });
  });

  it('convierte el duplicado en la lista de espera en 409 (HU-07)', () => {
    const error = traducirErrorDb({ code: '23505', constraint: 'lista_espera_unica_idx' });

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      message: ['Ya estás en la lista de espera de este recurso para esas fechas.'],
    });
  });

  it('convierte una segunda orden para la misma avería en 409 (HU-08)', () => {
    const error = traducirErrorDb({ code: '23505', constraint: 'ordenes_reparacion_averia_id_key' });

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      message: ['Esa avería ya tiene una orden de reparación.'],
    });
  });

  it('usa un mensaje genérico para otros duplicados', () => {
    const error = traducirErrorDb({ code: '23505', constraint: 'otra_restriccion' });

    expect((error as ConflictException).getResponse()).toMatchObject({
      message: ['Ya existe un registro con esos datos.'],
    });
  });

  it('convierte sin permiso en 403 y no existe en 404', () => {
    expect(traducirErrorDb({ code: '42501', message: 'Solo el coordinador' })).toBeInstanceOf(ForbiddenException);
    expect(traducirErrorDb({ code: 'P0002', message: 'La orden 9 no existe' })).toBeInstanceOf(NotFoundException);
  });

  it('deja pasar los errores que no reconoce', () => {
    const desconocido = new Error('se cayó la conexión');

    expect(traducirErrorDb(desconocido)).toBe(desconocido);
  });
});
