export const ESTADOS_ORDEN = ['abierta', 'en_reparacion', 'resuelta'] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

export function esEstadoOrden(valor: unknown): valor is EstadoOrden {
  return typeof valor === 'string' && (ESTADOS_ORDEN as readonly string[]).includes(valor);
}

// Una orden de reparación nace de una avería (HU-06) y solo avanza
// abierta → en_reparacion → resuelta (la base de datos impide saltar estados).
export interface OrdenReparacion {
  id: number;
  averiaId: number;
  recursoId: number;
  recursoNombre: string;
  descripcion: string;
  estado: EstadoOrden;
  creadaPor: number;
  creadaEn: string;
  actualizadaEn: string;
}

// Avería reportada que todavía no tiene orden: es lo que el coordinador puede abrir.
export interface AveriaSinOrden {
  id: number;
  recursoId: number;
  recursoNombre: string;
  descripcion: string;
  reportadaEn: string;
}

// HU-08 (d): cada cambio de estado guarda la fecha y quién lo hizo.
export interface CambioEstadoOrden {
  id: number;
  ordenId: number;
  estadoAnterior: EstadoOrden | null;
  estadoNuevo: EstadoOrden;
  cambiadoPor: number;
  cambiadoPorNombre: string;
  cambiadoEn: string;
}

// Lo que llega en el body: `unknown` porque el cliente puede mandar cualquier cosa.
export interface AbrirOrdenDto {
  averiaId?: unknown;
}

export interface AvanzarOrdenDto {
  estado?: unknown;
}
