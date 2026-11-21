-- =====================================================================
-- ReCircula Campus · 01_schema.sql  (esquema NÚCLEO)
-- Compatible con PostgreSQL 14+ y con Supabase. Se ejecuta primero en
-- ambos motores; luego se aplica el adaptador de cada uno (02_*.sql).
--
-- Reglas del dominio (portafolio de modelado):
--   R1  Un recurso no puede tener dos préstamos confirmados superpuestos.
--   R2  La fecha de fin no puede ser anterior a la de inicio.
--   R3  Solo el propietario o el coordinador aprueban/rechazan.
--   R4  Registrar la devolución libera el recurso y guarda la fecha real.
-- Decisiones de modelo:
--   * El préstamo NO es una tabla aparte: es una solicitud "confirmada".
--   * La disponibilidad NO se guarda: se calcula desde las solicitudes
--     confirmadas (funciones buscar_recursos / recurso_esta_disponible).
--   * Estados del recurso guardados: disponible | averiado | retirado.
--     "prestado" se deriva (vista v_catalogo.estado_actual).
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists categorias (
  nombre text primary key
    check (length(btrim(nombre)) > 0 and nombre = lower(nombre))
);

create table if not exists usuarios (
  id        bigint generated always as identity primary key,
  auth_id   uuid unique,   -- vínculo opcional con Supabase Auth (ver 02_supabase)
  nombre    text not null check (length(btrim(nombre)) > 0),
  correo    text not null unique check (correo = lower(correo)),
  rol       text not null default 'solicitante'
              check (rol in ('solicitante','propietario','coordinador')),
  creado_en timestamptz not null default now()
);

