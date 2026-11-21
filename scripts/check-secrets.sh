#!/usr/bin/env bash
# Busca secretos en el repositorio o en la web ya compilada. Nunca imprime el valor hallado.
#
# Uso:  bash scripts/check-secrets.sh repo            # archivos versionados (git ls-files)
#       bash scripts/check-secrets.sh dist web/dist   # carpeta compilada
#
# Qué busca: .env versionados, sb_secret_..., claves de acceso de AWS (AKIA/ASIA),
# llaves privadas, cadenas postgres:// con contraseña y JWT con role service_role.
set -uo pipefail

modo="${1:-repo}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
hallazgos=0

case "$modo" in
  repo)
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      git ls-files > "$TMP/todos"
    else
      find . -type f -not -path './.git/*' -not -path '*/node_modules/*' | sed 's|^\./||' > "$TMP/todos"
    fi
    # No se escanean ni los lockfiles ni este script (contiene los patrones) ni las plantillas .env.example.
    grep -vE '(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|^scripts/check-secrets\.sh$|\.env\.example$' \
      "$TMP/todos" > "$TMP/archivos"
    if grep -E '(^|/)\.env(\..+)?$' "$TMP/todos" | grep -vE '\.env\.example$' > "$TMP/envs"; then
      while read -r f; do echo "❌ Archivo .env versionado: $f"; hallazgos=$((hallazgos + 1)); done < "$TMP/envs"
    fi
    ;;
  dist)
    dir="${2:-}"
    if [ -z "$dir" ] || [ ! -d "$dir" ]; then
      echo "Uso: bash $0 dist <carpeta>  (la carpeta no existe: '$dir')" >&2
      exit 2
    fi
    find "$dir" -type f > "$TMP/archivos"
    ;;
  *)
    echo "Uso: bash $0 repo | dist <carpeta>" >&2
    exit 2
    ;;
esac

# buscar <nombre> <regex>: lista archivos que coinciden, sin mostrar el contenido.
buscar() {
  local nombre="$1" regex="$2"
  xargs -d '\n' -r grep -IlE -e "$regex" < "$TMP/archivos" 2>/dev/null > "$TMP/coinciden" || true
  while read -r f; do
    [ -n "$f" ] || continue
    echo "❌ $nombre en: $f"
    hallazgos=$((hallazgos + 1))
  done < "$TMP/coinciden"
}

buscar "Clave secreta de Supabase (sb_secret_)" 'sb_secret_[A-Za-z0-9_-]{16,}'
buscar "Clave de acceso de AWS"                  '\b(AKIA|ASIA)[0-9A-Z]{16}\b'
buscar "Llave privada"                           '-----BEGIN [A-Z ]*PRIVATE KEY-----'

# Cadena de conexión con contraseña real (se ignoran las de ejemplo que llevan "TU-").
xargs -d '\n' -r grep -IHE 'postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]]+@' < "$TMP/archivos" 2>/dev/null \
  | grep -v 'TU-' | cut -d: -f1 | sort -u > "$TMP/coinciden" || true
while read -r f; do
  [ -n "$f" ] || continue
  echo "❌ Cadena postgres:// con contraseña en: $f"
  hallazgos=$((hallazgos + 1))
done < "$TMP/coinciden"

# JWT cuyo payload diga role=service_role (las claves anon/publishable sí pueden ir en la web).
xargs -d '\n' -r grep -IoHE 'eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}' < "$TMP/archivos" 2>/dev/null \
  | sort -u > "$TMP/jwts" || true
while IFS= read -r linea; do
  [ -n "$linea" ] || continue
  archivo="${linea%%:eyJ*}"
  token="eyJ${linea#*:eyJ}"
  payload=$(printf '%s' "$token" | cut -d. -f2 | tr '_-' '/+')
  resto=$(( ${#payload} % 4 ))
  [ "$resto" -eq 2 ] && payload="$payload=="
  [ "$resto" -eq 3 ] && payload="$payload="
  if printf '%s' "$payload" | base64 -d 2>/dev/null | grep -qE '"role"[[:space:]]*:[[:space:]]*"service_role"'; then
    echo "❌ JWT con role service_role en: $archivo"
    hallazgos=$((hallazgos + 1))
  fi
done < "$TMP/jwts"

if [ "$hallazgos" -gt 0 ]; then
  echo
  echo "Se encontraron $hallazgos posible(s) secreto(s). Quítalos del código, rota la clave expuesta y vuelve a intentar."
  exit 1
fi
echo "✅ Sin secretos a la vista ($modo)."
