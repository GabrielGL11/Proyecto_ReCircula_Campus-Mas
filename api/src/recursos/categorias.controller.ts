import { Controller, Get } from '@nestjs/common';
import { listarCategorias } from './recurso.js';

@Controller('categorias')
export class CategoriasController {
  // GET /categorias -> [{ valor: 'cable', etiqueta: 'Cable' }, ...]
  @Get()
  listar() {
    return listarCategorias();
  }
}
