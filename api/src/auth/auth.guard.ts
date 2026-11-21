import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DbService } from '../db/db.service.js';

export type Rol = 'solicitante' | 'propietario' | 'coordinador';

// Quién hace la petición, según la tabla usuarios.
export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
}

// Comprueba el token de Supabase (Authorization: Bearer ...) y deja el usuario en req.usuario.
@Injectable()
export class AuthGuard implements CanActivate {
  private cliente?: SupabaseClient;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DbService) private readonly db: DbService,
  ) {}

  // Se crea al primer uso, así las pruebas sin SUPABASE_URL no fallan al arrancar.
  private get supabase(): SupabaseClient {
    this.cliente ??= createClient(
      this.config.getOrThrow<string>('SUPABASE_URL'),
      this.config.getOrThrow<string>('SUPABASE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    return this.cliente;
  }

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest();
    const cabecera: string | undefined = req.headers['authorization'];
    const token = cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar.');

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Tu sesión no es válida o venció.');

    const { rows } = await this.db.query<Usuario>(
      'select id, nombre, rol from usuarios where auth_id = $1',
      [data.user.id],
    );
    if (rows.length === 0) throw new ForbiddenException('Tu cuenta no está registrada en ReCircula.');

    req.usuario = rows[0];
    return true;
  }
}
