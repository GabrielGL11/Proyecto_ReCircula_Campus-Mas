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
      ssl: { rejectUnauthorized: false }, // Supabase pooler
      max: 5,
    });
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