create table if not exists recursos (
  id             bigint generated always as identity primary key,
  nombre         text not null check (length(btrim(nombre)) > 0),
  categoria      text not null references categorias(nombre) on update cascade,
  descripcion    text,
  estado         text not null default 'disponible'
                   check (estado in ('disponible','averiado','retirado')),
  propietario_id bigint not null references usuarios(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists recursos_categoria_idx   on recursos (categoria);
create index if not exists recursos_propietario_idx on recursos (propietario_id);

create table if not exists solicitudes (
  id                   bigint generated always as identity primary key,
  recurso_id           bigint not null references recursos(id),
  solicitante_id       bigint not null references usuarios(id),
  inicio               date not null,
  fin                  date not null,
  estado               text not null default 'pendiente'
                         check (estado in ('pendiente','confirmada','rechazada',
                                           'devuelta','en_espera_mantenimiento')),
  estado_previo        text check (estado_previo in ('pendiente','confirmada')),
  decidida_por         bigint references usuarios(id),
  decidida_en          timestamptz,
  devuelta_por         bigint references usuarios(id),
  fecha_devolucion_real date,
  creado_en            timestamptz not null default now(),
  rango                daterange generated always as (daterange(inicio, fin, '[]')) stored,

  constraint solicitudes_fechas_validas        -- R2
    check (fin >= inicio),
  constraint solicitudes_devolucion_coherente  -- R4
    check ((estado = 'devuelta') = (fecha_devolucion_real is not null)),
  constraint solicitudes_mantenimiento_coherente -- HU-11
    check ((estado = 'en_espera_mantenimiento') = (estado_previo is not null)),
  constraint solicitudes_sin_superposicion     -- R1
    exclude using gist (recurso_id with =, rango with &&)
    where (estado = 'confirmada')
);
create index if not exists solicitudes_recurso_estado_idx on solicitudes (recurso_id, estado);
create index if not exists solicitudes_solicitante_idx    on solicitudes (solicitante_id);

create table if not exists lista_espera (            -- HU-07
  id             bigint generated always as identity primary key,
  recurso_id     bigint not null references recursos(id),
  solicitante_id bigint not null references usuarios(id),
  inicio         date not null,
  fin            date not null,
  estado         text not null default 'en_espera'
                   check (estado in ('en_espera','promovida','cancelada')),
  solicitud_id   bigint references solicitudes(id),
  creado_en      timestamptz not null default now(),
  constraint lista_espera_fechas_validas check (fin >= inicio),
  constraint lista_espera_promovida_coherente
    check ((estado = 'promovida') = (solicitud_id is not null))
);
create unique index if not exists lista_espera_unica_idx
  on lista_espera (recurso_id, solicitante_id, inicio, fin) where estado = 'en_espera';
create index if not exists lista_espera_cola_idx
  on lista_espera (recurso_id, estado, creado_en);

create table if not exists averias (                  -- HU-06
  id            bigint generated always as identity primary key,
  recurso_id    bigint not null references recursos(id),
  reportada_por bigint not null references usuarios(id),
  descripcion   text not null check (length(btrim(descripcion)) > 0),
  reportada_en  timestamptz not null default now()
);
create index if not exists averias_recurso_idx on averias (recurso_id);

create table if not exists ordenes_reparacion (       -- HU-08
  id             bigint generated always as identity primary key,
  averia_id      bigint not null unique references averias(id),
  estado         text not null default 'abierta'
                   check (estado in ('abierta','en_reparacion','resuelta')),
  creada_por     bigint not null references usuarios(id),
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create table if not exists historial_orden (          -- HU-08 (d)
  id              bigint generated always as identity primary key,
  orden_id        bigint not null references ordenes_reparacion(id),
  estado_anterior text,
  estado_nuevo    text not null,
  cambiado_por    bigint not null references usuarios(id),
  cambiado_en     timestamptz not null default now()
);
create index if not exists historial_orden_orden_idx on historial_orden (orden_id, cambiado_en);

comment on table solicitudes is 'Una solicitud confirmada ES el préstamo. La disponibilidad se calcula, no se guarda.';
comment on constraint solicitudes_sin_superposicion on solicitudes is 'R1: sin préstamos confirmados superpuestos (refuerza ADR-01 en la base de datos).';

-- ---------------------------------------------------------------------
-- Identidad del actor
-- La API (o Supabase Auth) indica quién actúa. En PostgreSQL puro, la API
-- hace:  select set_config('app.actor', '<usuarios.id>', true);  dentro de
-- la transacción. El adaptador de Supabase redefine app_actor() con auth.uid().
-- ---------------------------------------------------------------------
-- Solo se crea si no existe: así, volver a ejecutar este archivo en Supabase
-- NO pisa la versión con auth.uid() que instala 02_supabase_adapter.sql.
do $do$
begin
  if not exists (select 1 from pg_proc
                  where proname = 'app_actor' and pronamespace = 'public'::regnamespace) then
    execute $f$
      create function app_actor() returns bigint
      language sql stable as $b$
        select nullif(current_setting('app.actor', true), '')::bigint
      $b$ $f$;
  end if;
end $do$;

create or replace function app_rol() returns text
language sql stable security definer set search_path = public as $$
  select u.rol from public.usuarios u where u.id = app_actor()
$$;

create or replace function es_coordinador() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select u.rol = 'coordinador' from public.usuarios u where u.id = app_actor()), false)
$$;

create or replace function exigir_actor() returns bigint
language plpgsql stable security definer set search_path = public as $$
declare a bigint := app_actor();
begin
  if a is null then
    raise exception 'Se requiere un usuario autenticado' using errcode = '42501';
  end if;
  return a;
end $$;

-- ---------------------------------------------------------------------
-- Triggers (reglas que se cumplen sin importar desde dónde se escriba)
-- ---------------------------------------------------------------------
create or replace function trg_touch_actualizado() returns trigger
language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;
drop trigger if exists recursos_touch on recursos;
create trigger recursos_touch before update on recursos
  for each row execute function trg_touch_actualizado();

-- HU-03: validaciones al crear una solicitud (R2, averiado, retirado)
create or replace function trg_solicitud_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r recursos;
begin
  if new.fin < new.inicio then                                   -- R2
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '23514';
  end if;
  select * into r from recursos where id = new.recurso_id;
  if not found then
    raise exception 'El recurso % no existe', new.recurso_id using errcode = 'P0002';
  end if;
  if r.estado = 'averiado' then
    raise exception 'El recurso está averiado y no se puede solicitar' using errcode = '23514';
  end if;
  if r.estado = 'retirado' then
    raise exception 'El recurso está retirado por mantenimiento y no acepta solicitudes' using errcode = '23514';
  end if;
  if new.estado <> 'pendiente' then
    raise exception 'Toda solicitud nace en estado pendiente' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists solicitudes_insert on solicitudes;
create trigger solicitudes_insert before insert on solicitudes
  for each row execute function trg_solicitud_insert();

-- Máquina de estados de la solicitud (diagrama de estados del portafolio)
create or replace function trg_solicitud_transicion() returns trigger
language plpgsql as $$
begin
  if new.recurso_id <> old.recurso_id or new.solicitante_id <> old.solicitante_id
     or new.inicio <> old.inicio or new.fin <> old.fin then
    raise exception 'No se pueden cambiar el recurso, el solicitante ni las fechas de una solicitud'
      using errcode = '23514';
  end if;
  if new.estado is distinct from old.estado then
    if not (
         (old.estado = 'pendiente'  and new.estado in ('confirmada','rechazada','en_espera_mantenimiento'))
      or (old.estado = 'confirmada' and new.estado in ('devuelta','en_espera_mantenimiento'))
      or (old.estado = 'en_espera_mantenimiento' and new.estado = old.estado_previo)
    ) then
      raise exception 'Transición no permitida: % → %', old.estado, new.estado using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists solicitudes_transicion on solicitudes;
create trigger solicitudes_transicion before update on solicitudes
  for each row execute function trg_solicitud_transicion();

-- HU-08: la orden solo avanza abierta → en_reparacion → resuelta
create or replace function trg_orden_validar() returns trigger
language plpgsql as $$
begin
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'abierta' and new.estado = 'en_reparacion')
         or (old.estado = 'en_reparacion' and new.estado = 'resuelta')) then
      raise exception 'Transición no permitida: % → %', old.estado, new.estado using errcode = '23514';
    end if;
    new.actualizada_en := now();
  end if;
  return new;
