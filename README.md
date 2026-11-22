# ReCircula Campus

Aplicación web para prestar y reparar recursos tecnológicos del campus (calculadoras, periféricos y kits estudiantiles) y así reducir compras innecesarias y residuos.

Proyecto de Modelado Ágil de Software (IS-505, 2026-2, Paralelo B), Software 5° "B", ULEAM. Se trabaja con Kanban y XP.

## Estructura

| Carpeta | Contenido | Estado |
|---|---|---|
| `db/` | Base de datos en Supabase (PostgreSQL): esquema, reglas de negocio, permisos, datos de demo y pruebas | Esquema completo; la API usa hoy HU-01, HU-02, HU-03 y HU-06 |
| `api/` | Backend: NestJS (ESM) + Vitest. Valida el login de Supabase y consulta la base con SQL | Recursos (HU-01, HU-02 y HU-06) y solicitudes (HU-03) sobre la base de datos. Se empaqueta con el `Dockerfile` y corre en AWS Lambda ([`docs/DEPLOY-API-AWS.md`](docs/DEPLOY-API-AWS.md)) |
| `web/` | Frontend: Vite + React + TypeScript. Login con Supabase Auth y pantallas según el rol | HU-01, HU-02, HU-03 y HU-06 con sesión iniciada |
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

- **Base de datos:** las reglas de negocio viven en la base (no se pueden saltar desde la API): fechas válidas, un recurso averiado no se presta, dos préstamos confirmados no se superponen, estados de las solicitudes y permisos por fila (RLS). Detalle en [`db/README.md`](db/README.md).
- **API:** el usuario sale del token de Supabase, nunca del body de la petición. Traduce los errores de la base a respuestas 400, 403 o 404 con mensajes en español.
- **Web:** guarda la sesión de Supabase, manda el token en cada petición y muestra a cada persona solo lo que corresponde a su rol.

## Roles y qué ve cada uno

| Rol | HU-01 Publicar recurso | HU-02 Consultar catálogo | HU-03 Solicitar préstamo | HU-06 Reportar avería |
|---|---|---|---|---|
| Solicitante | No | Sí | Sí | Sí |
| Propietario | Sí | Sí | No | Sí |
| Coordinador | Sí | Sí | No | Sí |

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
| POST | `/solicitudes` | Solicitante | HU-03. Crea una solicitud de préstamo (`recursoId`, `inicio`, `fin`). Con fechas válidas queda "pendiente". El solicitante sale del token. Responde 400 si el fin es anterior al inicio, faltan fechas, son inválidas o el recurso está averiado; 404 si el recurso no existe. |
| GET | `/solicitudes` | Solicitante | Lista las solicitudes de la persona con sesión. |

## Seguridad

- El propietario de un recurso, el solicitante de un préstamo y quien reporta una avería salen siempre del token, nunca del body.
- La web solo usa la clave pública de Supabase.
- Los permisos también se aplican en la base de datos (RLS), no solo en la API.
- Pendiente (la API ya está desplegada): en `api/src/db/db.service.ts` la conexión usa `ssl: { rejectUnauthorized: false }`, que es válido para desarrollo pero no verifica el certificado.

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

Evidencia: commits `52f10c2` (pruebas en ROJO) y `14a022d` (implementación en VERDE) de la rama `feature/hu-06-reportar-averia`; Vitest con 51 de 51 pruebas aprobadas y CI en verde; prueba manual en la web (el recurso queda averiado y desaparece del catálogo); en la base de datos, `aprobar_solicitud` rechaza recursos averiados y `db/04_tests.sql` cubre los criterios (a) y (b). Pendiente: enlace al pull request.

La web no tiene pruebas automáticas, así que el TDD (rojo y verde) se aplicó a la API y la web se verificó a mano.

## Trazabilidad: historia, pull request y prueba

Cada historia se integra mediante pull request revisado por un compañero del equipo.

| Historia | Pull requests fusionados | Pruebas que la respaldan |
|---|---|---|
| HU-01: Publicar recurso | #14, #16 y #17 (robustez, categorías únicas y pruebas de controlador) | `npm test` (Vitest) y `npm run test:e2e` (supertest) |
| HU-02: Consultar disponibilidad | #15 | `npm test` (Vitest) y `npm run test:e2e` (supertest) |
| HU-03: Solicitar préstamo | #18 | `npm test` (Vitest) y `npm run test:e2e` (supertest) |
| HU-06: Reportar avería | Rama `feature/hu-06-reportar-averia` (pull request pendiente) | `npm test` (4 pruebas en `recursos.averia.spec.ts`; suite completa 51/51) y `npm run test:e2e` (`recursos.averias.e2e-spec.ts`) |

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
| RNF-01 | Accesibilidad básica: etiquetas visibles, contraste 4,5:1 y manejo por teclado | Formularios con etiquetas y alertas (`role="alert"`). Pendiente pasar Lighthouse (mínimo 90) y recorrer HU-03 solo con teclado |
| RNF-02 | Errores comprensibles que conservan lo escrito | Pruebas de casos negativos de HU-03 (fechas, recurso averiado, recurso inexistente) y de HU-06 (descripción vacía o inválida); formularios que no borran lo escrito |
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
- [x] Base de datos en Supabase con reglas, permisos y pruebas (`db/`)
- [x] Login con Supabase Auth y vistas por rol
- [x] HU-01, HU-02 y HU-03 conectadas de punta a punta: web, API y base de datos
- [x] HU-06: reportar avería de punta a punta (web, API y base de datos), probada a mano; la API con TDD (rojo `52f10c2`, verde `14a022d`) y CI en verde; pull request pendiente
- [ ] HU-04 y HU-05 en adelante (aprobar o rechazar, devolución, lista de espera, reparación, panel). La base de datos ya tiene las funciones; faltan la API y la web
- [ ] Revisión de accesibilidad con Lighthouse (RNF-01)
- [x] Integración continua con GitHub Actions (`ci.yml`)
- [x] Despliegue de la web en AWS (S3 + CloudFront)
- [x] Despliegue de la API en AWS Lambda detrás de CloudFront (`/api/*`)
- [ ] Automatizar el despliegue de la API en el pipeline (hoy es manual)
- [ ] Verificar el certificado de la base de datos (`ssl` en `db.service.ts`)