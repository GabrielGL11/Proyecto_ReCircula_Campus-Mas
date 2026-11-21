# Guion de la práctica DevOps (IS-505): GitHub Actions, pruebas y despliegue en AWS

Esta guía lleva la práctica de principio a fin con lo que ya tiene el repositorio. Cada paso dice **qué hacer**, **qué evidencia guardar** y **qué criterio de la rúbrica cubre**.

Rúbrica: reproducibilidad · pruebas y automatización funcionales · análisis del fallo · verificación del despliegue · tratamiento de secretos · claridad y trazabilidad.

## Qué resuelve cada requisito de la práctica

| Requisito del enunciado | Dónde está resuelto |
|---|---|
| 1. Repositorio con README, requisitos, ramas y funcionalidad verificable | `README.md` (requisitos, cómo ejecutar, estrategia de ramas) y HU-01/02/03 con pruebas |
| 2. Workflow ante cambio o PR: instalar, probar, construir | `.github/workflows/ci.yml` |
| 3. Fallo controlado, corrección y explicación | `docs/evidencias/fallo-controlado.patch` (paso 3 de esta guía) |
| 4. Desplegar en una nube | `.github/workflows/deploy.yml` → S3 + CloudFront |
| 5. Recorrido principal, caso de error, versión, registros, rollback, secretos | `scripts/smoke-test.sh`, `version.json`, resumen de la ejecución, rollback por `workflow_dispatch`, OIDC y `scripts/check-secrets.sh` |
| 6. Revisión entre compañeros relacionada con historia, criterio y prueba | `.github/pull_request_template.md` y la regla de `main` con 1 aprobación |

## Paso 0. Preparación (una sola vez)

1. Configura AWS y GitHub siguiendo [`DEPLOY-AWS.md`](DEPLOY-AWS.md) (bucket privado, CloudFront con OAC, rol OIDC, variables).
2. Protege `main`: PR obligatorio, 1 aprobación y los tres checks (`API (pruebas y build)`, `Web (build)`, `Secretos (escaneo)`).
3. Etiqueta la versión que tengas estable cuando exista: `git tag v1.0.0 && git push --tags`.

## Paso 1. Repositorio listo

El README ya trae requisitos, configuración, cómo ejecutar, API, seguridad y trazabilidad. Esta práctica añade la **estrategia de ramas** (sección «Estrategia de ramas y flujo de trabajo» del README).

Evidencia: enlace al repositorio y captura del README.

## Paso 2. El pipeline de integración continua

Se sube todo esto en una rama `feature/ci-cd-aws` y se abre un PR. El PR ya ejecuta `ci.yml`.

| Job | Pasos | Qué comprueba |
|---|---|---|
| `api` | `npm ci` → `npm test` → `npm run test:e2e` → `npm run build` | Que las dependencias se instalan de forma reproducible (`ci` usa el lockfile); que las reglas de negocio funcionan (fechas, superposición de préstamos, roles); que los controladores responden 200/400/401/403; que el proyecto compila |
| `web` | `npm ci` → `npm run build` (`tsc -b` + `vite build`) | Que los tipos de TypeScript son correctos y que la web se puede empaquetar |
| `secretos` | `scripts/check-secrets.sh repo` | Que no hay `.env`, `sb_secret_`, claves de AWS, llaves privadas, JWT `service_role` ni cadenas `postgres://` con contraseña |

Evidencia: enlace a la ejecución en verde y captura de los tres jobs.

## Paso 3. Fallo controlado (rojo → corrección → verde)

La regla R1 dice que dos préstamos se superponen **incluyendo los extremos** (el mismo día de fin e inicio cuenta como ocupado). El parche cambia `<=` por `<` en `seSuperpone` y rompe esa regla; la prueba `rango.spec.ts › cuenta los extremos como ocupados` lo detecta.

```bash
git switch main && git pull
git switch -c demo/fallo-controlado
git apply docs/evidencias/fallo-controlado.patch
git commit -am "demo: romper la regla de superposición para ver fallar CI"
git push -u origin demo/fallo-controlado
```

Abre el PR hacia `main`. Debe quedar **rojo** en el job `API (pruebas y build)`, paso `Pruebas unitarias`. Guarda:

- el enlace a la ejecución fallida y una captura del PR con ✗,
- una captura del log del paso que falla (el nombre de la prueba y `expected false to be true` o similar),
- el hecho de que los pasos siguientes del job (`test:e2e` y `Build`) quedaron omitidos y de que `Web` y `Secretos` siguieron en verde.

Corrige revirtiendo el parche y vuelve a subir:

```bash
git apply -R docs/evidencias/fallo-controlado.patch
git commit -am "fix: restaurar la regla de superposición (extremos incluidos)"
git push
```

Guarda el enlace y la captura de la ejecución **verde** del mismo PR.

**Cómo explicarlo en el informe (análisis del fallo):**

1. Qué se cambió y por qué es un error de negocio: un recurso se podría prestar dos veces el mismo día.
2. Qué paso lo detectó y qué dice el log: la prueba que protege la regla R1.
3. Por qué el pipeline impidió la integración: el check obligatorio en rojo bloquea el merge.
4. Cómo se corrigió y qué comprobó cada paso en la ejecución verde.

