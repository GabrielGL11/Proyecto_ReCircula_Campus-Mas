# Despliegue de la web en AWS (S3 + CloudFront)

Qué se publica: **solo `web/`** (archivos estáticos de Vite). La API de NestJS **no** puede vivir en S3; ver la sección 7.

Flujo: `push a main` → CI (API + web + secretos) → build de la web → escaneo del build → `aws s3 sync` → invalidación de CloudFront → prueba de humo (`scripts/smoke-test.sh`).

Sustituye `<CUENTA>`, `<REGION>`, `<BUCKET>` y `<DIST_ID>` por tus valores.

## 1. Bucket S3 (privado)

- Nombre: p. ej. `recircula-campus-web`. Región: la más cercana a tus usuarios.
- **Block all public access: activado.** Nadie accede al bucket directo; solo CloudFront. (La prueba de humo comprueba que el acceso directo da 403.)
- No actives "Static website hosting": CloudFront lo lee con OAC.

## 2. Distribución CloudFront

- Origin: el bucket S3 (no el endpoint de website) con **Origin access control (OAC)**.
- Default root object: `index.html`.
- Viewer protocol policy: Redirect HTTP to HTTPS.
- Cache policy: `CachingOptimized`.
- **Rutas de la SPA:** una CloudFront Function en el behavior por defecto (`recircula-spa`, en [`cloudfront-functions.js`](cloudfront-functions.js)) devuelve `index.html` para las rutas sin extensión. Antes se usaban *Custom error responses* 403/404 → `/index.html`, pero ya no: tapan los errores reales de la API (ver sección 7).

Al crearla, AWS ofrece copiar la política del bucket para OAC. Equivale a:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PermitirCloudFront",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::<BUCKET>/*",
    "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::<CUENTA>:distribution/<DIST_ID>" } }
  }]
}
```

## 3. Acceso de GitHub Actions a AWS (OIDC, sin claves)

1. IAM → Identity providers → Add provider → **OpenID Connect**
   - URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
2. IAM → Roles → crear `github-deploy-recircula` con esta **trust policy**:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<CUENTA>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:GabrielGL11/Proyecto_ReCircula_Campus-Mas:environment:production" }
    }
  }]
}
```

   El workflow usa `environment: production`, por eso el `sub` termina en `environment:production`.

3. Permisos mínimos del rol (policy inline). Ojo: ahora incluye `cloudfront:GetInvalidation`, que el workflow necesita para esperar a que termine la invalidación:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::<BUCKET>" },
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::<BUCKET>/*" },
    { "Effect": "Allow", "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], "Resource": "arn:aws:cloudfront::<CUENTA>:distribution/<DIST_ID>" }
  ]
}
```

## 4. Configuración en GitHub

Settings → Environments → crear **`production`** (opcional: exigir aprobación de un revisor).

Settings → Secrets and variables → Actions:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | ARN del rol `github-deploy-recircula` |
| Variable | `AWS_REGION` | p. ej. `us-east-1` |
| Variable | `S3_BUCKET` | nombre del bucket |
| Variable | `CLOUDFRONT_DISTRIBUTION_ID` | ID de la distribución (`E…`) |
| Variable | `SITE_URL` | `https://dxxxxxxxxxxxx.cloudfront.net` (sin barra final) |
| Variable | `VITE_SUPABASE_URL` | URL del proyecto de Supabase |
| Variable | `VITE_SUPABASE_KEY` | clave **publishable** de Supabase |
| Variable (opcional) | `API_URL` | URL de la API ya desplegada; activa las pruebas de la API en la verificación |

Mientras `S3_BUCKET` no exista, el job `deploy` se omite y solo corre el CI. Con `S3_BUCKET` definido, el workflow exige el resto de variables y falla con un mensaje claro si falta alguna.

**Nunca** pongas `DATABASE_URL`, `service_role` ni `sb_secret_` aquí: la web solo usa la clave pública, y el workflow se detiene si detecta una clave secreta.

### Proteger `main` y exigir revisión

Settings → Branches → regla para `main`:

- Require a pull request before merging, con **1 aprobación** (la revisión del compañero).
- Require status checks: `API (pruebas y build)`, `Web (build)` y `Secretos (escaneo)`.

## 5. Primer despliegue

1. Sube `.github/workflows/`, `scripts/` y `docs/` en una rama y abre un PR: debe correr **CI**.
2. Fusiona a `main`: corre **Deploy web a AWS**.
3. En el resumen de la ejecución verás la versión publicada. Abre `SITE_URL`.

Problemas típicos:

| Síntoma | Causa probable |
|---|---|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | El `sub` del trust policy no coincide con repo/entorno |
| `AccessDenied` al abrir el sitio | Falta la política del bucket para OAC |
| Pantalla en blanco | Faltan las variables `VITE_SUPABASE_*` en GitHub |
| `AccessDenied` en `wait invalidation-completed` | Falta `cloudfront:GetInvalidation` en el rol |
| La prueba de humo dice "ruta interna de la SPA respondió 403/404" | Falta asociar la función `recircula-spa` al behavior por defecto (Viewer request) |
| La prueba de humo dice "el bucket respondió 200" | El bucket es público: activa Block all public access |

## 6. Volver a una versión estable (rollback)

Cada despliegue publica `/version.json` con el commit, y el resumen de la ejecución muestra la **versión anterior**. Para volver:

1. Actions → **Deploy web a AWS (S3 + CloudFront)** → **Run workflow**.
2. En `ref` escribe el commit (o etiqueta) de la versión estable. Si ya pasó CI, marca `omitir_ci` para volver más rápido.
3. Run workflow. Compila ese commit, lo publica y la prueba de humo comprueba que `/version.json` muestra ese commit.

Alternativa sin escribir nada: abre una ejecución anterior que salió bien y pulsa **Re-run all jobs**.

Se puede volver a cualquier commit que ya se haya desplegado antes (contiene `scripts/`, que el despliegue necesita). Conviene etiquetar las versiones buenas: `git tag v1.0.0 && git push --tags`, y usar la etiqueta en `ref`.

## 7. Y la API

La web llama a `/api/...` (en desarrollo, el proxy de Vite lo manda a `localhost:4200`). En producción la API corre en **AWS Lambda** (imagen de contenedor con Function URL) y CloudFront le envía `/api/*` con un segundo origin y un behavior propio. Los pasos completos (imagen en ECR, función, variables de entorno, CloudFront Functions, behavior y verificación) están en [`DEPLOY-API-AWS.md`](DEPLOY-API-AWS.md).

Cuando la API esté arriba, define la variable `API_URL` = `https://<tu-dominio>/api` y la verificación comprobará que `GET /auth/yo` y `GET /recursos` sin sesión respondan 401 en JSON.

Importante: con la API detrás de la misma distribución **no** debe haber respuestas de error personalizadas 403/404 → `/index.html`, porque taparían los 403/404 reales de la API. Las rutas de la SPA las resuelve la función `recircula-spa` (ver la guía de la API).

Antes de ir a producción: define en Lambda la variable `DB_SSL_CA_BASE64` con el certificado CA de Supabase en base64 para que `api/src/db/db.service.ts` verifique el certificado de la base (ver `DEPLOY-API-AWS.md`).