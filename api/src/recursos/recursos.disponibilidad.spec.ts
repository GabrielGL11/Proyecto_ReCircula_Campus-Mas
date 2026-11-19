import { BadRequestException } from '@nestjs/common';
import { RecursosService } from './recursos.service.js';

describe('RecursosService: consultar disponibilidad (HU-02)', () => {
  let service: RecursosService;

  beforeEach(() => {
    service = new RecursosService();
  });

  it('sin filtros devuelve todos los recursos', () => {
    service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    service.crear({ nombre: 'HDMI', categoria: 'cable', propietarioId: 1 });
    expect(service.listar()).toHaveLength(2);
  });

  it('filtra por categoría', () => {
    service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    const cable = service.crear({ nombre: 'HDMI', categoria: 'cable', propietarioId: 1 });
    expect(service.listar({ categoria: 'cable' })).toEqual([cable]);
  });

  // Criterio (a)
  it('con fechas excluye los recursos con préstamo confirmado en ese rango', () => {
    const ocupado = service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    const libre = service.crear({ nombre: 'Texas', categoria: 'calculadora', propietarioId: 2 });
    service.bloquearFechas(ocupado.id, { inicio: '2026-11-20', fin: '2026-11-25' });

    const resultado = service.listar({ desde: '2026-11-22', hasta: '2026-11-23' });

    expect(resultado).toEqual([libre]);
  });

  it('incluye un recurso cuyo préstamo no se cruza con el rango', () => {
    const recurso = service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    service.bloquearFechas(recurso.id, { inicio: '2026-11-20', fin: '2026-11-25' });

    expect(service.listar({ desde: '2026-11-26', hasta: '2026-11-28' })).toEqual([recurso]);
  });

  // Criterio (b): el mensaje "sin resultados" lo muestra la web a partir de la lista vacía
  it('devuelve lista vacía cuando ningún recurso está libre', () => {
    const recurso = service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    service.bloquearFechas(recurso.id, { inicio: '2026-11-20', fin: '2026-11-25' });

    expect(service.listar({ desde: '2026-11-21', hasta: '2026-11-22' })).toEqual([]);
  });

  it('rechaza una fecha final anterior a la inicial', () => {
    expect(() => service.listar({ desde: '2026-11-25', hasta: '2026-11-20' })).toThrow(BadRequestException);
  });

  it('rechaza si falta una de las dos fechas', () => {
    expect(() => service.listar({ desde: '2026-11-25' })).toThrow(BadRequestException);
  });

  it('rechaza fechas con formato inválido', () => {
    expect(() => service.listar({ desde: '25/11/2026', hasta: '26/11/2026' })).toThrow(BadRequestException);
  });
});
