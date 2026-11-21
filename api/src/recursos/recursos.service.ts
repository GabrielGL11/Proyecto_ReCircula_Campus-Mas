import { BadRequestException, Injectable } from '@nestjs/common';
import type { CrearRecursoDto, Recurso } from './recurso.js';
import { seSuperpone, type Rango } from './rango.js';
import { validarFiltroFechas, validarNombreYCategoria } from './validar.js';

export interface FiltrosRecursos {
  categoria?: string;
  desde?: string;
  hasta?: string;
}

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
    const {
      errores,
      nombre: nombreLimpio,
      categoria: categoriaValida,
    } = validarNombreYCategoria(nombre, categoria);

    // TODO(JWT): el propietario saldrá del token, no del body.
    let propietario = 0;
    if (propietarioId !== undefined && propietarioId !== null) {
      if (typeof propietarioId !== 'number' || !Number.isInteger(propietarioId) || propietarioId < 1) {
        errores.push('El propietario no es válido.');
      } else {
        propietario = propietarioId;
      }
    }

    if (errores.length > 0 || !categoriaValida) throw new BadRequestException(errores);

    const recurso: Recurso = {
      id: this.siguienteId++,
      nombre: nombreLimpio,
      categoria: categoriaValida,
      estado: 'disponible',
      propietarioId: propietario,
    };
    this.recursos.push(recurso);
    return recurso;
  }

  // HU-02: sin filtros devuelve todo el catálogo; con fechas, solo los recursos sin préstamo confirmado en ese rango.
  listar(filtros: FiltrosRecursos = {}): Recurso[] {
    const rango = this.leerRango(filtros);
    return this.recursos.filter(
      (r) =>
        (!filtros.categoria || r.categoria === filtros.categoria) &&
        (!rango || !this.ocupaciones.some((o) => o.recursoId === r.id && seSuperpone(o.rango, rango))),
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

  private leerRango({ desde, hasta }: FiltrosRecursos): Rango | null {
    const { rango, error } = validarFiltroFechas(desde, hasta);
    if (error) throw new BadRequestException([error]);
    return rango;
  }
}
