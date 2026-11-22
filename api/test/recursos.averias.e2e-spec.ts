import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuthGuard } from './../src/auth/auth.guard.js';
import { RecursosPgService } from './../src/recursos/recursos.pg.service.js';

// Pruebas por HTTP de la HU-06: la ruta existe, lee el body y valida el id.
// No usan Supabase: el guard y el servicio de Postgres se reemplazan por dobles.
describe('Reportar avería (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const usuarioFalso = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };

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
        reportarAveria: async (id: number, datos: { descripcion?: string }) => ({
          id: 1,
          recursoId: id,
          reportadaPor: usuarioFalso.id,
          descripcion: datos.descripcion,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /recursos/:id/averias', () => {
    it('reporta la avería de un recurso', async () => {
      const res = await request(app.getHttpServer())
        .post('/recursos/6/averias')
        .send({ descripcion: 'No enciende' })
        .expect(201);

      expect(res.body).toMatchObject({ recursoId: 6, descripcion: 'No enciende' });
    });

    it('responde 400 si el id no es un número', async () => {
      await request(app.getHttpServer()).post('/recursos/abc/averias').send({ descripcion: 'x' }).expect(400);
    });
  });
});