# ReCircula Campus

Aplicación web para prestar y reparar recursos tecnológicos del campus (calculadoras, periféricos y kits estudiantiles) y así reducir compras innecesarias y residuos.

Proyecto de Modelado Ágil de Software (IS-505, 2026-2, Paralelo B), Software 5° "B", ULEAM. Se trabaja con Kanban y XP.

## Estructura

| Carpeta | Contenido | Estado |
|---|---|---|
| `db/` | Base de datos en Supabase (PostgreSQL): esquema, reglas de negocio, permisos, datos de demo y pruebas | Esquema completo; la API usa hoy HU-01 a HU-08 |
| `api/` | Backend: NestJS (ESM) + Vitest. Valida el login de Supabase y consulta la base con SQL | Recursos (HU-01, HU-02 y HU-06), solicitudes (HU-03, HU-04 y HU-05) lista de espera (HU-07) y órdenes de reparación (HU-08) sobre la base de datos. Se empaqueta con el `Dockerfile` y corre en AWS Lambda ([`docs/DEPLOY-API-AWS.md`](docs/DEPLOY-API-AWS.md)) |
| `web/` | Frontend: Vite + React + TypeScript. Login con Supabase Auth y pantallas según el rol | HU-01 a HU-08 con sesión iniciada |
| `.github/workflows/` | Integración continua y despliegue de la web en AWS (GitHub Actions) | `ci.yml` y `deploy.yml`; configuración en [`docs/DEPLOY-AWS.md`](docs/DEPLOY-AWS.md) |
| `scripts/` | Verificación posterior al despliegue y escaneo de secretos | `smoke-test.sh` y `check-secrets.sh` |
| `docs/` | Guías de despliegue y de la práctica DevOps, y evidencias | [`DEPLOY-AWS.md`](docs/DEPLOY-AWS.md) (web), [`DEPLOY-API-AWS.md`](docs/DEPLOY-API-AWS.md) (API), [`PRACTICA-DEVOPS.md`](docs/PRACTICA-DEVOPS.md) |

## Arquitectura

```text
web (React) ──login──► Supabase Auth ──► token
web ──/api/... + Authorization: Bearer <token>──► api (NestJS)
api ──valida el token con Supabase Auth, busca al usuario en la tabla usuarios──►
api ──SQL (funciones, triggers y restricciones)──► Supabase PostgreSQL
```

En producción (AWS), todo se sirve bajo el mismo dominio de CloudFront, sin CORS:

```text
navegador ──► CloudFront ──/*──────► S3 privado (web estática)
                         └─/api/*──► Lambda (Function URL, API NestJS) ──► Supabase
```

Una CloudFront Function quita el prefijo `/api` (igual que el proxy de Vite) y otra devuelve `index.html` para las rutas de la SPA. Los pasos están en [`docs/DEPLOY-API-AWS.md`](docs/DEPLOY-API-AWS.md).

- **Base de datos:** las reglas de negocio viven en la base (no se pueden saltar desde la API): fechas válidas, un recurso averiado no se presta, dos préstamos confirmados no se superponen, estados de las solicitudes, lista de espera con promoción automática al devolver y permisos por fila (RLS). Detalle en [`db/README.md`](db/README.md).
- **API:** el usuario sale del token de Supabase, nunca del body de la petición. Traduce los errores de la base a respuestas 400, 403, 404 o 409 con mensajes en español.
- **Web:** guarda la sesión de Supabase, manda el token en cada petición y muestra a cada persona solo lo que corresponde a su rol.

## Roles y qué ve cada uno

| Rol | HU-01 Publicar recurso | HU-02 Consultar catálogo | HU-03 Solicitar préstamo | HU-04 Aprobar o rechazar | HU-05 Registrar devolución | HU-06 Reportar avería | HU-07 Lista de espera | HU-08 Orden de reparación |
|---|---|---|---|---|---|---|---|---|
| Solicitante | No | Sí | Sí | No | No | Sí | Sí | No |
| Propietario | Sí | Sí | No | Sí (solo sus recursos) | No | Sí | No | No |
| Coordinador | Sí | Sí | No | Sí (todos) | Sí | Sí | No | Sí |