Traza: criterio de aceptación «sin solapamiento de fechas» ← prueba `rango.spec.ts` ← PR `demo/fallo-controlado`.

## Paso 4. Despliegue en AWS

Fusiona a `main` (primero el PR del pipeline, después el PR del paso 3, con la revisión del paso 6). Cada merge dispara `deploy.yml`:

1. Corre CI.
2. Compila la web con las variables públicas de Supabase.
3. Escanea el build en busca de secretos.
4. Escribe `version.json` con el commit.
5. Sube `assets/` con caché larga y el resto sin caché.
6. Invalida CloudFront y espera a que termine.
7. Ejecuta la prueba de humo.
8. Escribe el resumen: versión publicada y versión anterior.

Evidencia: enlace a la ejecución, captura del resumen y de la URL de CloudFront funcionando.

## Paso 5. Verificar, registros y volver a una versión estable

### Recorrido principal y caso de error

La prueba de humo (`scripts/smoke-test.sh`) verifica sola:

| Comprobación | Tipo |
|---|---|
| `GET /` responde 200 y trae la app | Recorrido principal |
| `/version.json` coincide con el commit desplegado | Recorrido principal |
| El JavaScript carga con tipo y caché correctos | Recorrido principal |
| Una ruta interna de la SPA devuelve `index.html` | Recorrido principal |
| HTTP redirige a HTTPS | Recorrido principal |
| El bucket responde 403 al acceso directo | **Caso de error esperado** |
| La API sin sesión responde 401 en `/recursos` (si `API_URL` existe) | **Caso de error esperado** |

Además, a mano y con captura, en la URL de CloudFront:

- **Error:** en el login, escribe un correo con una contraseña equivocada → aparece «Correo o contraseña incorrectos.» y el formulario conserva lo escrito (RNF-02).
- **Recorrido:** con un usuario de prueba inicia sesión, consulta el catálogo y solicita un préstamo. Esto necesita la API desplegada (ver `DEPLOY-AWS.md`, sección 7). Si aún no está, documenta el recorrido con la API en local y dilo en el informe.

No pongas contraseñas ni claves en las capturas: recorta o difumina.

### Versión desplegada y registros

- **Versión:** `https://<tu-url>/version.json` y el resumen de la ejecución.
- **Registros:** el log de cada paso en Actions (conserva el enlace), el historial de despliegues de Settings → Environments → `production` y, si quieres ir más lejos, los registros estándar de CloudFront.

### Volver a una versión estable (haz el simulacro y deja captura)

1. Anota la «Versión anterior» del resumen del último despliegue.
2. Actions → **Deploy web a AWS** → Run workflow → `ref` = ese commit (y `omitir_ci` si ya pasó CI).
3. Cuando termine, abre `/version.json`: debe mostrar el commit estable.

## Paso 6. Revisión entre compañeros

- Cada PR usa la plantilla (`.github/pull_request_template.md`): historia, criterio de aceptación y prueba.
- Un compañero lo revisa y lo aprueba en GitHub («Review changes → Approve»), con al menos un comentario concreto.
- Para el informe, una fila por PR: historia · criterio · prueba · autor · revisor · enlace.

Propuesta de filas:

| PR | Historia | Criterio de aceptación | Prueba | Revisor |
|---|---|---|---|---|
| `feature/ci-cd-aws` | Práctica DevOps (CI/CD) | Cada cambio se prueba y compila; `main` se publica | Ejecuciones de `ci.yml` y `deploy.yml` | |
| `demo/fallo-controlado` | HU-03 Solicitar préstamo | Dos préstamos confirmados no se superponen (extremos incluidos) | `rango.spec.ts › cuenta los extremos como ocupados` | |

## Qué entregar en Moodle

- **PDF de 4–6 páginas:** el informe del documento compartido (Introducción · Arquitectura · Etapas del pipeline · Evidencia fallida/corregida · Prueba del producto · Recuperación · Secretos · Revisión · Aportes). Se exporta como PDF.
- **Texto en línea:** repositorio, `ci.yml` y `deploy.yml`, enlaces a las ejecuciones (fallida, corregida y despliegue), URL de CloudFront, enlace de la demo y un párrafo con tu aporte individual. Si algún enlace pide permisos, dale acceso al docente antes de enviar.
- Incorpora las evidencias al informe de la práctica integradora.

## Guion de la demo (3–5 minutos)

| Tiempo | Qué mostrar |
|---|---|
| 0:00 | La app en la URL de CloudFront y `version.json` |
| 0:30 | `ci.yml`: los tres jobs y qué comprueba cada uno |
| 1:15 | El PR del fallo controlado en rojo y el log de la prueba que falla |
| 2:00 | La corrección y el PR en verde; la aprobación del compañero |
| 2:45 | `deploy.yml`: ejecución con resumen (versión nueva y anterior) y prueba de humo |
| 3:30 | Caso de error: contraseña equivocada y bucket en 403 |
| 4:00 | Rollback: Run workflow con la versión anterior y `version.json` cambiando |
| 4:30 | Secretos: variables y secretos de GitHub (sin mostrar valores) y rol OIDC |
