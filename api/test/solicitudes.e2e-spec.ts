import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuthGuard } from './../src/auth/auth.guard.js';
import { SolicitudesPgService } from './../src/solicitudes/solicitudes.pg.service.js';

// Pruebas por HTTP de HU-03 y HU-04. El guard y el servicio de Postgres se reemplazan por dobles:
// aquí se comprueba el controlador (body, 401 sin sesión y que el solicitante sale del token).
describe('Solicitudes (e2e)', () => {
  let app: INestApplication<App>;
  const crear = vi.fn();
  const listar = vi.fn();
  const aprobar = vi.fn();
  const rechazar = vi.fn();
  const listarPendientes = vi.fn();
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
      .useValue({ crear, listar, aprobar, rechazar, listarPendientes })
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

  // ---- HU-04 ----
  it('PATCH /solicitudes/:id/aprobar pasa el id de la ruta y el usuario del token al servicio', async () => {
    await levantar(true);
    aprobar.mockResolvedValue({ id: 10, estado: 'confirmada' });
    await request(app.getHttpServer()).patch('/solicitudes/10/aprobar').expect(200, { id: 10, estado: 'confirmada' });
    expect(aprobar).toHaveBeenCalledWith(10, ana);
  });

  it('PATCH /solicitudes/:id/rechazar pasa el id de la ruta y el usuario del token al servicio', async () => {
    await levantar(true);
    rechazar.mockResolvedValue({ id: 10, estado: 'rechazada' });
    await request(app.getHttpServer()).patch('/solicitudes/10/rechazar').expect(200, { id: 10, estado: 'rechazada' });
    expect(rechazar).toHaveBeenCalledWith(10, ana);
  });

  it('GET /solicitudes/pendientes lista las solicitudes por decidir', async () => {
    await levantar(true);
    listarPendientes.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/solicitudes/pendientes').expect(200, []);
    expect(listarPendientes).toHaveBeenCalledWith(ana);
  });

  it('sin sesión no se puede aprobar, rechazar ni ver pendientes', async () => {
    await levantar(false);
    await request(app.getHttpServer()).patch('/solicitudes/10/aprobar').expect(403);
    await request(app.getHttpServer()).patch('/solicitudes/10/rechazar').expect(403);
    await request(app.getHttpServer()).get('/solicitudes/pendientes').expect(403);
    expect(aprobar).not.toHaveBeenCalled();
    expect(rechazar).not.toHaveBeenCalled();
    expect(listarPendientes).not.toHaveBeenCalled();
  });
});
