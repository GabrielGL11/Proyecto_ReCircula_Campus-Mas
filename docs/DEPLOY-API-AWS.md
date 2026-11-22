# Desplegar la API en AWS (Lambda + CloudFront)

La base de datos y el login viven en Supabase, así que no hay nada que "subir" de la base: la API solo
necesita `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_KEY`.

La API (NestJS) se empaqueta como imagen de contenedor y corre en **AWS Lambda** con una **Function URL**
pública. Dentro de la imagen, el [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
traduce las peticiones de Lambda a HTTP normal, así que el código de NestJS no cambia.
CloudFront manda `/api/*` a Lambda y el resto a S3, todo bajo el mismo dominio (sin CORS).

Se eligió Lambda y no App Runner porque su capa gratuita permanente cubre el uso del proyecto
(App Runner cobra la memoria aprovisionada aunque no haya tráfico).

Valores de ejemplo: región `us-east-2`. Cámbialos si usas otra.

## 1. Construir y subir la imagen (AWS CloudShell)

```bash
REGION=us-east-2
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# solo la primera vez
aws ecr create-repository --repository-name recircula-api --region $REGION

aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

git clone https://github.com/GabrielGL11/Proyecto_ReCircula_Campus-Mas.git   # o git pull si ya existe
cd Proyecto_ReCircula_Campus-Mas/api

docker build -t recircula-api .
docker tag recircula-api:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/recircula-api:latest
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/recircula-api:latest
```

Confirma que el push terminó con una línea `latest: digest: sha256:...`.

## 2. Crear la función en Lambda

Consola → Lambda (región Ohio) → Create function → **Container image**:

- Nombre `recircula-api`, imagen `recircula-api:latest` (Browse images), arquitectura **x86_64**.
- En "Configuración adicional → Redes" activa **URL de función** con autenticación **NONE**
  (o créala después en Configuration → Function URL).

Cuando se cree:

- Configuration → General configuration → Edit: memoria **1024 MB**, timeout **30 s**
  (el primer arranque de NestJS tarda varios segundos).
- Configuration → Environment variables:
  - `SUPABASE_URL` = `https://<ref>.supabase.co`
  - `SUPABASE_KEY` = clave **publishable**
  - `DATABASE_URL` = cadena del **Session pooler** de Supabase (Connect → Session pooler)
  - `DB_SSL_CA_BASE64` = certificado CA de Supabase en base64 (ver "Costos y pendientes")

Prueba la Function URL (`https://xxxx.lambda-url.us-east-2.on.aws`):

```bash
curl https://xxxx.lambda-url.us-east-2.on.aws/            # ReCircula Campus API
curl -i https://xxxx.lambda-url.us-east-2.on.aws/recursos  # 401 en JSON (correcto, sin sesión)
```

La primera petición tarda unos segundos (arranque en frío). Si falla, revisa Monitor → CloudWatch logs.

## 3. CloudFront

**3.1 Funciones** (CloudFront → Functions; runtime `cloudfront-js-2.0`; Save y luego **Publish** en cada una).
El código está en [`cloudfront-functions.js`](cloudfront-functions.js): `recircula-spa` y `recircula-api-strip`.

**3.2 Origin:** en la distribución → Origins → Create origin:
- Origin domain: el host de la Function URL, sin `https://` ni barra final.
- Protocol: **HTTPS only**. Origin access control: None.

**3.3 Behavior `/api/*`:** Behaviors → Create behavior:
- Path pattern `/api/*`, origin de Lambda, Redirect HTTP to HTTPS.
- Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**.
- Cache policy `CachingDisabled`; origin request policy `AllViewerExceptHostHeader`.
- Viewer request: CloudFront Function `recircula-api-strip`.

**3.4 Behavior por defecto (`*`):** Viewer request → CloudFront Function `recircula-spa`.

**3.5 Quitar las páginas de error** 403 y 404 → `/index.html` (pestaña Error pages).
Son de toda la distribución y convertirían los 403/404 reales de la API en HTML; `recircula-spa` las reemplaza
para las rutas de la SPA. Hazlo después de 3.4.

Espera a que la distribución salga de "Deploying".

## 4. Verificar

```bash
curl -i https://<dominio>.cloudfront.net/api/recursos     # 401 en JSON, no HTML
curl -i https://<dominio>.cloudfront.net/ruta/de/la/app   # 200 con index.html
```

Luego entra a la web con sesión: el catálogo debe cargar. En GitHub agrega la variable `API_URL` =
`https://<dominio>.cloudfront.net/api` para que la prueba de humo del despliegue también valide la API.

## 5. Actualizar la API tras un cambio de código

Repite el paso 1 (`git pull`, `docker build`, `tag`, `push`) y en Lambda → Image → **Deploy new image**
para que la función use la imagen nueva.

## Costos y pendientes

- Lambda: capa gratuita de 1 M de peticiones y 400 000 GB-s al mes. ECR cobra centavos por guardar imágenes:
  borra las que queden sin tag.
- Certificado de la base de datos: `api/src/db/db.service.ts` verifica el certificado de Supabase cuando existe la
  variable `DB_SSL_CA_BASE64`. Para configurarla: descarga el CA (Database → Settings → SSL → Download certificate),
  conviértelo a base64 de una sola línea y guárdalo como variable de entorno de Lambda.
  Linux/CloudShell: `base64 -w0 prod-ca-2021.crt`. PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("prod-ca-2021.crt"))`.
  Sin esa variable la API sigue funcionando pero no verifica el certificado.