Ocultar una pantalla en la web es solo comodidad: la regla de verdad está en la API (responde 403) y en la base de datos (RNF-03). HU-06 no se limita por rol: cualquier persona con sesión puede reportar una avería.

## Requisitos

- Node.js 24 (LTS) y npm
- Git
- Un proyecto de [Supabase](https://supabase.com) (plan gratuito) con los usuarios de prueba creados en Authentication → Users

## Configuración

### 1. Base de datos

En el **SQL Editor** de Supabase, cada archivo en una consulta nueva y en este orden (detalle en [`db/README.md`](db/README.md)):

1. `db/01_schema.sql`
2. `db/02_supabase_adapter.sql`
3. `db/03_seed_demo.sql` (datos ficticios, opcional)
4. `db/04_tests.sql` (pruebas de las reglas, opcional)

### 2. Variables de entorno

Cada carpeta trae un `.env.example` con la plantilla. Se copia a `.env` y se rellena con los valores reales de tu proyecto de Supabase. **Los `.env` están en `.gitignore`: nunca se suben al repositorio.**

`api/.env`:

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | Cadena de conexión del **Session pooler** (Supabase → Connect). La conexión directa no sirve en redes sin IPv6 |
| `PORT` | Puerto de la API (`4200`) |
| `SUPABASE_URL` | URL del proyecto (`https://<ref>.supabase.co`) |
| `SUPABASE_KEY` | Clave **publishable** (pública) |

`web/.env`:

| Variable | Qué es |
|---|---|
| `VITE_SUPABASE_URL` | La misma URL del proyecto |
| `VITE_SUPABASE_KEY` | La misma clave **publishable** |

Nunca pongas una clave `service_role` o `sb_secret_` en la web ni en el repositorio. Las contraseñas de los usuarios de prueba y la de la base de datos se guardan fuera del repositorio.

## Cómo ejecutar

### Backend (`api/`)

```bash
cd api
npm install
npm run start:dev   # http://localhost:4200
npm test            # pruebas unitarias con Vitest (la base de datos se simula)
npm run test:e2e    # pruebas HTTP de los controladores (supertest)
```

### Frontend (`web/`)

```bash
cd web
npm install
npm run dev         # http://localhost:5173
npm run build       # compilación de producción
```

El frontend usa un proxy de Vite: las llamadas a `/api/*` van a `http://localhost:4200`, así que no hay problemas de CORS. La API debe estar corriendo para que la web funcione.

## API

Todas las rutas piden `Authorization: Bearer <token de Supabase>`. Sin sesión responden 401; con un rol que no corresponde, 403.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/auth/yo` | Cualquiera | Devuelve `id`, `nombre` y `rol` de quien tiene la sesión. La web lo usa para mostrar cada pantalla según el rol. |
| POST | `/recursos` | Propietario o coordinador | HU-01. Publica un recurso (`nombre` y `categoria` obligatorios). Queda "disponible" a nombre de quien tiene la sesión. Un body inválido responde 400 con la lista de errores. |
| GET | `/recursos` | Cualquiera | HU-02. Lista el catálogo. Filtros opcionales: `categoria`, `desde` y `hasta` (AAAA-MM-DD). Con fechas excluye recursos con préstamo confirmado en ese rango. No muestra recursos averiados ni retirados. |
| POST | `/recursos/:id/averias` | Cualquiera | HU-06. Reporta una avería de un recurso (`descripcion` obligatoria). El recurso pasa a "averiado" y deja de aparecer en el catálogo y de poder prestarse. El reporte queda a nombre de quien tiene la sesión (sale del token). Responde 400 si la descripción está vacía, en blanco o no es texto, o si la base rechaza el reporte; 404 si el recurso no existe. |
| POST | `/solicitudes` | Solicitante | HU-03. Crea una solicitud de préstamo (`recursoId`, `inicio`, `fin`). Con fechas válidas queda "pendiente". El solicitante sale del token. Responde 400 si el fin es anterior al inicio, el inicio ya pasó, faltan fechas, son inválidas, el recurso está averiado o ya tienes una solicitud pendiente idéntica; 404 si el recurso no existe. |
| GET | `/solicitudes` | Solicitante | Lista las solicitudes de la persona con sesión. |
| GET | `/solicitudes/pendientes` | Propietario o coordinador | HU-04. Lista las solicitudes pendientes por decidir: el propietario ve las de sus recursos; el coordinador, todas. |
| PATCH | `/solicitudes/:id/aprobar` | Propietario del recurso o coordinador | HU-04. La solicitud queda "confirmada" y el recurso se bloquea en esas fechas. Responde 400 si se superpone con un préstamo confirmado (sigue pendiente), si el recurso está averiado o si ya no está pendiente; 403 si no eres el propietario ni el coordinador; 404 si no existe. |
| PATCH | `/solicitudes/:id/rechazar` | Propietario del recurso o coordinador | HU-04. La solicitud pasa a "rechazada". Mismos 400, 403 y 404 que aprobar. |
| PATCH | `/solicitudes/:id/devolucion` | Coordinador | HU-05. Registra la devolución de un préstamo confirmado: se guarda la fecha real de devolución y el recurso vuelve a quedar "disponible" y a aparecer en el catálogo. Si hay personas en lista de espera, la primera pasa a una solicitud "pendiente" (HU-07). Responde 400 si la solicitud no está confirmada o ya se devolvió; 403 si no eres coordinador; 404 si no existe. |
| POST | `/lista-espera` | Solicitante | HU-07. Se anota en la lista de espera de un recurso ocupado en esas fechas (`recursoId`, `inicio`, `fin`). El solicitante sale del token. Responde 400 si el recurso está libre en esas fechas (debe solicitarse directamente), si está averiado, si el fin es anterior al inicio o faltan fechas; 403 si no eres solicitante; 404 si no existe; 409 si ya estás anotado en esa lista para esas mismas fechas. |
| GET | `/lista-espera` | Solicitante | HU-07. Lista las entradas de lista de espera de la persona con sesión, con su estado: "en espera", "promovida" (pasó a solicitud pendiente) o "cancelada". |
| PATCH | `/lista-espera/:id/cancelar` | Solicitante | HU-07. Cancela una entrada en lista de espera propia. Responde 400 si no existe o ya no está en espera. |
| POST | `/ordenes-reparacion` | Coordinador | HU-08 (a). Abre una orden de reparación desde una avería (`averiaId`); nace "abierta". Responde 400 si falta la avería o el id no es válido; 403 si no eres coordinador; 404 si la avería no existe; 409 si esa avería ya tiene una orden. |
| GET | `/ordenes-reparacion` | Coordinador | HU-08. Lista las órdenes con el recurso, la descripción de la avería y su estado; primero las que siguen en curso. |
| GET | `/ordenes-reparacion/averias-sin-orden` | Coordinador | HU-08. Lista las averías reportadas que todavía no tienen orden de reparación. |
| PATCH | `/ordenes-reparacion/:id/estado` | Coordinador | HU-08 (b) y (c). Cambia el estado de la orden (`estado`: `en_reparacion` o `resuelta`). Solo permite abierta → en_reparacion → resuelta; al resolver, el recurso vuelve a quedar "disponible". Responde 400 si el estado no es válido o se salta un paso (por ejemplo, abierta → resuelta); 403 si no eres coordinador; 404 si la orden no existe. |
| GET | `/ordenes-reparacion/:id/historial` | Coordinador | HU-08 (d). Historial de la orden: estado anterior y nuevo, quién hizo el cambio y cuándo. Responde 403 si no eres coordinador; 404 si la orden no existe. |

## Seguridad

- El propietario de un recurso, el solicitante de un préstamo, quien reporta una avería, quien se anota en la lista de espera y quien abre o avanza una orden de reparación salen siempre del token, nunca del body.
- La web solo usa la clave pública de Supabase.
- Los permisos también se aplican en la base de datos (RLS), no solo en la API.
- La conexión a la base verifica el certificado de Supabase: si existe la variable `DB_SSL_CA_BASE64` (el CA de Supabase en base64, configurada en Lambda), `db.service.ts` usa `ssl: { ca, rejectUnauthorized: true }`. Sin esa variable (desarrollo local) cifra la conexión sin verificar el certificado.

## Tablero Kanban

<https://github.com/users/GabrielGL11/projects/1>

Columnas: Backlog, Por hacer, En desarrollo (WIP máx. 2), En revisión, Pruebas (WIP máx. 2) y Hecho. Cada historia es un issue del repositorio y aparece como tarjeta en el tablero.

### Backlog

Historias cargadas: HU-01 a HU-08, HU-10 y HU-11 (HU-09 se descartó como historia separada y quedó absorbida por HU-11).

| Incremento | Historias |
|---|---|
| 1 | HU-01, HU-02, HU-03 |
| 2 | HU-04, HU-05, HU-06, HU-11 |
| 3 | HU-07, HU-08, HU-10 |

### HU-05: Registrar devolución

**Historia:** como coordinador quiero registrar la devolución para que el recurso vuelva a estar disponible.

| Campo | Valor |
|---|---|
| Prioridad (MoSCoW) | Must |
| Estimación inicial | 3 puntos (se confirma con Planning Poker) |
| Dependencia | HU-04 |
| Incremento | 2 |

Criterios de aceptación:

- (a) Tras registrarla, el recurso aparece disponible en la búsqueda.
- (b) Se guarda la fecha real de devolución.

Evidencia: pull request #24 fusionado (issue #8), con la tarjeta en la columna Hecho del tablero. <!-- AGREGAR: commits del TDD (rojo/verde), número de pruebas Vitest y e2e, y la prueba manual en la web -->

### HU-06: Reportar avería

**Historia:** como solicitante quiero reportar una avería para que el recurso deje de prestarse.

| Campo | Valor |
|---|---|
| Prioridad (MoSCoW) | Must |
| Estimación inicial | 2 puntos (se confirma con Planning Poker) |
| Dependencia | HU-01 |
| Incremento | 2 |

Criterios de aceptación:

- (a) El reporte cambia el estado del recurso a "averiado".
- (b) Un recurso averiado no aparece en la búsqueda ni puede aprobarse.

Evidencia: commits `52f10c2` (pruebas en ROJO) y `14a022d` (implementación en VERDE) de la rama `feature/hu-06-reportar-averia`; Vitest con 81 pruebas unitarias y 18 e2e de la API aprobadas tras fusionar con `main`, y CI en verde; prueba manual en la web (el recurso queda averiado y desaparece del catálogo; al intentar aprobar una solicitud de un recurso averiado la web muestra «El recurso está averiado y no se puede aprobar», mientras que rechazarla y aprobar una solicitud de un recurso disponible siguen funcionando); en la base de datos, `aprobar_solicitud` rechaza recursos averiados y `db/04_tests.sql` cubre los criterios (a) y (b). Pull request: #23.

### HU-07: Lista de espera

**Historia:** como solicitante quiero anotarme en una lista de espera cuando el recurso esté ocupado para pedirlo cuando se libere.

| Campo | Valor |
|---|---|
| Prioridad (MoSCoW) | Should |
| Estimación inicial | 5 puntos (se confirma con Planning Poker) |
| Dependencia | HU-05 |
| Incremento | 3 |

Criterios de aceptación:

- (a) Con el recurso ocupado puedo anotarme.
- (b) Al liberarse, el primero de la lista pasa a "pendiente" y no se aprueba solo.

Evidencia: pull request #25 (issue #10), rama `feature/hu-07-lista-espera`. Prueba manual en la web con usuarios de prueba:

- (a) Con el recurso libre, la anotación se rechaza («El recurso está libre en esas fechas: solicítelo directamente»). Con «Probeta» ocupada por un préstamo confirmado (10 al 12/12/2026), dos solicitantes se anotan y quedan "En espera"; repetir la anotación se rechaza con el mensaje «Ya estás en la lista de espera de este recurso para esas fechas» (409, traducción del error 23505 en `db-errores.ts`).
- (b) Al registrar la devolución (coordinación), el primero de la lista pasa a "Promovida a pendiente" con una solicitud en estado pendiente y el segundo sigue "En espera". La solicitud solo queda confirmada cuando el propietario la aprueba.

Respaldo técnico: módulo `lista-espera` en la API con 9 pruebas unitarias (`lista-espera.pg.service.spec.ts`) y 4 pruebas e2e (`lista-espera.e2e-spec.ts`); 93 pruebas unitarias de la API en verde; interfaz web en `App.tsx` con formulario para anotarse desde el catálogo, visualización del estado ("En espera", "Promovida a pendiente", "Cancelada") y cancelación voluntaria; en la base de datos, `anotar_en_lista_espera` valida que el recurso esté ocupado en esas fechas, y `registrar_devolucion` llama a `promover_lista_espera`, que toma a la persona más antigua de la cola y crea su solicitud pendiente; `db/04_tests.sql` cubre los criterios (a) y (b).

La web no tiene pruebas automáticas, así que el TDD (rojo y verde) se aplicó a la API y la web se verificó a mano.

### HU-08: Orden de reparación

**Historia:** como coordinador quiero una orden de reparación con estados para seguir cada avería.

| Campo | Valor |
|---|---|
| Prioridad (MoSCoW) | Should |
| Estimación inicial | 5 puntos (se confirma con Planning Poker) |
| Dependencia | HU-06 |
| Incremento | 3 |

Criterios de aceptación:

- (a) La orden nace "abierta" desde una avería.
- (b) Solo permite abierta → en reparación → resuelta, sin saltar estados.
- (c) Al resolverse, el recurso vuelve a estar disponible.
- (d) Cada cambio de estado guarda la fecha y quién lo hizo.

Evidencia: <!-- AGREGAR: pull request (n.º), prueba manual en la web con capturas (abrir la orden, intentar saltar de abierta a resuelta, resolver y ver el recurso otra vez en el catálogo, historial con quién y cuándo) y total de `npm test` -->

Respaldo técnico: módulo `ordenes-reparacion` en la API (solo coordinador) con 31 pruebas unitarias (`ordenes-reparacion.pg.service.spec.ts`) y 6 pruebas e2e (`ordenes-reparacion.e2e-spec.ts`); `db-errores.spec.ts` comprueba que abrir una segunda orden para la misma avería responde 409; sección «Órdenes de reparación» en `App.tsx` solo para el coordinador, con las averías por atender, el botón para abrir la orden, un botón por estado (Iniciar reparación, Marcar como resuelta) y el historial de cada orden; en la base de datos, `abrir_orden_reparacion` crea la orden "abierta", el trigger `trg_orden_validar` impide saltar estados, `trg_orden_historial` guarda quién y cuándo (historial inmutable) y deja el recurso "disponible" al resolver; `db/04_tests.sql` cubre los criterios (a), (b), (c) y (d).

## Trazabilidad: historia, pull request y prueba

Cada historia se integra mediante pull request revisado por un compañero del equipo.

| Historia | Pull requests | Pruebas que la respaldan |
|---|---|---|
| HU-01: Publicar recurso | #14, #16 y #17 (robustez, categorías únicas y pruebas de controlador) | `npm test` (Vitest) y `npm run test:e2e` (supertest) |
| HU-02: Consultar disponibilidad | #15 | `npm test` (Vitest) y `npm run test:e2e` (supertest) |
| HU-03: Solicitar préstamo | #18 | `npm test` (Vitest) y `npm run test:e2e` (supertest) |
| HU-04: Aprobar o rechazar | #22 (issue #7) | `npm test` y `npm run test:e2e`; desarrollada con TDD (rojo, verde, refactor) |
| HU-05: Registrar devolución | #24 (issue #8) | `npm test` y `npm run test:e2e` <!-- AJUSTAR: nombre de los archivos de prueba de HU-05 --> |
| HU-06: Reportar avería | #23 (issue #9) | `npm test` (4 pruebas en `recursos.averia.spec.ts`) y `npm run test:e2e` (`recursos.averias.e2e-spec.ts`) |
| HU-07: Lista de espera | #25 (issue #10) | `npm test` (9 pruebas en `lista-espera.pg.service.spec.ts`) y `npm run test:e2e` (4 pruebas en `lista-espera.e2e-spec.ts`); `db/04_tests.sql` |
| HU-08: Orden de reparación | <!-- AJUSTAR: n.º del PR e issue #11 --> | `npm test` (31 pruebas en `ordenes-reparacion.pg.service.spec.ts`) y `npm run test:e2e` (6 pruebas en `ordenes-reparacion.e2e-spec.ts`); `db/04_tests.sql` |

Las tres primeras historias se migraron después a Supabase, con login y vistas por rol, en la rama `feature/integracion-supabase`. Las reglas de la base de datos tienen sus propias pruebas en `db/04_tests.sql`.

HU-06 se desarrolló con TDD y el historial de la rama lo muestra en este orden:

1. `97af29c`: implementación original (`feat: report resource breakdown`).
2. `fc4f824`: se retira la implementación (`Revert`).
3. `52f10c2`: pruebas en ROJO (fallaban con `reportarAveria is not a function`).
4. `14a022d`: se restaura la implementación (`Reapply`), pruebas en VERDE y CI en verde.

Lista de pull requests: <https://github.com/GabrielGL11/Proyecto_ReCircula_Campus-Mas/pulls?q=is%3Apr+state%3Aclosed>

## Requisitos no funcionales

| ID | Requisito | Estado |
|---|---|---|
| RNF-01 | Accesibilidad básica: etiquetas visibles, contraste 4,5:1 y manejo por teclado | Formularios con etiquetas y alertas (`role="alert"`). Lighthouse (22/11/2026): login 100 y, con sesión de coordinación, 22/22 comprobaciones de accesibilidad superadas. Prueba con teclado: orden lógico, foco visible y «Aprobar» (HU-04) activable con Tab + Enter |
| RNF-02 | Errores comprensibles que conservan lo escrito | Pruebas de casos negativos de HU-03 (fechas, recurso averiado, recurso inexistente), de HU-06 (descripción vacía o inválida) y de HU-07 (recurso libre y anotación duplicada con mensaje claro) y de HU-08 (estado fuera del orden o salto de estados, orden duplicada); formularios que no borran lo escrito |
| RNF-03 | Control de acceso por rol | Roles aplicados en la API y en la base de datos; pruebas de que un rol no autorizado recibe 403 |

## Estrategia de ramas y flujo de trabajo

- `main` siempre está estable y desplegable. Está protegida: solo se cambia con pull request, con **1 aprobación de un compañero** y con los checks de CI en verde.
- Cada historia o arreglo va en una rama propia: `feature/<tema>`, `fix/<tema>` o `demo/<tema>`.
- Cada PR usa la plantilla (`.github/pull_request_template.md`): historia, criterio de aceptación y prueba que lo respalda.
- Al fusionar a `main` se despliega solo. Las versiones buenas se etiquetan (`v1.0.0`) para poder volver a ellas.

## Integración continua y despliegue

Dos workflows en `.github/workflows/`:

| Workflow | Cuándo corre | Qué hace |
|---|---|---|
| `ci.yml` | Pull requests y push a cualquier rama que no sea `main` | Job `api`: `npm ci`, `npm test`, `npm run test:e2e`, `npm run build`. Job `web`: `npm ci` y `npm run build`. Job `secretos`: busca claves y `.env` en el repositorio |
| `deploy.yml` | Push a `main`, o manual con `ref` para volver a una versión anterior | Corre `ci.yml`; si pasa, compila `web/`, escanea el build, la publica en S3, refresca CloudFront y verifica la versión publicada con `scripts/smoke-test.sh`. Se omite mientras no exista la variable `S3_BUCKET` |

- Las pruebas de la API no necesitan la base de datos ni secretos.
- El acceso a AWS usa OIDC: no hay claves de AWS guardadas en GitHub. El único secreto es el ARN del rol (`AWS_ROLE_ARN`); lo demás son variables públicas.
- Cada despliegue publica `/version.json` con el commit, y el resumen de la ejecución muestra la versión anterior para poder volver a ella.
- Pasos de AWS, variables de GitHub y rollback: [`docs/DEPLOY-AWS.md`](docs/DEPLOY-AWS.md). Guion completo de la práctica: [`docs/PRACTICA-DEVOPS.md`](docs/PRACTICA-DEVOPS.md).
- La API (NestJS) se despliega aparte: S3 solo sirve la web. Corre como imagen de contenedor en AWS Lambda y hoy se actualiza a mano desde CloudShell (`docker build` y `push` a ECR, y *Deploy new image* en Lambda); ver [`docs/DEPLOY-API-AWS.md`](docs/DEPLOY-API-AWS.md).
- Con la variable `API_URL` (`https://<dominio>.cloudfront.net/api`), `smoke-test.sh` también comprueba la API: `GET /auth/yo` y `GET /recursos` sin sesión responden 401 en JSON.

## Equipo

- Alava Barcia José Gabriel
- Guaman Lucio Anthony Gabriel
- Salazar Gallo Scarlett Andreina
- Solorzano Zambrano Jordan Josue

## Estado

- [x] Repositorio y estructura `api/` y `web/`
- [x] Tablero Kanban público con 10 historias en Backlog
- [x] Proyectos base de NestJS y Vite + React funcionando
- [x] HU-01: publicar recurso (PR #14, #16 y #17 fusionados)
- [x] HU-02: consultar disponibilidad por categoría y fechas (PR #15 fusionado)
- [x] HU-03: solicitar préstamo (PR #18 fusionado)
- [x] HU-04: aprobar o rechazar solicitud (PR #22 fusionado)
- [x] HU-05: registrar devolución (PR #24 fusionado)
- [x] HU-06: reportar avería (PR #23 fusionado)
- [x] HU-07: lista de espera (PR #25)
- [x] HU-08: orden de reparación <!-- AJUSTAR: (PR n.º) -->
- [x] Base de datos en Supabase con reglas, permisos y pruebas (`db/`)
- [x] Login con Supabase Auth y vistas por rol
- [x] HU-01 a HU-08 conectadas de punta a punta: web, API y base de datos
- [ ] HU-10 en adelante (panel de impacto, retiro por mantenimiento). La base de datos ya tiene las funciones; faltan la API y la web
- [x] Revisión de accesibilidad con Lighthouse (RNF-01)
- [x] Integración continua con GitHub Actions (`ci.yml`)
- [x] Despliegue de la web en AWS (S3 + CloudFront)
- [x] Despliegue de la API en AWS Lambda detrás de CloudFront (`/api/*`)
- [x] Automatizar el despliegue de la API en el pipeline (`deploy.yml`: imagen en ECR + Lambda)
- [x] Verificar el certificado de la base de datos (`ssl` en `db.service.ts`)