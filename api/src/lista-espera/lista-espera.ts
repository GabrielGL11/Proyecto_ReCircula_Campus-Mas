export type EstadoEspera = 'en_espera' | 'promovida' | 'cancelada';

export interface EntradaEspera {
  id: number;
  recursoId: number;
  recursoNombre: string;
  solicitanteId: number;
  rango: { inicio: string; fin: string };
  estado: EstadoEspera;
  solicitudId?: number | null;
  creadoEn: string;
}

export interface CrearEsperaDto {
  recursoId?: number;
  inicio?: string;
  fin?: string;
}
