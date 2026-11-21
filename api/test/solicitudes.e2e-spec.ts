import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuthGuard } from './../src/auth/auth.guard.js';
import { SolicitudesPgService } from './../src/solicitudes/solicitudes.pg.service.js';

// Pruebas por HTTP de HU-03. El guard y el servicio de Postgres se reemplazan por dobles:
// aquí se comprueba el controlador (body, 401 sin sesión y que el solicitante sale del token).
describe('Solicitudes (e2e)', () => {
  let app: INestApplication<App>;
  const crear = vi.fn();
  const listar = vi.fn();
  const ana = { id: 4, nombre: 'Ana Loor', rol: 'solicitante' };

  async function levantar(conSesion: boolean) {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (contexto: ExecutionContext) => {
          if (!conSesion) return false;
          contexto.switchToHttp().getRequest().usuario = ana;
          return true;
        },
      })
      .overrideProvider(SolicitudesPgService)
      .useValue({ crear, listar })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('POST /solicitudes pasa el body y el usuario del token al servicio', async () => {
    await levantar(true);
    crear.mockResolvedValue({ id: 1, estado: 'pendiente' });
    const cuerpo = { recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22', solicitanteId: 99 };

    await request(app.getHttpServer()).post('/solicitudes').send(cuerpo).expect(201);

    expect(crear).toHaveBeenCalledWith(expect.objectContaining({ recursoId: 6 }), ana);
  });

  it('GET /solicitudes lista las del usuario autenticado', async () => {
    await levantar(true);
    listar.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/solicitudes').expect(200, []);
    expect(listar).toHaveBeenCalledWith(ana);
  });

  it('sin sesión no se puede solicitar ni listar', async () => {
    await levantar(false);
    await request(app.getHttpServer()).post('/solicitudes').send({}).expect(403);
    await request(app.getHttpServer()).get('/solicitudes').expect(403);
    expect(crear).not.toHaveBeenCalled();
  });
});
