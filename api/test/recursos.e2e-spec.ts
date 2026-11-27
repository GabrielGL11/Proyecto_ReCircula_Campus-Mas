import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuthGuard } from './../src/auth/auth.guard.js';
import { RecursosPgService } from './../src/recursos/recursos.pg.service.js';
import { RecursosService, type FiltrosRecursos } from './../src/recursos/recursos.service.js';

// Pruebas por HTTP: comprueban que el controlador lee bien el body y los query params
// y que los errores salen como 400 (nunca 500).
// No usan Supabase: el guard y el servicio de Postgres se reemplazan por dobles en memoria.
describe('Recursos (e2e)', () => {
  let app: INestApplication<App>;
  let servicio: RecursosService;
  const listarParaMantenimiento = vi.fn();
  const cambiarMantenimiento = vi.fn();

  beforeEach(async () => {
    listarParaMantenimiento.mockReset();
    cambiarMantenimiento.mockReset();
    const memoria = new RecursosService();
    const usuarioFalso = { id: 1, nombre: 'Carlos Vaca', rol: 'propietario' };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (contexto: ExecutionContext) => {
          contexto.switchToHttp().getRequest().usuario = usuarioFalso;
          return true;
        },
      })
      .overrideProvider(RecursosPgService)
      .useValue({
        crear: async (datos: object | undefined) => memoria.crear({ ...datos, propietarioId: usuarioFalso.id }),
        listar: async (filtros: FiltrosRecursos) => memoria.listar(filtros),
        listarParaMantenimiento,
        cambiarMantenimiento,
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    servicio = memoria;
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /recursos', () => {
    it('publica un recurso y queda disponible', async () => {
      const res = await request(app.getHttpServer())
        .post('/recursos')
        .send({ nombre: 'Casio fx-991', categoria: 'calculadora', propietarioId: 1 })
        .expect(201);

      expect(res.body).toMatchObject({ nombre: 'Casio fx-991', categoria: 'calculadora', estado: 'disponible' });
      const lista = await request(app.getHttpServer()).get('/recursos').expect(200);
      expect(lista.body).toHaveLength(1);
    });

    it('responde 400 si el nombre no es texto', async () => {
      const res = await request(app.getHttpServer())
        .post('/recursos')
        .send({ nombre: 123, categoria: 'cable' })
        .expect(400);
      expect(res.body.message).toContain('El nombre debe ser texto.');
    });

    it('responde 400 si no se envía body', async () => {
      await request(app.getHttpServer()).post('/recursos').expect(400);
    });
  });

  describe('Rutas de mantenimiento (HU-11)', () => {
    it('pasa el usuario autenticado al listado del coordinador', async () => {
      listarParaMantenimiento.mockResolvedValue([{ id: 6, estado: 'retirado' }]);
      const res = await request(app.getHttpServer()).get('/recursos/mantenimiento').expect(200);
      expect(res.body).toEqual([{ id: 6, estado: 'retirado' }]);
      expect(listarParaMantenimiento).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    it.each(['retirar', 'reincorporar'])('pasa el id y el usuario autenticado al %s', async (accion) => {
      cambiarMantenimiento.mockResolvedValue({ id: 6 });
      await request(app.getHttpServer()).patch(`/recursos/6/${accion}`).expect(200);
      expect(cambiarMantenimiento).toHaveBeenCalledWith(6, accion, expect.objectContaining({ id: 1 }));
    });
  });

  describe('GET /recursos', () => {
    it('filtra por categoría desde el query string', async () => {
      servicio.crear({ nombre: 'Casio', categoria: 'calculadora' });
      servicio.crear({ nombre: 'HDMI', categoria: 'cable' });

      const res = await request(app.getHttpServer()).get('/recursos?categoria=cable').expect(200);

      expect(res.body.map((r: { nombre: string }) => r.nombre)).toEqual(['HDMI']);
    });

    it('con desde/hasta excluye el recurso con préstamo confirmado en ese rango', async () => {
      const ocupado = servicio.crear({ nombre: 'Casio', categoria: 'calculadora' });
      servicio.crear({ nombre: 'Texas', categoria: 'calculadora' });
      servicio.bloquearFechas(ocupado.id, { inicio: '2026-11-20', fin: '2026-11-25' });

      const res = await request(app.getHttpServer())
        .get('/recursos?categoria=calculadora&desde=2026-11-22&hasta=2026-11-23')
        .expect(200);

      expect(res.body.map((r: { nombre: string }) => r.nombre)).toEqual(['Texas']);
    });

    it('responde 400 si falta una de las fechas', async () => {
      await request(app.getHttpServer()).get('/recursos?desde=2026-11-22').expect(400);
    });

    it('responde 400 si la fecha tiene formato inválido', async () => {
      await request(app.getHttpServer()).get('/recursos?desde=22/11/2026&hasta=23/11/2026').expect(400);
    });

    it('responde 400 si la fecha final es anterior a la inicial', async () => {
      const res = await request(app.getHttpServer()).get('/recursos?desde=2026-11-22&hasta=2026-11-20').expect(400);
      expect(res.body.message).toContain('La fecha final no puede ser anterior a la inicial.');
    });
  });
});
