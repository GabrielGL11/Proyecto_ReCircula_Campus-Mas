import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuthGuard } from './../src/auth/auth.guard.js';
import { OrdenesReparacionPgService } from './../src/ordenes-reparacion/ordenes-reparacion.pg.service.js';

describe('OrdenesReparacion (e2e)', () => {
  let app: INestApplication<App>;
  const abrir = vi.fn();
  const avanzar = vi.fn();
  const listar = vi.fn();
  const listarAveriasSinOrden = vi.fn();
  const historial = vi.fn();
  const coordinacion = { id: 3, nombre: 'Coordinación', rol: 'coordinador' };

  async function levantar(conSesion: boolean) {
    const modulo: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (contexto: ExecutionContext) => {
          if (!conSesion) return false;
          contexto.switchToHttp().getRequest().usuario = coordinacion;
          return true;
        },
      })
      .overrideProvider(OrdenesReparacionPgService)
      .useValue({ abrir, avanzar, listar, listarAveriasSinOrden, historial })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('POST /ordenes-reparacion pasa el body y el usuario del token al servicio', async () => {
    await levantar(true);
    abrir.mockResolvedValue({ id: 1, estado: 'abierta' });

    const res = await request(app.getHttpServer()).post('/ordenes-reparacion').send({ averiaId: 5 }).expect(201);
    expect(res.body).toEqual({ id: 1, estado: 'abierta' });
    expect(abrir).toHaveBeenCalledWith({ averiaId: 5 }, coordinacion);
  });

  it('POST /ordenes-reparacion sin sesión responde 403', async () => {
    await levantar(false);
    await request(app.getHttpServer()).post('/ordenes-reparacion').send({ averiaId: 5 }).expect(403);
    expect(abrir).not.toHaveBeenCalled();
  });

  it('GET /ordenes-reparacion devuelve las órdenes', async () => {
    await levantar(true);
    listar.mockResolvedValue([{ id: 1, estado: 'abierta' }]);

    const res = await request(app.getHttpServer()).get('/ordenes-reparacion').expect(200);
    expect(res.body).toEqual([{ id: 1, estado: 'abierta' }]);
    expect(listar).toHaveBeenCalledWith(coordinacion);
  });

  it('GET /ordenes-reparacion/averias-sin-orden devuelve las averías por atender', async () => {
    await levantar(true);
    listarAveriasSinOrden.mockResolvedValue([{ id: 5, recursoNombre: 'Probeta' }]);

    const res = await request(app.getHttpServer()).get('/ordenes-reparacion/averias-sin-orden').expect(200);
    expect(res.body).toEqual([{ id: 5, recursoNombre: 'Probeta' }]);
    expect(listarAveriasSinOrden).toHaveBeenCalledWith(coordinacion);
    expect(historial).not.toHaveBeenCalled();
  });

  it('PATCH /ordenes-reparacion/:id/estado avanza el estado', async () => {
    await levantar(true);
    avanzar.mockResolvedValue({ id: 1, estado: 'en_reparacion' });

    const res = await request(app.getHttpServer())
      .patch('/ordenes-reparacion/1/estado')
      .send({ estado: 'en_reparacion' })
      .expect(200);
    expect(res.body).toEqual({ id: 1, estado: 'en_reparacion' });
    expect(avanzar).toHaveBeenCalledWith(1, { estado: 'en_reparacion' }, coordinacion);
  });

  it('GET /ordenes-reparacion/:id/historial devuelve quién y cuándo cambió cada estado', async () => {
    await levantar(true);
    historial.mockResolvedValue([{ id: 1, estadoNuevo: 'abierta', cambiadoPorNombre: 'Coordinación' }]);

    const res = await request(app.getHttpServer()).get('/ordenes-reparacion/1/historial').expect(200);
    expect(res.body).toEqual([{ id: 1, estadoNuevo: 'abierta', cambiadoPorNombre: 'Coordinación' }]);
    expect(historial).toHaveBeenCalledWith(1, coordinacion);
  });
});
