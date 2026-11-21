# ReCircula Campus

Aplicación web para prestar y reparar recursos tecnológicos del campus
(calculadoras, periféricos y kits estudiantiles) y así reducir compras
innecesarias y residuos.

Proyecto de **Modelado Ágil de Software** (IS-505, 2026-2, Paralelo B),
Software 5° "B", ULEAM. Se trabaja con Kanban y XP.

## Estructura

| Carpeta | Contenido | Estado |
|---|---|---|
| `api/` | Backend: NestJS (ESM) + Vitest | Módulos `recursos` (HU-01 y HU-02) y `solicitudes` (HU-03), datos en memoria |
| `web/` | Frontend: Vite + React + TypeScript | Formulario, catálogo, filtros y solicitudes de préstamo (HU-01, HU-02 y HU-03) |
| `.github/workflows/` | Integración continua (GitHub Actions) | Pendiente |

Tecnologías previstas, aún sin instalar: TypeORM + PostgreSQL y JWT en `api/`,
React Router en `web/`.

## Requisitos

- Node.js 24 (LTS) y npm
- Git
- PostgreSQL 18 (se usará cuando se conecte la base de datos)

## Cómo ejecutar

### Backend (`api/`)

```bash
cd api
npm install
npm run start:dev   # http://localhost:4200
npm test            # pruebas unitarias con Vitest
npm run test:e2e    # pruebas HTTP de los controladores (supertest)
```

### Frontend (`web/`)

```bash
cd web
npm install
npm run dev         # http://localhost:5173
npm run build       # compilación de producción
```

## API (HU-01 y HU-02)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/recursos` | Publica un recurso (`nombre` y `categoria` obligatorios). Queda "disponible". Un body inválido (campos de otro tipo, ausente, categoría desconocida) responde 400 con la lista de errores. |
| GET | `/recursos` | Lista el catálogo. Filtros opcionales (HU-02): `categoria`, `desde` y `hasta` (AAAA-MM-DD); con fechas excluye recursos con préstamo confirmado en ese rango. |

El frontend usa un proxy de Vite: las llamadas a `/api/*` van a `http://localhost:4200`.
Por ahora los datos se guardan en memoria y se pierden al reiniciar la API.

## API (HU-03)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/solicitudes` | Crea una solicitud de préstamo (`recursoId`, `inicio`, `fin`, `solicitanteId`). Con fechas válidas queda `pendiente`. Rechaza (400) fin anterior al inicio, fechas faltantes o inválidas y recursos averiados; 404 si el recurso no existe. |
| GET | `/solicitudes` | Lista las solicitudes. Filtro opcional: `solicitanteId`. |

## Deuda técnica

- **`propietarioId` lo manda el cliente** (el frontend lo fija en 1). Es inseguro: cuando se
  implemente JWT, el propietario debe salir del token y quitarse del body. Está marcado con
  `TODO(JWT)` en el código.

## Tablero Kanban

https://github.com/users/GabrielGL11/projects/1

Columnas: Backlog, Por hacer, En desarrollo (WIP máx. 2), En revisión,
Pruebas (WIP máx. 2) y Hecho. Cada historia es un issue del repositorio y
aparece como tarjeta en el tablero.

## Backlog

Historias cargadas: HU-01 a HU-08, HU-10 y HU-11 (HU-09 se descartó como
historia separada y quedó absorbida por HU-11).

| Incremento | Historias |
|---|---|
| 1 | HU-01, HU-02, HU-03 |
| 2 | HU-04, HU-05, HU-06, HU-11 |
| 3 | HU-07, HU-08, HU-10 |

## Equipo

- Alava Barcia José Gabriel
- Guaman Lucio Anthony Gabriel
- Salazar Gallo Scarlett Andreina
- Solorzano Zambrano Jordan Josue

## Estado

- [x] Repositorio y estructura `api/` y `web/`
- [x] Tablero Kanban público con 10 historias en Backlog
- [x] Proyectos base de NestJS y Vite + React funcionando
- [ ] HU-01: publicar recurso (en revisión; datos en memoria)
- [ ] HU-02: consultar disponibilidad por categoría y fechas (en revisión; datos en memoria)
- [ ] HU-03: solicitar préstamo (datos en memoria)
- [ ] Integración continua con GitHub Actions
- [ ] Conexión a PostgreSQL con TypeORM