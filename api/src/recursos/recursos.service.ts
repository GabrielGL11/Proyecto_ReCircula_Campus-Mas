import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { esCategoria, type CrearRecursoDto, type EstadoRecurso, type Recurso } from './recurso.js';
import { seSuperpone, type Rango } from './rango.js';
import { hoy } from './fecha.js';

export interface FiltrosRecursos {
  categoria?: string;
  desde?: string;
  hasta?: string;
}

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class RecursosService {
  // En memoria por ahora; luego se reemplaza por un repositorio TypeORM.
  private recursos: Recurso[] = [];
  private siguienteId = 1;
  // Fechas ocupadas por préstamos confirmados. HU-04 las registrará al aprobar.
  private ocupaciones: { recursoId: number; rango: Rango }[] = [];

  // `datos` puede ser undefined (POST sin body) y sus campos de cualquier tipo:
  // se valida todo aquí para responder siempre 400 y nunca 500.
  crear(datos: CrearRecursoDto | undefined): Recurso {
    const { nombre, categoria, propietarioId } = datos ?? ({} as CrearRecursoDto);
    const errores: string[] = [];

    let nombreLimpio = '';
    if (typeof nombre === 'string') {
      nombreLimpio = nombre.trim();
      if (!nombreLimpio) errores.push('El nombre es obligatorio.');
    } else if (nombre === undefined || nombre === null) {
      errores.push('El nombre es obligatorio.');
    } else {
      errores.push('El nombre debe ser texto.');
    }

    if (categoria === undefined || categoria === null || categoria === '') {
      errores.push('La categoría es obligatoria.');
    } else if (!esCategoria(categoria)) {
      errores.push('La categoría no es válida.');
    }

    // TODO(JWT): el propietario saldrá del token, no del body.
    let propietario = 0;
    if (propietarioId !== undefined && propietarioId !== null) {
      if (typeof propietarioId !== 'number' || !Number.isInteger(propietarioId) || propietarioId < 1) {
        errores.push('El propietario no es válido.');
      } else {
        propietario = propietarioId;
      }
    }

    if (errores.length > 0 || !esCategoria(categoria)) throw new BadRequestException(errores);

    const recurso: Recurso = {
      id: this.siguienteId++,
      nombre: nombreLimpio,
      categoria,
      estado: 'disponible',
      propietarioId: propietario,
    };
    this.recursos.push(recurso);
    return recurso;
  }

  // HU-02: sin filtros devuelve todo el catálogo (cada recurso con su estado).
  // Con fechas busca disponibilidad: solo recursos en estado "disponible" (no averiados)
  // y sin préstamo confirmado que se cruce con el rango.
  listar(filtros: FiltrosRecursos = {}): Recurso[] {
    const rango = this.leerRango(filtros);
    return this.recursos.filter(
      (r) =>
        (!filtros.categoria || r.categoria === filtros.categoria) &&
        (!rango ||
          (r.estado === 'disponible' && !this.ocupaciones.some((o) => o.recursoId === r.id && seSuperpone(o.rango, rango)))),
    );
  }

  // HU-03: la solicitud necesita comprobar que el recurso existe y está disponible.
  buscarPorId(id: number): Recurso | undefined {
    return this.recursos.find((r) => r.id === id);
  }

  // Lo usará HU-04 cuando un préstamo quede "confirmado".
  bloquearFechas(recursoId: number, rango: Rango): void {
    this.ocupaciones.push({ recursoId, rango });
  }

  // Punto de entrada para marcar un recurso como averiado o disponible (reparaciones, HU-futuras).
  cambiarEstado(recursoId: number, estado: EstadoRecurso): Recurso {
    const recurso = this.recursos.find((r) => r.id === recursoId);
    if (!recurso) throw new NotFoundException(['El recurso no existe.']);
    recurso.estado = estado;
    return recurso;
  }

  private leerRango({ desde, hasta }: FiltrosRecursos): Rango | null {
    if (!desde && !hasta) return null;
    if (!desde || !hasta) throw new BadRequestException(['Indica la fecha inicial y la final.']);
    const valida = (f: string) => FECHA_ISO.test(f) && !Number.isNaN(Date.parse(f));
    if (!valida(desde) || !valida(hasta)) throw new BadRequestException(['Las fechas no son válidas (usa AAAA-MM-DD).']);
    if (hasta < desde) throw new BadRequestException(['La fecha final no puede ser anterior a la inicial.']);
    // Solo se puede consultar desde hoy en adelante (hoy incluido).
    if (desde < hoy()) throw new BadRequestException(['La fecha inicial no puede ser anterior a hoy.']);
    return { inicio: desde, fin: hasta };
  }
}
