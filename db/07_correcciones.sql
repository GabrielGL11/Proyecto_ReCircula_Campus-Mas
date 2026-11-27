-- =====================================================================
-- ReCircula Campus · 07_correcciones.sql
-- Para instalaciones que YA ejecutaron 01 a 06 (el esquema 01_schema.sql ya incluye
-- estos cambios para instalaciones nuevas). Se puede ejecutar más de una vez.
--
-- 1. HU-11: un recurso AVERIADO ya no se puede retirar por mantenimiento. Antes, al
--    retirarlo y reincorporarlo quedaba "disponible" sin haberse reparado, y su avería
--    se quedaba para siempre en "Averías por atender".
-- 2. HU-07: al resolver una orden de reparación o reincorporar un recurso, se promueve
--    la lista de espera. Antes, si el préstamo se devolvía mientras el recurso estaba
--    averiado, la persona en lista de espera nunca pasaba a "pendiente".
-- =====================================================================
begin;

create or replace function trg_orden_historial() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor bigint := app_actor(); v_recurso bigint;
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
      select a.recurso_id into v_recurso from averias a where a.id = new.averia_id;
      update recursos set estado = 'disponible'
       where id = v_recurso and estado = 'averiado';
      -- Si el recurso se devolvió mientras estaba averiado, la lista de espera quedó sin promover.
      perform promover_lista_espera(v_recurso);
    end if;
  end if;
  return null;
end $$;

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
  if r.estado = 'retirado' then
    raise exception 'El recurso ya está retirado por mantenimiento' using errcode = '23514';
  end if;
  if r.estado = 'averiado' then
    raise exception 'El recurso está averiado: resuelva su orden de reparación antes de retirarlo por mantenimiento'
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
  perform promover_lista_espera(p_recurso);
  return r;
end $$;

commit;
