#!/usr/bin/env bash
# Verificación posterior al despliegue (prueba de humo).
#
# Uso:  bash scripts/smoke-test.sh <URL_DEL_SITIO> [SHA_ESPERADO]
#
# Variables opcionales:
#   S3_BUCKET y AWS_REGION  Comprueba el caso de error "el bucket NO es público" (se espera 403).
#   API_URL                 Comprueba la API: GET / = 200 y GET /recursos sin sesión = 401.
#
# Sale con código 1 si algo falla, así el job del pipeline queda en rojo.
set -uo pipefail

SITE="${1:-}"
SHA_ESPERADO="${2:-}"
if [ -z "$SITE" ]; then
  echo "Uso: bash $0 <URL_DEL_SITIO> [SHA_ESPERADO]" >&2
  exit 2
fi
SITE="${SITE%/}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fallos=0
ok()   { echo "✅ $1"; }
fail() { echo "❌ $1"; fallos=$((fallos + 1)); }

# get <url> <cuerpo> <cabeceras>  → imprime el código HTTP. No sigue redirecciones.
# Reintenta: CloudFront puede tardar unos segundos en propagar un cambio.
get() {
  curl -sS --retry 3 --retry-delay 3 --retry-all-errors --max-time 20 \
    -o "$2" -D "$3" -w '%{http_code}' "$1" 2>/dev/null || echo "000"
}
cabecera() { grep -i "^$2:" "$1" | tail -1 | tr -d '\r'; }

echo "Verificando $SITE"
echo

# ---------- Recorrido principal: la app se sirve y es la versión esperada ----------

code=$(get "$SITE/" "$TMP/index.html" "$TMP/index.h")
if [ "$code" = "200" ] && grep -q 'id="root"' "$TMP/index.html"; then
  ok "GET / responde 200 y trae la app (id=\"root\")"
else
  fail "GET / respondió $code (se esperaba 200 con id=\"root\")"
fi

if cabecera "$TMP/index.h" "cache-control" | grep -qi 'no-cache'; then
  ok "index.html se sirve sin caché (cada despliegue se ve de inmediato)"
else
  fail "index.html no trae Cache-Control: no-cache"
fi

code=$(get "$SITE/version.json" "$TMP/version.json" "$TMP/version.h")
publicada=$(sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' "$TMP/version.json" 2>/dev/null)
if [ "$code" != "200" ] || [ -z "$publicada" ]; then
  fail "No se pudo leer /version.json (HTTP $code)"
elif [ -z "$SHA_ESPERADO" ]; then
  ok "Versión publicada: $publicada (sin SHA esperado para comparar)"
elif [ "$publicada" = "$SHA_ESPERADO" ]; then
  ok "La versión publicada es la esperada: ${publicada:0:12}"
else
  fail "Versión publicada ${publicada:0:12} distinta de la esperada ${SHA_ESPERADO:0:12}"
fi

asset=$(grep -oE '/assets/[^"]+\.js' "$TMP/index.html" | head -1)
if [ -z "$asset" ]; then
  fail "index.html no referencia ningún archivo de assets/*.js"
else
  code=$(get "$SITE$asset" "$TMP/asset.js" "$TMP/asset.h")
  tipo=$(cabecera "$TMP/asset.h" "content-type")
  cache=$(cabecera "$TMP/asset.h" "cache-control")
  if [ "$code" = "200" ] && echo "$tipo" | grep -qi 'javascript' && echo "$cache" | grep -qi 'immutable'; then
    ok "El JavaScript ($asset) carga con tipo correcto y caché larga"
  else
    fail "El JavaScript $asset: HTTP $code, ${tipo:-sin content-type}, ${cache:-sin cache-control}"
  fi
fi

# La web es una SPA: una ruta que no es un archivo debe devolver index.html, no un error.
code=$(get "$SITE/ruta/de/la/app" "$TMP/spa.html" "$TMP/spa.h")
if [ "$code" = "200" ] && grep -q 'id="root"' "$TMP/spa.html"; then
  ok "Una ruta interna de la SPA devuelve index.html (respuestas de error personalizadas)"
else
  fail "Una ruta interna de la SPA respondió $code (revisar las respuestas de error 403/404 de CloudFront)"
fi

case "$SITE" in
  https://*)
    code=$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' "http://${SITE#https://}/" 2>/dev/null || echo "000")
    case "$code" in
      301|302|307|308) ok "HTTP redirige a HTTPS ($code)" ;;
      *) fail "HTTP respondió $code (se esperaba una redirección a HTTPS)" ;;
    esac
    ;;
esac

# ---------- Casos de error esperados ----------

if [ -n "${S3_BUCKET:-}" ] && [ -n "${AWS_REGION:-}" ]; then
  code=$(curl -s -o /dev/null --max-time 20 -w '%{http_code}' \
    "https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/index.html" 2>/dev/null || echo "000")
  if [ "$code" = "403" ]; then
    ok "Caso de error: el bucket NO es público (acceso directo a S3 → 403)"
  else
    fail "El bucket respondió $code al acceso directo (se esperaba 403: solo CloudFront debe poder leerlo)"
  fi
else
  echo "⏭  Bucket privado: omitido (define S3_BUCKET y AWS_REGION para comprobarlo)"
fi

if [ -n "${API_URL:-}" ]; then
  API="${API_URL%/}"
  code=$(get "$API/" "$TMP/api.txt" "$TMP/api.h")
  if [ "$code" = "200" ] && grep -q 'ReCircula Campus API' "$TMP/api.txt"; then
    ok "API: GET / responde 200"
  else
    fail "API: GET / respondió $code (se esperaba 200 'ReCircula Campus API')"
  fi
  code=$(get "$API/recursos" "$TMP/api2.txt" "$TMP/api2.h")
  if [ "$code" = "401" ]; then
    ok "Caso de error: la API sin sesión responde 401 en /recursos"
  else
    fail "API: GET /recursos sin sesión respondió $code (se esperaba 401)"
  fi
else
  echo "⏭  API: omitida (define API_URL cuando la API esté desplegada)"
fi

echo
if [ "$fallos" -gt 0 ]; then
  echo "Verificación FALLIDA: $fallos comprobación(es) con error."
  exit 1
fi
echo "Verificación correcta."