end $$;
drop trigger if exists ordenes_validar on ordenes_reparacion;
create trigger ordenes_validar before update of estado on ordenes_reparacion
  for each row execute function trg_orden_validar();

-- HU-08 (c) y (d): historial con fecha y responsable; al resolver, el recurso vuelve a estar disponible
create or replace function trg_orden_historial() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor bigint := app_actor();
begin
  if actor is null then
    raise exception 'Se requiere un usuario para registrar el cambio de estado' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    insert into historial_orden(orden_id, estado_anterior, estado_nuevo, cambiado_por)
    values (new.id, null, new.estado, actor);
  elsif new.estado is distinct from old.estado then
    insert into historial_orden(orden_id, estado_anterior, estado_nuevo, cambiado_por)
    values (new.id, old.estado, new.estado, actor);
    if new.estado = 'resuelta' then
      update recursos set estado = 'disponible'
       where id = (select a.recurso_id from averias a where a.id = new.averia_id)
         and estado = 'averiado';
    end if;
  end if;
  return null;
end $$;
drop trigger if exists ordenes_historial on ordenes_reparacion;
create trigger ordenes_historial after insert or update of estado on ordenes_reparacion
  for each row execute function trg_orden_historial();

create or replace function trg_historial_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'El historial de órdenes no se puede modificar ni borrar' using errcode = '42501';
end $$;
drop trigger if exists historial_inmutable on historial_orden;
create trigger historial_inmutable before update or delete on historial_orden
  for each row execute function trg_historial_inmutable();

-- ---------------------------------------------------------------------
-- Funciones de negocio (todas con mensajes comprensibles: RNF-02)
-- ---------------------------------------------------------------------

