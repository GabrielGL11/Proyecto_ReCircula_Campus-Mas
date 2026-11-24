import type { Rango } from '../recursos/rango.js';

// Ciclo de vida de la solicitud (coincide con la tabla solicitudes de la base):
// HU-03 la crea "pendiente"; HU-04, HU-05 y HU-11 harán el resto de transiciones.
export type EstadoSolicitud = 'pendiente' | 'confirmada' | 'rechazada' | 'devuelta' | 'en_espera_mantenimiento';

export interface Solicitud {
  id: number;
  recursoId: number;
  recursoNombre: string;
  solicitanteId: number;
  rango: Rango;
  estado: EstadoSolicitud;
  fechaDevolucionReal?: string;
}

// El solicitante NO viaja en el body: sale del token (RNF-03).
export interface CrearSolicitudDto {
  recursoId?: number;
  inicio?: string;
  fin?: string;
}
