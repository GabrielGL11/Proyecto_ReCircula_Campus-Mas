-- =====================================================================
-- ReCircula Campus · 04_tests.sql  (versión sin sesión: funciona en el SQL Editor de Supabase)
-- Pruebas de las reglas de la base de datos. No usa tablas ni funciones
-- temporales: todo ocurre dentro de UNA función que al final deshace sus
-- propios datos (subtransacción). No deja datos de prueba y se puede ejecutar
-- cuantas veces quieras, incluso después del seed.
-- Resultado esperado: una fila "Todas las pruebas de la base de datos pasaron".
-- Si una prueba falla, el error empieza con "PRUEBA FALLIDA" o "assertion".
-- =====================================================================

-- Ayuda: ejecuta una sentencia que DEBE fallar con un mensaje (y código opcional)
create or replace function recircula_espera_error(p_sql text, p_fragmento text, p_sqlstate text default null)
returns void language plpgsql as $$
declare ejecuto boolean := false;
begin
  begin
    execute p_sql;
    ejecuto := true;
  exception when others then
    if sqlerrm not ilike '%' || p_fragmento || '%' then
      raise exception 'PRUEBA FALLIDA: mensaje distinto (esperado "%", obtenido "%")', p_fragmento, sqlerrm;
    end if;
    if p_sqlstate is not null and sqlstate <> p_sqlstate then
      raise exception 'PRUEBA FALLIDA: código distinto (esperado %, obtenido %)', p_sqlstate, sqlstate;
    end if;
    return;
  end;
  if ejecuto then
    raise exception 'PRUEBA FALLIDA: se esperaba un error con "%" pero la sentencia tuvo éxito', p_fragmento;
  end if;
end $$;

create or replace function recircula_run_tests() returns text
language plpgsql as $fn$
declare
  coord bigint; owner_ bigint; sol1 bigint; sol2 bigint;
  r1 bigint; r2 bigint; r3 bigint;
  a bigint; b bigint; p bigint; av bigint; o bigint; w bigint; nueva bigint; p1 bigint; p2 bigint;
  v record;