-- HU-02: disponibilidad calculada (Recurso.estaDisponible)
create or replace function recurso_esta_disponible(p_recurso bigint, p_inicio date, p_fin date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from recursos r where r.id = p_recurso and r.estado = 'disponible')
     and not exists (select 1 from solicitudes s
                      where s.recurso_id = p_recurso and s.estado = 'confirmada'
                        and s.rango && daterange(p_inicio, p_fin, '[]'))
$$;

-- HU-02 (+HU-06, HU-11): catálogo filtrado por categoría y fechas.
-- Excluye averiados y retirados, y los que tienen préstamo confirmado en el rango.
create or replace function buscar_recursos(p_categoria text default null,
                                           p_desde date default null,
                                           p_hasta date default null)
returns setof recursos language plpgsql stable security definer set search_path = public as $$
begin
  if (p_desde is null) <> (p_hasta is null) then
    raise exception 'Indique ambas fechas (desde y hasta)' using errcode = '22023';
  end if;
  if p_desde is not null and p_hasta < p_desde then
    raise exception 'La fecha final no puede ser anterior a la inicial' using errcode = '22023';
  end if;
  return query
    select r.* from recursos r
     where r.estado = 'disponible'
       and (p_categoria is null or r.categoria = p_categoria)
       and (p_desde is null or not exists (
              select 1 from solicitudes s
               where s.recurso_id = r.id and s.estado = 'confirmada'
                 and s.rango && daterange(p_desde, p_hasta, '[]')))
     order by r.nombre;
end $$;

-- HU-04: aprobar (R1 y R3). Bloquea la fila del recurso para serializar
-- aprobaciones simultáneas (consecuencia señalada en el ADR-01).
create or replace function aprobar_solicitud(p_solicitud bigint) returns solicitudes
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); s solicitudes; r recursos;
begin
  select * into s from solicitudes where id = p_solicitud for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud using errcode = 'P0002';
  end if;
  select * into r from recursos where id = s.recurso_id for update;
  if not (r.propietario_id = actor or es_coordinador()) then          -- R3
    raise exception 'Solo el propietario o el coordinador pueden aprobar una solicitud'
      using errcode = '42501';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Solo se puede aprobar una solicitud pendiente (estado actual: %)', s.estado
      using errcode = '23514';
  end if;
  if r.estado = 'averiado' then
    raise exception 'El recurso está averiado y no se puede aprobar' using errcode = '23514';
  end if;
  if r.estado = 'retirado' then
    raise exception 'El recurso está retirado por mantenimiento y no se puede aprobar' using errcode = '23514';
  end if;
  if exists (select 1 from solicitudes o
              where o.recurso_id = s.recurso_id and o.estado = 'confirmada'
                and o.id <> s.id and o.rango && s.rango) then          -- R1
    raise exception 'La solicitud se superpone con un préstamo confirmado' using errcode = '23P01';
  end if;
  update solicitudes set estado = 'confirmada', decidida_por = actor, decidida_en = now()
   where id = s.id returning * into s;
  return s;
end $$;

create or replace function rechazar_solicitud(p_solicitud bigint) returns solicitudes
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); s solicitudes; r recursos;
begin
  select * into s from solicitudes where id = p_solicitud for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud using errcode = 'P0002';
  end if;
  select * into r from recursos where id = s.recurso_id;
  if not (r.propietario_id = actor or es_coordinador()) then          -- R3
    raise exception 'Solo el propietario o el coordinador pueden rechazar una solicitud'
      using errcode = '42501';
  end if;
  if s.estado <> 'pendiente' then
    raise exception 'Solo se puede rechazar una solicitud pendiente (estado actual: %)', s.estado
      using errcode = '23514';
  end if;
  update solicitudes set estado = 'rechazada', decidida_por = actor, decidida_en = now()
   where id = s.id returning * into s;
  return s;
end $$;

