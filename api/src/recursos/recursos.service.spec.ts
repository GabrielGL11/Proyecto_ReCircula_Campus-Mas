import { BadRequestException } from '@nestjs/common';
import { RecursosService } from './recursos.service.js';

describe('RecursosService (HU-01)', () => {
  let service: RecursosService;

  beforeEach(() => {
    service = new RecursosService();
  });

  // Criterio (a)
  it('publica un recurso con datos completos y queda "disponible" en el catálogo', () => {
    const recurso = service.crear({ nombre: 'Calculadora Casio fx-991', categoria: 'calculadora', propietarioId: 1 });

    expect(recurso.estado).toBe('disponible');
    expect(service.listar()).toContainEqual(recurso);
  });

  // Criterio (b)
  it('rechaza un recurso sin nombre y no lo guarda', () => {
    expect(() => service.crear({ nombre: '  ', categoria: 'cable', propietarioId: 1 })).toThrow(BadRequestException);
    expect(service.listar()).toHaveLength(0);
  });

  it('rechaza un recurso sin categoría y no lo guarda', () => {
    expect(() => service.crear({ nombre: 'Cable HDMI', propietarioId: 1 })).toThrow(BadRequestException);
    expect(service.listar()).toHaveLength(0);
  });

  it('rechaza una categoría que no existe', () => {
    expect(() => service.crear({ nombre: 'Algo', categoria: 'inventada', propietarioId: 1 })).toThrow(BadRequestException);
  });

  it('asigna un id distinto a cada recurso', () => {
    const a = service.crear({ nombre: 'Ratón', categoria: 'periferico', propietarioId: 1 });
    const b = service.crear({ nombre: 'Cable USB', categoria: 'cable', propietarioId: 2 });
    expect(a.id).not.toBe(b.id);
  });
});
