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

  // Un body mal tipado debe dar 400 (BadRequest), nunca un TypeError (500).
  it('rechaza un nombre que no es texto', () => {
    expect(() => service.crear({ nombre: 123, categoria: 'cable' })).toThrow(BadRequestException);
    expect(() => service.crear({ nombre: { x: 1 }, categoria: 'cable' })).toThrow(BadRequestException);
    expect(service.listar()).toHaveLength(0);
  });

  it('rechaza una categoría que no es texto o es un nombre heredado de Object', () => {
    expect(() => service.crear({ nombre: 'Algo', categoria: 5 })).toThrow(BadRequestException);
    expect(() => service.crear({ nombre: 'Algo', categoria: 'toString' })).toThrow(BadRequestException);
  });

  it('rechaza un body ausente (POST sin cuerpo)', () => {
    expect(() => service.crear(undefined)).toThrow(BadRequestException);
  });

  it('informa todos los errores a la vez', () => {
    let error: BadRequestException | undefined;
    try {
      service.crear({});
    } catch (e) {
      error = e as BadRequestException;
    }
    expect(error?.getResponse()).toMatchObject({
      message: ['El nombre es obligatorio.', 'La categoría es obligatoria.'],
    });
  });

  it('rechaza un propietario que no es un entero positivo', () => {
    expect(() => service.crear({ nombre: 'Algo', categoria: 'cable', propietarioId: 'uno' })).toThrow(BadRequestException);
    expect(() => service.crear({ nombre: 'Algo', categoria: 'cable', propietarioId: -3 })).toThrow(BadRequestException);
    expect(() => service.crear({ nombre: 'Algo', categoria: 'cable', propietarioId: 1.5 })).toThrow(BadRequestException);
  });

  it('sin propietario usa 0 (pendiente hasta tener JWT)', () => {
    expect(service.crear({ nombre: 'Algo', categoria: 'cable' }).propietarioId).toBe(0);
  });

  it('recorta los espacios del nombre', () => {
    expect(service.crear({ nombre: '  Casio  ', categoria: 'calculadora' }).nombre).toBe('Casio');
  });

  it('asigna un id distinto a cada recurso', () => {
    const a = service.crear({ nombre: 'Ratón', categoria: 'periferico', propietarioId: 1 });
    const b = service.crear({ nombre: 'Cable USB', categoria: 'cable', propietarioId: 2 });
    expect(a.id).not.toBe(b.id);
  });
});
