import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

// pg devuelve bigint y date como texto/Date; aquí los dejamos como number y 'AAAA-MM-DD'.
pg.types.setTypeParser(20, (v: string) => Number(v)); // bigint -> number
pg.types.setTypeParser(1082, (v: string) => v); // date -> '2026-11-21'

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool: pg.Pool;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.pool = new pg.Pool({
      connectionString: config.get<string>('DATABASE_URL'),
      ssl: DbService.opcionesSsl(config),
      max: 5,
    });
  }

  // Si se define DB_SSL_CA_BASE64 (el certificado CA de Supabase en base64), se verifica el
  // certificado del servidor. Sin esa variable se mantiene el comportamiento anterior
  // (cifrado sin verificar el certificado), así que activar la verificación es opcional.
  private static opcionesSsl(config: ConfigService): pg.PoolConfig['ssl'] {
    const caBase64 = config.get<string>('DB_SSL_CA_BASE64');
    if (!caBase64) return { rejectUnauthorized: false };
    return { ca: Buffer.from(caBase64, 'base64').toString('utf8'), rejectUnauthorized: true };
  }

  // Consulta simple (lecturas sin usuario, p. ej. buscar_recursos).
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.pool.query<T>(sql, params);
  }

  // Ejecuta varias consultas en una transacción indicando QUIÉN actúa.
  // La base usa app.actor (vía app_actor()) para saber el usuario.
  async comoActor<T>(usuarioId: number, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await c.query("select set_config('app.actor', $1, true)", [String(usuarioId)]);
      const resultado = await fn(c);
      await c.query('commit');
      return resultado;
    } catch (error) {
      await c.query('rollback');
      throw error;
    } finally {
      c.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
