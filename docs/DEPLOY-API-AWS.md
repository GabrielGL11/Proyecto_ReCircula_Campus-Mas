# Desplegar la API en AWS (App Runner) y conectarla a CloudFront

La base de datos ya está en la nube (Supabase), así que no hay que "subirla": la API solo necesita
`DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_KEY`. Lo que falta es que la API esté encendida y que
CloudFront le pase las peticiones `/api/*`.

Valores de ejemplo: región `us-east-1`. Cámbialos si usas otra.

## 1. Construir y subir la imagen (en AWS CloudShell)

```bash
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

aws ecr create-repository --repository-name recircula-api --region $REGION
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

git clone https://github.com/GabrielGL11/Proyecto_ReCircula_Campus-Mas.git
cd Proyecto_ReCircula_Campus-Mas/api        # aquí deben estar el Dockerfile y .dockerignore

docker build -t recircula-api .
docker tag recircula-api:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/recircula-api:latest
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/recircula-api:latest
```

## 2. Crear el servicio en App Runner

Consola → App Runner → Create service:

- Source: Container registry → Amazon ECR → imagen `recircula-api:latest`. Deployment: Manual.
- ECR access role: "Create new service role".
- Port: `4200`.
- Environment variables:
  - `DATABASE_URL` = cadena del **Session pooler** de Supabase (Connect → Session pooler)
  - `SUPABASE_URL` = `https://<ref>.supabase.co`
  - `SUPABASE_KEY` = clave **publishable**
  - `PORT` = `4200`
  - (Mejor: guarda `DATABASE_URL` en Secrets Manager y referénciala como secreto.)
- Health check: protocolo HTTP, path `/`.

Al terminar te da un dominio `xxxx.us-east-1.awsapprunner.com`. Prueba:

```bash
curl https://xxxx.us-east-1.awsapprunner.com/            # ReCircula Campus API
curl -i https://xxxx.us-east-1.awsapprunner.com/recursos  # 401 sin sesión (correcto)
```

Si `/` no responde, mira los logs de App Runner (casi siempre es `DATABASE_URL` mal copiada).

## 3. CloudFront

1. **Quita** las "Custom error responses" de 403 y 404 → `/index.html`.
   Son de toda la distribución y convertirían los 403/404 reales de la API en HTML.
2. Crea las dos funciones de `docs/cloudfront-functions.js` (CloudFront → Functions) y publícalas:
   `recircula-spa` y `recircula-api-strip`.
3. Behavior por defecto (`*`): en Viewer request asocia `recircula-spa`
   (así las rutas de la SPA siguen devolviendo `index.html`).
4. Origins → Create origin: dominio de App Runner, protocolo **HTTPS only**.
5. Behaviors → Create:
   - Path pattern: `/api/*`
   - Origin: el de App Runner
   - Viewer protocol: Redirect HTTP to HTTPS
   - Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
   - Cache policy: `CachingDisabled`
   - Origin request policy: `AllViewerExceptHostHeader`
   - Function association (Viewer request): `recircula-api-strip`
6. Espera a que la distribución quede en "Deployed".

## 4. Verificar

```bash
curl -i https://d5m219p6r60sv.cloudfront.net/api/recursos   # 401 en JSON, no HTML
```

Luego recarga la web con sesión iniciada: el catálogo debe cargar. En GitHub agrega la variable
`API_URL` = `https://d5m219p6r60sv.cloudfront.net/api` para que la prueba de humo también valide la API.

## Pendiente de seguridad

`api/src/db/db.service.ts` sigue con `ssl: { rejectUnauthorized: false }`. Funciona, pero no verifica el
certificado. Para cerrarlo: descarga el certificado CA de Supabase (Database → Settings → SSL), inclúyelo en
la imagen y pásalo como `ssl: { ca }`.
