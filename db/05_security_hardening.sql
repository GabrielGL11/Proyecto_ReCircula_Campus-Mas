-- =====================================================================
-- ReCircula Campus · 05_security_hardening.sql
-- Migración incremental para una base Supabase YA EXISTENTE.
-- Ejecutar una sola vez (es idempotente) desde Supabase > SQL Editor.
-- No elimina tablas, registros, triggers ni reglas de negocio.
-- =====================================================================

begin;

-- 1) Las vistas se ejecutan con los permisos/RLS del usuario que consulta.
--    Esto evita que una vista SECURITY DEFINER omita accidentalmente RLS.
alter view public.v_catalogo set (security_invoker = true);
alter view public.v_panel_impacto set (security_invoker = true);
alter view public.v_usuarios_publicos set (security_invoker = true);

-- 2) Fijar search_path de las funciones señaladas por Security Advisor.
--    Se conserva exactamente su lógica y sus triggers asociados.
alter function public.trg_touch_actualizado() set search_path = public, pg_temp;
alter function public.trg_solicitud_transicion() set search_path = public, pg_temp;
alter function public.trg_orden_validar() set search_path = public, pg_temp;

-- 3) Evitar la evaluación de auth.uid() por cada fila en la política RLS.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select
on public.usuarios
for select
to authenticated
using (auth_id = (select auth.uid()) or public.es_coordinador());

-- 4) btree_gist: moverla a extensions solo si PostgreSQL confirma que es
--    reubicable. Se crea el esquema si falta. No se desinstala la extensión.
do $migration$
declare
  v_schema text;
  v_relocatable boolean;
begin
  select n.nspname, e.extrelocatable
    into v_schema, v_relocatable
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'btree_gist';

  if v_schema = 'public' and v_relocatable then
    execute 'create schema if not exists extensions';
    execute 'alter extension btree_gist set schema extensions';
  elsif v_schema = 'public' and not v_relocatable then
    raise notice 'btree_gist no es reubicable; se conserva en public para no afectar dependencias.';
  elsif v_schema is null then
    raise notice 'No se encontró btree_gist; verificar la instalación antes de continuar.';
  else
    raise notice 'btree_gist ya está en el esquema %.', v_schema;
  end if;
end
$migration$;

commit;

-- Verificación posterior (ejecutar después de la migración):
-- SELECT schemaname, viewname, definition FROM pg_views
-- WHERE schemaname = 'public'
--   AND viewname IN ('v_catalogo','v_panel_impacto','v_usuarios_publicos');
-- SELECT p.proname, p.proconfig
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('trg_touch_actualizado','trg_solicitud_transicion','trg_orden_validar');
-- SELECT e.extname, n.nspname AS esquema
-- FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
-- WHERE e.extname = 'btree_gist';
