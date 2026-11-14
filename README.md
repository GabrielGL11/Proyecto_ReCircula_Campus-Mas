# ReCircula Campus

Aplicación web para prestar y reparar recursos tecnológicos del campus
(calculadoras, periféricos y kits estudiantiles) y así reducir compras
innecesarias y residuos.

Proyecto de **Modelado Ágil de Software** (IS-505, 2026-2, Paralelo B),
Software 5° "B", ULEAM. Se trabaja con Kanban y XP.

## Estructura

| Carpeta | Contenido | Estado |
|---|---|---|
| `api/` | Backend: NestJS (ESM) + Vitest | Módulo `recursos` (HU-01), datos en memoria |
| `web/` | Frontend: Vite + React + TypeScript | Formulario y catálogo de recursos (HU-01) |
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
npm test            # pruebas con Vitest
```

### Frontend (`web/`)

```bash
cd web
npm install
npm run dev         # http://localhost:5173
npm run build       # compilación de producción
```

## API (HU-01)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/recursos` | Publica un recurso (`nombre` y `categoria` obligatorios). Queda "disponible". |
| GET | `/recursos` | Lista el catálogo. |

El frontend usa un proxy de Vite: las llamadas a `/api/*` van a `http://localhost:4200`.
Por ahora los datos se guardan en memoria y se pierden al reiniciar la API.

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
- [ ] Integración continua con GitHub Actions
- [ ] Conexión a PostgreSQL con TypeORM