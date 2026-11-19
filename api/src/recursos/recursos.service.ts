import { BadRequestException, Injectable } from '@nestjs/common';
import { CATEGORIAS, type Categoria, type CrearRecursoDto, type Recurso } from './recurso.js';

@Injectable()
export class RecursosService {
  // En memoria por ahora; luego se reemplaza por un repositorio TypeORM.
  private recursos: Recurso[] = [];
  private siguienteId = 1;

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

  listar(): Recurso[] {
    return [...this.recursos];
  }
}
