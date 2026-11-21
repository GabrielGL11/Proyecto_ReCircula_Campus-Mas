-- =====================================================================
-- ReCircula Campus · 03_seed_demo.sql
-- Datos FICTICIOS para la demo (sin pagos reales). Funciona en Supabase y en
-- PostgreSQL. Es idempotente: si ya se cargó, no vuelve a insertar.
-- Deja listo el guion de la demo: la competencia por la calculadora Casio.
-- =====================================================================
do $$
declare
  u_coord bigint; u_carlos bigint; u_maria bigint; u_ana bigint; u_luis bigint; u_sofia bigint;
  r_casio bigint; r_mouse bigint; r_hdmi bigint; r_arduino bigint; r_ti84 bigint;
  s bigint; a bigint; o bigint;
begin
  if exists (select 1 from usuarios where correo = 'coordinacion@recircula.test') then
    raise notice 'Datos de demostración ya cargados';
    return;
  end if;

  insert into categorias(nombre) values ('calculadora'), ('periférico'), ('cable'), ('kit')
    on conflict do nothing;

  insert into usuarios(nombre, correo, rol) values ('Coordinación ReCircula', 'coordinacion@recircula.test', 'coordinador') returning id into u_coord;
  insert into usuarios(nombre, correo, rol) values ('Carlos Vaca',   'carlos.vaca@recircula.test',   'propietario') returning id into u_carlos;
  insert into usuarios(nombre, correo, rol) values ('María González','maria.gonzalez@recircula.test','propietario') returning id into u_maria;
  insert into usuarios(nombre, correo, rol) values ('Ana Loor',      'ana.loor@recircula.test',      'solicitante') returning id into u_ana;
  insert into usuarios(nombre, correo, rol) values ('Luis Mendoza',  'luis.mendoza@recircula.test',  'solicitante') returning id into u_luis;
  insert into usuarios(nombre, correo, rol) values ('Sofía Ortega',  'sofia.ortega@recircula.test',  'solicitante') returning id into u_sofia;

  insert into recursos(nombre, categoria, descripcion, propietario_id)
    values ('Calculadora científica Casio fx-991', 'calculadora', 'Ideal para Cálculo y Física', u_carlos) returning id into r_casio;
  insert into recursos(nombre, categoria, descripcion, propietario_id)
    values ('Ratón inalámbrico Logitech', 'periférico', 'Con receptor USB', u_maria) returning id into r_mouse;
  insert into recursos(nombre, categoria, descripcion, propietario_id)
    values ('Cable HDMI 2 m', 'cable', null, u_carlos) returning id into r_hdmi;
  insert into recursos(nombre, categoria, descripcion, propietario_id)
    values ('Kit Arduino Uno', 'kit', 'Placa, protoboard y sensores básicos', u_maria) returning id into r_arduino;
  insert into recursos(nombre, categoria, descripcion, propietario_id)
    values ('Calculadora gráfica TI-84', 'calculadora', null, u_carlos) returning id into r_ti84;

  -- Préstamo completado: Sofía pide el cable, Carlos aprueba, coordinación registra la devolución
  perform set_config('app.actor', u_sofia::text, true);
  insert into solicitudes(recurso_id, solicitante_id, inicio, fin)
    values (r_hdmi, u_sofia, '2026-11-02', '2026-11-04') returning id into s;
  perform set_config('app.actor', u_carlos::text, true);
  perform aprobar_solicitud(s);
  perform set_config('app.actor', u_coord::text, true);
  perform registrar_devolucion(s, '2026-11-04');

  -- Reparación resuelta: el ratón falla y se repara (abierta → en reparación → resuelta)
  perform set_config('app.actor', u_luis::text, true);
  select id into a from reportar_averia(r_mouse, 'La rueda de desplazamiento no responde');
  perform set_config('app.actor', u_coord::text, true);
  select id into o from abrir_orden_reparacion(a);
  perform avanzar_orden(o, 'en_reparacion');
  perform avanzar_orden(o, 'resuelta');

  -- Competencia por un recurso: Ana y Luis piden la Casio en fechas superpuestas (ambas pendientes)
  perform set_config('app.actor', u_ana::text, true);
  insert into solicitudes(recurso_id, solicitante_id, inicio, fin)
    values (r_casio, u_ana, '2026-12-01', '2026-12-05');
  perform set_config('app.actor', u_luis::text, true);
  insert into solicitudes(recurso_id, solicitante_id, inicio, fin)
    values (r_casio, u_luis, '2026-12-03', '2026-12-07');

  raise notice 'Datos de demostración cargados';
end $$;
