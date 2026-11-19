import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { RecursosService } from './../src/recursos/recursos.service.js';

// Pruebas por HTTP: comprueban que el controlador lee bien el body y los query params
// y que los errores salen como 400 (nunca 500).
describe('Recursos (e2e)', () => {
  let app: INestApplication<App>;
  let servicio: RecursosService;

  beforeEach(async () => {
    // Solo se falsea Date (no los timers): con todos los timers falsos, supertest se cuelga.
    // "Hoy" = 2026-11-19 en Ecuador.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T17:00:00Z'));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    servicio = app.get(RecursosService);
  });

  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
  });

  describe('POST /recursos', () => {
    it('publica un recurso y queda disponible', async () => {
      const res = await request(app.getHttpServer())
        .post('/recursos')
        .send({ nombre: 'Casio fx-991', categoria: 'calculadora', propietarioId: 1 })
        .expect(201);

      expect(res.body).toMatchObject({ nombre: 'Casio fx-991', categoria: 'calculadora', estado: 'disponible', creadoEn: '2026-11-19' });
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

    it('devuelve lista vacía (no error) si el rango es anterior a la creación del recurso', async () => {
      servicio.crear({ nombre: 'Casio', categoria: 'calculadora' }); // creado el 2026-11-19

      const res = await request(app.getHttpServer()).get('/recursos?desde=2026-11-12&hasta=2026-11-17').expect(200);

      expect(res.body).toEqual([]);
    });

    it('responde 400 si la fecha final es anterior a la inicial', async () => {
      const res = await request(app.getHttpServer()).get('/recursos?desde=2026-11-22&hasta=2026-11-20').expect(400);
      expect(res.body.message).toContain('La fecha final no puede ser anterior a la inicial.');
    });
  });

  describe('GET /categorias', () => {
    it('devuelve las categorías con su etiqueta', async () => {
      const res = await request(app.getHttpServer()).get('/categorias').expect(200);

      expect(res.body).toContainEqual({ valor: 'cable', etiqueta: 'Cable' });
      expect(res.body).toHaveLength(5);
    });
  });
});