begin
  begin  -- subtransacción: al final se deshace todo
    -- ---------- Datos de prueba ----------
    insert into categorias(nombre) values ('calculadora') on conflict do nothing;
    insert into usuarios(nombre, correo, rol) values ('TEST Coordinador', 'test.coord@recircula.test', 'coordinador') returning id into coord;
    insert into usuarios(nombre, correo, rol) values ('TEST Propietario', 'test.owner@recircula.test', 'propietario') returning id into owner_;
    insert into usuarios(nombre, correo, rol) values ('TEST Solicitante 1', 'test.sol1@recircula.test', 'solicitante') returning id into sol1;
    insert into usuarios(nombre, correo, rol) values ('TEST Solicitante 2', 'test.sol2@recircula.test', 'solicitante') returning id into sol2;
    insert into recursos(nombre, categoria, propietario_id) values ('TEST Calculadora A', 'calculadora', owner_) returning id into r1;
    insert into recursos(nombre, categoria, propietario_id) values ('TEST Calculadora B', 'calculadora', owner_) returning id into r2;
    insert into recursos(nombre, categoria, propietario_id) values ('TEST Calculadora C', 'calculadora', owner_) returning id into r3;

    -- ---------- HU-01 (b) y R2 ----------
    perform set_config('app.actor', owner_::text, true);
    perform recircula_espera_error(format($q$insert into recursos(nombre, categoria, propietario_id) values ('   ', 'calculadora', %s)$q$, owner_), 'check');
    perform recircula_espera_error(format($q$insert into recursos(nombre, categoria, propietario_id) values ('X', 'no-existe', %s)$q$, owner_), 'foreign key');
    perform recircula_espera_error(format($q$insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (%s, %s, '2027-01-10', '2027-01-05')$q$, r1, sol1), 'anterior');
    raise notice 'OK  HU-01(b) y R2: datos inválidos se rechazan';

    -- ---------- HU-03 (a), R3, R1, HU-04 ----------
    perform set_config('app.actor', sol1::text, true);
    insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (r1, sol1, '2027-02-01', '2027-02-05') returning id into a;
    perform set_config('app.actor', sol2::text, true);
    insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (r1, sol2, '2027-02-04', '2027-02-08') returning id into b;
    assert (select estado from solicitudes where id = a) = 'pendiente', 'HU-03(a): la solicitud debe nacer pendiente';
    perform recircula_espera_error(format('select aprobar_solicitud(%s)', a), 'Solo el propietario o el coordinador', '42501');
    perform set_config('app.actor', owner_::text, true);
    perform aprobar_solicitud(a);
    assert (select estado from solicitudes where id = a) = 'confirmada', 'HU-04(a): debe quedar confirmada';
    perform recircula_espera_error(format('select aprobar_solicitud(%s)', b), 'superpone', '23P01');
    assert (select estado from solicitudes where id = b) = 'pendiente', 'R1: la solicitud B debe seguir pendiente';
    perform recircula_espera_error(format($q$update solicitudes set estado = 'confirmada' where id = %s$q$, b), 'exclusion');
    raise notice 'OK  HU-03(a), R3, R1, HU-04: sin choques de fechas y solo propietario/coordinador aprueban';

    -- ---------- HU-06: un recurso averiado no se presta ----------
    perform set_config('app.actor', sol1::text, true);
    insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (r2, sol1, '2027-03-01', '2027-03-03') returning id into p;
    perform set_config('app.actor', sol2::text, true);
    select id into av from reportar_averia(r2, 'No enciende');
    assert (select estado from recursos where id = r2) = 'averiado', 'HU-06(a): el recurso debe quedar averiado';
    assert not exists (select 1 from buscar_recursos('calculadora', null, null) where id = r2), 'HU-06(b): no debe aparecer en la búsqueda';
    perform set_config('app.actor', sol1::text, true);
    perform recircula_espera_error(format($q$insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (%s, %s, '2027-03-10', '2027-03-12')$q$, r2, sol1), 'averiado');
    perform set_config('app.actor', owner_::text, true);
    perform recircula_espera_error(format('select aprobar_solicitud(%s)', p), 'averiado');
    raise notice 'OK  HU-06: un recurso averiado no se presta ni se aprueba';

    -- ---------- HU-08: orden de reparación con estados trazables ----------
    perform set_config('app.actor', sol1::text, true);
    perform recircula_espera_error(format('select abrir_orden_reparacion(%s)', av), 'coordinador', '42501');
    perform set_config('app.actor', coord::text, true);
    select id into o from abrir_orden_reparacion(av);
    assert (select estado from ordenes_reparacion where id = o) = 'abierta', 'HU-08(a): la orden nace abierta';
    perform recircula_espera_error(format($q$select avanzar_orden(%s, 'resuelta')$q$, o), 'Transición no permitida');
    perform avanzar_orden(o, 'en_reparacion');
    perform avanzar_orden(o, 'resuelta');
    assert (select count(*) from historial_orden where orden_id = o and cambiado_por = coord) = 3, 'HU-08(d): cada cambio guarda quién y cuándo';
    assert (select estado from recursos where id = r2) = 'disponible', 'HU-08(c): al resolverse, el recurso vuelve a estar disponible';
    perform recircula_espera_error(format($q$delete from historial_orden where orden_id = %s$q$, o), 'no se puede modificar');
    raise notice 'OK  HU-08: transiciones sin saltos, historial y recurso liberado';

    -- ---------- R4, HU-05 y HU-07: devolución, disponibilidad y lista de espera ----------
    perform set_config('app.actor', sol2::text, true);
    select id into w from anotar_en_lista_espera(r1, '2027-02-04', '2027-02-08');
    perform recircula_espera_error(format($q$select anotar_en_lista_espera(%s, '2027-06-01', '2027-06-02')$q$, r1), 'libre');
    perform set_config('app.actor', owner_::text, true);
    perform recircula_espera_error(format('select registrar_devolucion(%s)', a), 'coordinador', '42501');
    perform set_config('app.actor', coord::text, true);
    perform registrar_devolucion(a, '2027-02-03');
    assert (select estado from solicitudes where id = a) = 'devuelta', 'R4: debe quedar devuelta';
    assert (select fecha_devolucion_real from solicitudes where id = a) = date '2027-02-03', 'R4 / HU-05(b): se guarda la fecha real';
    assert exists (select 1 from buscar_recursos(null, '2027-02-01', '2027-02-05') where id = r1), 'HU-05(a): vuelve a estar disponible en la búsqueda';
    select solicitud_id into nueva from lista_espera where id = w;
    assert nueva is not null, 'HU-07(b): el primero de la lista debe pasar a una solicitud';
    assert (select estado from solicitudes where id = nueva) = 'pendiente', 'HU-07(b): queda pendiente, no confirmada';
    assert (select estado from lista_espera where id = w) = 'promovida', 'HU-07(b): la entrada queda promovida';
    raise notice 'OK  R4, HU-05, HU-07: la devolución libera, guarda la fecha real y promueve la lista de espera';

    -- ---------- HU-11: retirar por mantenimiento sin perder solicitudes ----------
    perform set_config('app.actor', sol1::text, true);
    insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (r3, sol1, '2027-04-01', '2027-04-03') returning id into p1;
    insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (r3, sol1, '2027-04-10', '2027-04-12') returning id into p2;
    perform set_config('app.actor', owner_::text, true);
    perform aprobar_solicitud(p2);
    perform recircula_espera_error(format('select retirar_recurso(%s)', r3), 'coordinador', '42501');
    perform set_config('app.actor', coord::text, true);
    perform retirar_recurso(r3);
    assert (select count(*) from solicitudes where recurso_id = r3 and estado = 'en_espera_mantenimiento') = 2, 'HU-11(b): las solicitudes se conservan';
    assert not exists (select 1 from buscar_recursos(null, null, null) where id = r3), 'HU-11(a): no aparece en la búsqueda';
    perform set_config('app.actor', sol2::text, true);
    perform recircula_espera_error(format($q$insert into solicitudes(recurso_id, solicitante_id, inicio, fin) values (%s, %s, '2027-05-01', '2027-05-02')$q$, r3, sol2), 'retirado');
    perform set_config('app.actor', coord::text, true);
    perform reincorporar_recurso(r3);
    assert (select estado from solicitudes where id = p1) = 'pendiente', 'HU-11(b): la pendiente se reactiva';
    assert (select estado from solicitudes where id = p2) = 'confirmada', 'HU-11(b): la confirmada se reactiva';
    assert exists (select 1 from buscar_recursos(null, null, null) where id = r3), 'vuelve al catálogo al reincorporarlo';
    raise notice 'OK  HU-11: retiro por mantenimiento sin perder solicitudes';

    -- ---------- HU-10: el panel coincide con los registros ----------
    select * into v from v_panel_impacto;
    assert v.prestamos_completados = (select count(*) from solicitudes where estado = 'devuelta'), 'HU-10(a): préstamos completados';
    assert v.reparaciones_resueltas = (select count(*) from ordenes_reparacion where estado = 'resuelta'), 'HU-10(a): reparaciones resueltas';
    assert v.recursos_reutilizados = (select count(distinct recurso_id) from solicitudes where estado = 'devuelta'), 'HU-10(a): recursos reutilizados';
    raise notice 'OK  HU-10: las cifras del panel coinciden con los registros';

    -- Deshace todos los datos de prueba (solo este bloque interno)
    raise exception using errcode = 'P9999', message = '__PRUEBAS_OK__';
  exception when sqlstate 'P9999' then
    return 'Todas las pruebas de la base de datos pasaron';
  end;
end $fn$;

select recircula_run_tests() as resultado;

drop function recircula_run_tests();
drop function recircula_espera_error(text, text, text);
