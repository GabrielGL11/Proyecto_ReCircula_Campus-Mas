import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecursosService } from './recursos.service.js';

describe('RecursosService: consultar disponibilidad (HU-02)', () => {
  let service: RecursosService;

  // Reloj fijo: "hoy" es 2026-11-19 (12:00 en Ecuador), así los tests no dependen del día en que se ejecuten.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T17:00:00Z'));
    service = new RecursosService();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('con fechas excluye los recursos averiados, pero sin fechas el catálogo los muestra', () => {
    const roto = service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    const sano = service.crear({ nombre: 'Texas', categoria: 'calculadora', propietarioId: 1 });
    service.cambiarEstado(roto.id, 'averiado');

    expect(service.listar({ desde: '2026-11-20', hasta: '2026-11-21' })).toEqual([sano]);
    expect(service.listar()).toHaveLength(2);
  });

  it('un recurso reparado vuelve a aparecer en la búsqueda por fechas', () => {
    const recurso = service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    service.cambiarEstado(recurso.id, 'averiado');
    service.cambiarEstado(recurso.id, 'disponible');

    expect(service.listar({ desde: '2026-11-20', hasta: '2026-11-21' })).toEqual([recurso]);
  });

  it('cambiarEstado falla si el recurso no existe', () => {
    expect(() => service.cambiarEstado(999, 'averiado')).toThrow(NotFoundException);
  });

  it('rechaza una fecha final anterior a la inicial', () => {
    expect(() => service.listar({ desde: '2026-11-25', hasta: '2026-11-20' })).toThrow(BadRequestException);
  });

  it('rechaza una fecha inicial anterior a hoy', () => {
    expect(() => service.listar({ desde: '2026-11-18', hasta: '2026-11-20' })).toThrow(BadRequestException);
  });

  it('acepta una fecha inicial igual a hoy', () => {
    const recurso = service.crear({ nombre: 'Casio', categoria: 'calculadora', propietarioId: 1 });
    expect(service.listar({ desde: '2026-11-19', hasta: '2026-11-19' })).toEqual([recurso]);
  });

  it('usa la fecha de Ecuador y no la del servidor (UTC)', () => {
    // 2026-11-20 02:00 UTC = 2026-11-19 21:00 en Ecuador: todavía es 19.
    vi.setSystemTime(new Date('2026-11-20T02:00:00Z'));
    expect(() => service.listar({ desde: '2026-11-19', hasta: '2026-11-19' })).not.toThrow();
    expect(() => service.listar({ desde: '2026-11-18', hasta: '2026-11-19' })).toThrow(BadRequestException);
  });

  it('rechaza si falta una de las dos fechas', () => {
    expect(() => service.listar({ desde: '2026-11-25' })).toThrow(BadRequestException);
  });

  it('rechaza fechas con formato inválido', () => {
    expect(() => service.listar({ desde: '25/11/2026', hasta: '26/11/2026' })).toThrow(BadRequestException);
  });
});
