import { BadRequestException, Injectable } from '@nestjs/common';
import { CATEGORIAS, type Categoria, type CrearRecursoDto, type Recurso } from './recurso.js';
import { seSuperpone, type Rango } from './rango.js';

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

  crear(datos: CrearRecursoDto): Recurso {
    const errores: string[] = [];
    const nombre = datos.nombre?.trim();

    if (!nombre) errores.push('El nombre es obligatorio.');
    if (!datos.categoria) errores.push('La categoría es obligatoria.');
    else if (!CATEGORIAS.includes(datos.categoria as Categoria)) errores.push('La categoría no es válida.');

    if (errores.length > 0) throw new BadRequestException(errores);

    const recurso: Recurso = {
      id: this.siguienteId++,
      nombre: nombre!,
      categoria: datos.categoria as Categoria,
      estado: 'disponible',
      propietarioId: datos.propietarioId ?? 0,
    };
    this.recursos.push(recurso);
    return recurso;
  }

  // HU-02: sin filtros devuelve todo; con fechas, solo los recursos sin préstamo confirmado en ese rango.
  listar(filtros: FiltrosRecursos = {}): Recurso[] {
    const rango = this.leerRango(filtros);
    return this.recursos.filter(
      (r) =>
        (!filtros.categoria || r.categoria === filtros.categoria) &&
        (!rango || !this.ocupaciones.some((o) => o.recursoId === r.id && seSuperpone(o.rango, rango))),
    );
  }

  // Lo usará HU-04 cuando un préstamo quede "confirmado".
  bloquearFechas(recursoId: number, rango: Rango): void {
    this.ocupaciones.push({ recursoId, rango });
  }

  private leerRango({ desde, hasta }: FiltrosRecursos): Rango | null {
    if (!desde && !hasta) return null;
    if (!desde || !hasta) throw new BadRequestException(['Indica la fecha inicial y la final.']);
    const valida = (f: string) => FECHA_ISO.test(f) && !Number.isNaN(Date.parse(f));
    if (!valida(desde) || !valida(hasta)) throw new BadRequestException(['Las fechas no son válidas (usa AAAA-MM-DD).']);
    if (hasta < desde) throw new BadRequestException(['La fecha final no puede ser anterior a la inicial.']);
    return { inicio: desde, fin: hasta };
  }
}
