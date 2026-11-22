// ---------- Función 1: recircula-spa (behavior por defecto "*", viewer request) ----------
// Reemplaza las "respuestas de error personalizadas" 403/404 -> index.html.
// Esas respuestas son de TODA la distribución y taparían los 403/404 reales de la API.
function handler(event) {
  var r = event.request;
  if (!r.uri.includes('.')) r.uri = '/index.html';
  return r;
}

// ---------- Función 2: recircula-api-strip (behavior "/api/*", viewer request) ----------
// Igual que el proxy de Vite: /api/recursos -> /recursos
function handler(event) {
  var r = event.request;
  r.uri = r.uri.replace(/^\/api/, '') || '/';
  return r;
}