-- HU-07 (b): al liberarse, el primero de la lista pasa a "pendiente" (no se aprueba solo)
create or replace function promover_lista_espera(p_recurso bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare e lista_espera; nueva bigint;
begin
  if (select estado from recursos where id = p_recurso) is distinct from 'disponible' then
    return null;
  end if;
  select le.* into e from lista_espera le
   where le.recurso_id = p_recurso and le.estado = 'en_espera'
     and not exists (select 1 from solicitudes c
                      where c.recurso_id = le.recurso_id and c.estado = 'confirmada'
                        and c.rango && daterange(le.inicio, le.fin, '[]'))
   order by le.creado_en, le.id
   limit 1 for update skip locked;
  if not found then return null; end if;
  insert into solicitudes(recurso_id, solicitante_id, inicio, fin)
  values (e.recurso_id, e.solicitante_id, e.inicio, e.fin) returning id into nueva;
  update lista_espera set estado = 'promovida', solicitud_id = nueva where id = e.id;
  return nueva;
end $$;

-- HU-05: devolución (R4). Libera el recurso, guarda la fecha real y promueve la lista de espera.
create or replace function registrar_devolucion(p_solicitud bigint, p_fecha date default current_date)
returns solicitudes
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); s solicitudes;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede registrar la devolución' using errcode = '42501';
  end if;
  select * into s from solicitudes where id = p_solicitud for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud using errcode = 'P0002';
  end if;
  if s.estado <> 'confirmada' then
    raise exception 'Solo se puede devolver un préstamo confirmado (estado actual: %)', s.estado
      using errcode = '23514';
  end if;
  update solicitudes
     set estado = 'devuelta', fecha_devolucion_real = coalesce(p_fecha, current_date), devuelta_por = actor
   where id = s.id returning * into s;
  perform promover_lista_espera(s.recurso_id);
  return s;
end $$;

-- HU-07 (a): anotarse solo si el recurso está ocupado en esas fechas
create or replace function anotar_en_lista_espera(p_recurso bigint, p_inicio date, p_fin date)
returns lista_espera
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); r recursos; e lista_espera;
begin
  if p_inicio is null or p_fin is null then
    raise exception 'Indique la fecha de inicio y la de fin' using errcode = '22023';
  end if;
  if p_fin < p_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '23514';
  end if;
  select * into r from recursos where id = p_recurso;
  if not found then
    raise exception 'El recurso % no existe', p_recurso using errcode = 'P0002';
  end if;
  if r.estado <> 'disponible' then
    raise exception 'El recurso no está disponible (estado: %)', r.estado using errcode = '23514';
  end if;
  if not exists (select 1 from solicitudes s
                  where s.recurso_id = p_recurso and s.estado = 'confirmada'
                    and s.rango && daterange(p_inicio, p_fin, '[]')) then
    raise exception 'El recurso está libre en esas fechas: solicítelo directamente' using errcode = '23514';
  end if;
  insert into lista_espera(recurso_id, solicitante_id, inicio, fin)
  values (p_recurso, actor, p_inicio, p_fin) returning * into e;
  return e;
end $$;

-- HU-06: reportar avería (el recurso pasa a "averiado")
create or replace function reportar_averia(p_recurso bigint, p_descripcion text) returns averias
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); r recursos; a averias;
begin
  if p_descripcion is null or length(btrim(p_descripcion)) = 0 then
    raise exception 'Describa la avería' using errcode = '23514';
  end if;
  select * into r from recursos where id = p_recurso for update;
  if not found then
    raise exception 'El recurso % no existe', p_recurso using errcode = 'P0002';
  end if;
  if r.estado = 'averiado' then
    raise exception 'El recurso ya está reportado como averiado' using errcode = '23514';
  end if;
  if r.estado = 'retirado' then
    raise exception 'El recurso está retirado por mantenimiento' using errcode = '23514';
  end if;
  update recursos set estado = 'averiado' where id = p_recurso;
  insert into averias(recurso_id, reportada_por, descripcion)
  values (p_recurso, actor, btrim(p_descripcion)) returning * into a;
  return a;
end $$;

