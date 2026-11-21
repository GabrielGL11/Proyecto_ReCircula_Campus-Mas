import type { Rango } from '../recursos/rango.js';

// Ciclo de vida de la solicitud: HU-03 la crea "pendiente"; HU-04 y HU-05 harán el resto de transiciones.
export type EstadoSolicitud = 'pendiente' | 'confirmada' | 'rechazada' | 'devuelta';

export interface Solicitud {
  id: number;
  recursoId: number;
  recursoNombre: string;
  solicitanteId: number;
  rango: Rango;
  estado: EstadoSolicitud;
}

export interface CrearSolicitudDto {
  recursoId?: number;
  inicio?: string;
  fin?: string;
  solicitanteId?: number;
}
