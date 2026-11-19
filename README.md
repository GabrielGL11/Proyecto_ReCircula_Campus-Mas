# ReCircula Campus

Aplicación web para prestar y reparar recursos tecnológicos del campus
(calculadoras, periféricos y kits estudiantiles) y así reducir compras
innecesarias y residuos.

Proyecto de **Modelado Ágil de Software** (IS-505, 2026-2, Paralelo B),
Software 5° "B", ULEAM. Se trabaja con Kanban y XP.

## Estructura

| Carpeta | Contenido | Estado |
|---|---|---|
| `api/` | Backend: NestJS (ESM) + Vitest | Módulo `recursos` (HU-01 y HU-02), datos en memoria |
| `web/` | Frontend: Vite + React + TypeScript | Formulario, catálogo y búsqueda por categoría/fechas (HU-01 y HU-02) |
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
| GET | `/recursos` | Lista el catálogo. Filtros opcionales (HU-02): `categoria`, `desde` y `hasta` (AAAA-MM-DD). Con fechas busca disponibilidad: excluye recursos averiados y los que tienen un préstamo confirmado que se cruza con el rango. Cada recurso guarda el día en que se creó (`creadoEn`, hora de Ecuador) y no aparece en búsquedas cuyo rango empieza antes de esa fecha (devuelve lista vacía, no error). |
| GET | `/categorias` | Categorías válidas (`valor` y `etiqueta`). Es la única fuente: el frontend no las duplica. |

El frontend usa un proxy de Vite: las llamadas a `/api/*` van a `http://localhost:4200`.
Por ahora los datos se guardan en memoria y se pierden al reiniciar la API.

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
- [ ] Integración continua con GitHub Actions
- [ ] Conexión a PostgreSQL con TypeORM