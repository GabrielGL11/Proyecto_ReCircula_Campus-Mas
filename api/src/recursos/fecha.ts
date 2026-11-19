// Zona horaria del campus (Ecuador, UTC-5, sin horario de verano).
const ZONA = 'America/Guayaquil';

// Fecha de hoy en formato AAAA-MM-DD según la hora de Ecuador.
// Se usa la zona fija y no la del servidor: si el servidor está en UTC, a partir
// de las 7 pm en Ecuador ya sería "mañana" y se aceptaría/rechazaría mal.
// El locale 'en-CA' formatea justo como AAAA-MM-DD.
export function hoy(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
}
