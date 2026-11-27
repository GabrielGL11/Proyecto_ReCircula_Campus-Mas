-- HU-11: aplicar en instalaciones existentes antes de habilitar la API.
begin;

create or replace function trg_solicitud_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r recursos;
begin
  if new.fin < new.inicio then                                   -- R2
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '23514';
  end if;
  -- Serializa la creación con el retiro y la reincorporación.
  select * into r from recursos where id = new.recurso_id for share;
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

create or replace function aprobar_solicitud(p_solicitud bigint) returns solicitudes
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); s solicitudes; r recursos;
begin
  -- El mantenimiento bloquea primero el recurso y luego sus solicitudes.
  select * into r from recursos
   where id = (select recurso_id from solicitudes where id = p_solicitud) for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud using errcode = 'P0002';
  end if;
  select * into s from solicitudes where id = p_solicitud for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud using errcode = 'P0002';
  end if;
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

create or replace function registrar_devolucion(p_solicitud bigint, p_fecha date default current_date)
returns solicitudes
language plpgsql security definer set search_path = public as $$
declare actor bigint := exigir_actor(); s solicitudes;
begin
  if not es_coordinador() then
    raise exception 'Solo el coordinador puede registrar la devolución' using errcode = '42501';
  end if;
  -- Mantiene el orden de bloqueos al promover una entrada de lista de espera.
  perform 1 from recursos
   where id = (select recurso_id from solicitudes where id = p_solicitud) for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud using errcode = 'P0002';
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

create or replace function promover_lista_espera(p_recurso bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare e lista_espera; nueva bigint;
begin
  if (select estado from recursos where id = p_recurso for share) is distinct from 'disponible' then
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
  select * into r from recursos where id = p_recurso for share;
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
  update recursos set estado = 'retirado' where id = p_recurso returning * into r;
  update solicitudes set estado_previo = estado, estado = 'en_espera_mantenimiento'
   where recurso_id = p_recurso and estado in ('pendiente','confirmada');
  return r;
end $$;

commit;
