import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AuthGuard } from './../src/auth/auth.guard.js';
import { ListaEsperaPgService } from './../src/lista-espera/lista-espera.pg.service.js';

describe('ListaEspera (e2e)', () => {
  let app: INestApplication<App>;
  const anotar = vi.fn();
  const listar = vi.fn();
  const cancelar = vi.fn();
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
      .overrideProvider(ListaEsperaPgService)
      .useValue({ anotar, listar, cancelar })
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('POST /lista-espera pasa el body y usuario de token al servicio', async () => {
    await levantar(true);
    anotar.mockResolvedValue({ id: 1, estado: 'en_espera' });
    const cuerpo = { recursoId: 6, inicio: '2026-11-20', fin: '2026-11-22' };

    await request(app.getHttpServer()).post('/lista-espera').send(cuerpo).expect(201);
    expect(anotar).toHaveBeenCalledWith(expect.objectContaining({ recursoId: 6 }), ana);
  });

  it('POST /lista-espera sin sesión responde 403', async () => {
    await levantar(false);
    await request(app.getHttpServer()).post('/lista-espera').send({ recursoId: 6 }).expect(403);
  });

  it('GET /lista-espera devuelve las entradas del solicitante', async () => {
    await levantar(true);
    listar.mockResolvedValue([{ id: 1, estado: 'en_espera' }]);

    const res = await request(app.getHttpServer()).get('/lista-espera').expect(200);
    expect(res.body).toEqual([{ id: 1, estado: 'en_espera' }]);
    expect(listar).toHaveBeenCalledWith(ana);
  });

  it('PATCH /lista-espera/:id/cancelar permite cancelar una entrada', async () => {
    await levantar(true);
    cancelar.mockResolvedValue({ id: 1, estado: 'cancelada' });

    const res = await request(app.getHttpServer()).patch('/lista-espera/1/cancelar').expect(200);
    expect(res.body).toEqual({ id: 1, estado: 'cancelada' });
    expect(cancelar).toHaveBeenCalledWith(1, ana);
  });
});