-- HU-08 (a): la orden nace "abierta" desde una avería (solo coordinador: RNF-03)
create or replace function abrir_orden_reparacion(p_averia bigint) returns ordenes_reparacion
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); o ordenes_reparacion;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede abrir órdenes de reparación' using errcode = '42501';
  end if;
  if not exists (select 1 from averias where id = p_averia) then
    raise exception 'La avería % no existe', p_averia using errcode = 'P0002';
  end if;
  insert into ordenes_reparacion(averia_id, creada_por) values (p_averia, actor) returning * into o;
  return o;
end $$;

-- HU-08 (b): avanzar el estado (el trigger impide saltar estados)
create or replace function avanzar_orden(p_orden bigint, p_nuevo text) returns ordenes_reparacion
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); o ordenes_reparacion;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede cambiar el estado de una orden' using errcode = '42501';
  end if;
  update ordenes_reparacion set estado = p_nuevo where id = p_orden returning * into o;
  if not found then
    raise exception 'La orden % no existe', p_orden using errcode = 'P0002';
  end if;
  return o;
end $$;

-- HU-11: retirar por mantenimiento sin perder solicitudes
create or replace function retirar_recurso(p_recurso bigint) returns recursos
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); r recursos;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede retirar un recurso por mantenimiento' using errcode = '42501';
  end if;
  select * into r from recursos where id = p_recurso for update;
  if not found then
    raise exception 'El recurso % no existe', p_recurso using errcode = 'P0002';
  end if;
  if r.estado <> 'disponible' then
    raise exception 'Solo se puede retirar un recurso disponible (estado actual: %)', r.estado
      using errcode = '23514';
  end if;
  update recursos set estado = 'retirado' where id = p_recurso returning * into r;
  update solicitudes set estado_previo = estado, estado = 'en_espera_mantenimiento'
   where recurso_id = p_recurso and estado in ('pendiente','confirmada');
  return r;
end $$;

create or replace function reincorporar_recurso(p_recurso bigint) returns recursos
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); r recursos;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede reincorporar un recurso' using errcode = '42501';
  end if;
  select * into r from recursos where id = p_recurso for update;
  if not found then
    raise exception 'El recurso % no existe', p_recurso using errcode = 'P0002';
  end if;
  if r.estado <> 'retirado' then
    raise exception 'El recurso no está retirado (estado actual: %)', r.estado using errcode = '23514';
  end if;
  update recursos set estado = 'disponible' where id = p_recurso returning * into r;
  update solicitudes set estado = estado_previo, estado_previo = null
   where recurso_id = p_recurso and estado = 'en_espera_mantenimiento';
  return r;
end $$;

-- Administración de roles (solo coordinador)
create or replace function asignar_rol(p_usuario bigint, p_rol text) returns usuarios
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); u usuarios;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede asignar roles' using errcode = '42501';
  end if;
  update usuarios set rol = p_rol where id = p_usuario returning * into u;
  if not found then
    raise exception 'El usuario % no existe', p_usuario using errcode = 'P0002';
  end if;
  return u;
end $$;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------
create or replace view v_catalogo as
select r.id, r.nombre, r.categoria, r.descripcion, r.propietario_id, r.estado,
       case when r.estado <> 'disponible' then r.estado
            when exists (select 1 from solicitudes s
                          where s.recurso_id = r.id and s.estado = 'confirmada'
                            and s.rango @> current_date) then 'prestado'
            else 'disponible' end as estado_actual
  from recursos r;

-- HU-10: sin datos devuelve ceros, no falla
create or replace view v_panel_impacto as
select (select count(*) from solicitudes where estado = 'devuelta')            as prestamos_completados,
       (select count(*) from ordenes_reparacion where estado = 'resuelta')     as reparaciones_resueltas,
       (select count(distinct recurso_id) from solicitudes where estado = 'devuelta') as recursos_reutilizados;

create or replace view v_usuarios_publicos as
select id, nombre, rol from usuarios;
