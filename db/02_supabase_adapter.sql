-- =====================================================================
-- ReCircula Campus · 02_supabase_adapter.sql   (BASE DE DATOS PRINCIPAL)
-- Ejecutar DESPUÉS de 01_schema.sql, en Supabase → SQL Editor.
-- Vincula usuarios con Supabase Auth, activa RLS y limita permisos.
-- Se puede volver a ejecutar sin romper nada.
-- =====================================================================

-- 1) Vínculo con Supabase Auth ----------------------------------------
alter table usuarios drop constraint if exists usuarios_auth_fk;
alter table usuarios add constraint usuarios_auth_fk
  foreign key (auth_id) references auth.users(id) on delete set null;

-- app_actor() ahora sale del JWT (auth.uid()); si no hay sesión (por ejemplo,
-- en el SQL Editor o en las pruebas) usa el valor de app.actor.
create or replace function app_actor() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select u.id from public.usuarios u where u.auth_id = auth.uid()),
    nullif(current_setting('app.actor', true), '')::bigint
  )
$$;

-- Al registrarse alguien en Supabase Auth se crea (o se vincula por correo) su fila en usuarios.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (auth_id, nombre, correo, rol)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), split_part(new.email, '@', 1)),
          lower(new.email),
          'solicitante')
  on conflict (correo) do update set auth_id = excluded.auth_id
    where public.usuarios.auth_id is null;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 2) Row Level Security -----------------------------------------------
alter table categorias         enable row level security;
alter table usuarios           enable row level security;
alter table recursos           enable row level security;
alter table solicitudes        enable row level security;
alter table lista_espera       enable row level security;
alter table averias            enable row level security;
alter table ordenes_reparacion enable row level security;
alter table historial_orden    enable row level security;

-- categorias: lectura pública, administración del coordinador
drop policy if exists categorias_select on categorias;
create policy categorias_select on categorias for select to anon, authenticated using (true);
drop policy if exists categorias_admin on categorias;
create policy categorias_admin on categorias for all to authenticated
  using (es_coordinador()) with check (es_coordinador());

-- usuarios: cada quien ve su fila; el coordinador ve todas (nombres: vista v_usuarios_publicos)
drop policy if exists usuarios_select on usuarios;
create policy usuarios_select on usuarios for select to authenticated
  using (auth_id = (select auth.uid()) or es_coordinador());

-- recursos: catálogo visible; publica el propietario (o el coordinador); edita solo el propietario (HU-09 b)
drop policy if exists recursos_select on recursos;
create policy recursos_select on recursos for select to authenticated using (true);
drop policy if exists recursos_insert on recursos;
create policy recursos_insert on recursos for insert to authenticated
  with check (propietario_id = app_actor() and app_rol() in ('propietario','coordinador'));
drop policy if exists recursos_update on recursos;
create policy recursos_update on recursos for update to authenticated
  using (propietario_id = app_actor()) with check (propietario_id = app_actor());

-- solicitudes: ve la suya, las de sus recursos o todas si es coordinador; crea solo a su nombre.
-- Aprobar/rechazar/devolver se hace con funciones (no con UPDATE directo).
drop policy if exists solicitudes_select on solicitudes;
create policy solicitudes_select on solicitudes for select to authenticated
  using (solicitante_id = app_actor()
         or es_coordinador()
         or exists (select 1 from recursos r where r.id = recurso_id and r.propietario_id = app_actor()));
drop policy if exists solicitudes_insert on solicitudes;
create policy solicitudes_insert on solicitudes for insert to authenticated
  with check (solicitante_id = app_actor() and estado = 'pendiente');

-- lista_espera: ve la propia, la de sus recursos o todas si es coordinador
drop policy if exists lista_espera_select on lista_espera;
create policy lista_espera_select on lista_espera for select to authenticated
  using (solicitante_id = app_actor()
         or es_coordinador()
         or exists (select 1 from recursos r where r.id = recurso_id and r.propietario_id = app_actor()));

-- averias: ve las que reportó, las de sus recursos o todas si es coordinador
drop policy if exists averias_select on averias;
create policy averias_select on averias for select to authenticated
  using (reportada_por = app_actor()
         or es_coordinador()
         or exists (select 1 from recursos r where r.id = recurso_id and r.propietario_id = app_actor()));

-- ordenes_reparacion e historial: coordinador, o quien reportó la avería / dueño del recurso
drop policy if exists ordenes_select on ordenes_reparacion;
create policy ordenes_select on ordenes_reparacion for select to authenticated
  using (es_coordinador()
         or exists (select 1 from averias a join recursos r on r.id = a.recurso_id
                     where a.id = averia_id
                       and (a.reportada_por = app_actor() or r.propietario_id = app_actor())));
drop policy if exists historial_select on historial_orden;
create policy historial_select on historial_orden for select to authenticated
  using (es_coordinador()
         or exists (select 1 from ordenes_reparacion o
                      join averias a on a.id = o.averia_id
                      join recursos r on r.id = a.recurso_id
                     where o.id = orden_id
                       and (a.reportada_por = app_actor() or r.propietario_id = app_actor())));

-- 3) Permisos mínimos -------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

grant select on categorias to anon, authenticated;
grant insert, update, delete on categorias to authenticated;            -- filtrado por RLS (coordinador)
grant select on usuarios, recursos, solicitudes, lista_espera, averias,
                ordenes_reparacion, historial_orden to authenticated;
grant insert on recursos, solicitudes to authenticated;
grant update (nombre, descripcion, categoria) on recursos to authenticated;  -- el estado solo cambia por funciones
grant usage, select on all sequences in schema public to authenticated;
grant select on v_catalogo, v_panel_impacto, v_usuarios_publicos to authenticated;

-- Funciones: solo usuarios autenticados ejecutan las de la API; las internas quedan cerradas.
revoke execute on function
  app_actor(), app_rol(), es_coordinador(), exigir_actor(),
  recurso_esta_disponible(bigint, date, date),
  buscar_recursos(text, date, date),
  aprobar_solicitud(bigint),
  rechazar_solicitud(bigint),
  registrar_devolucion(bigint, date),
  promover_lista_espera(bigint),
  anotar_en_lista_espera(bigint, date, date),
  reportar_averia(bigint, text),
  abrir_orden_reparacion(bigint),
  avanzar_orden(bigint, text),
  retirar_recurso(bigint),
  reincorporar_recurso(bigint),
  asignar_rol(bigint, text)
from public, anon, authenticated;
grant execute on function
  app_actor(), app_rol(), es_coordinador(),
  recurso_esta_disponible(bigint, date, date),
  buscar_recursos(text, date, date),
  aprobar_solicitud(bigint),
  rechazar_solicitud(bigint),
  registrar_devolucion(bigint, date),
  anotar_en_lista_espera(bigint, date, date),
  reportar_averia(bigint, text),
  abrir_orden_reparacion(bigint),
  avanzar_orden(bigint, text),
  retirar_recurso(bigint),
  reincorporar_recurso(bigint),
  asignar_rol(bigint, text)
to authenticated;
-- Si creas funciones nuevas en public, aplícales el mismo REVOKE/GRANT.

-- Primer coordinador (hazlo una sola vez, con tu correo ya registrado en Authentication):
--   update usuarios set rol = 'coordinador' where correo = 'tu-correo@ejemplo.com';
