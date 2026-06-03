export type Rol = 'gerente' | 'vendedor'
export type Etapa = 'nuevo' | 'contactado' | 'cotizado' | 'negociacion' | 'cerrado' | 'no_cierre'
export type Prioridad = 'alta' | 'media' | 'baja'
export type CanalTipo = 'whatsapp' | 'email'
export type Direccion = 'entrante' | 'saliente'
export type MensajeOrigen = 'cliente' | 'vendedor' | 'sistema' | 'bot'
export type CotizacionEstado = 'enviada' | 'vista' | 'aceptada' | 'rechazada' | 'pendiente'
export type AsignacionModo = 'round_robin' | 'carga' | 'manual'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  zona?: string
  activo: boolean
  created_at: string
}

export interface Canal {
  id: string
  tipo: CanalTipo
  nombre: string
  numero?: string
  activo: boolean
  created_at: string
}

export interface Lead {
  id: string
  contacto: string
  empresa?: string
  telefono?: string
  email?: string
  canal_id?: string
  canal?: Canal
  etapa: Etapa
  asignado_a?: string
  vendedor?: Pick<Usuario, 'id' | 'nombre' | 'rol' | 'zona'>
  prioridad: Prioridad
  zona?: string
  monto_estimado?: number
  motivo_no_cierre?: string
  notas?: string
  created_at: string
  ultima_interaccion: string
}

export interface Mensaje {
  id: string
  lead_id: string
  canal_id?: string
  canal?: Canal
  direccion: Direccion
  origen: MensajeOrigen
  usuario_id?: string
  usuario?: Pick<Usuario, 'id' | 'nombre'>
  texto?: string
  tipo_media?: string
  media_url?: string
  wa_msg_id?: string
  ts: string
}

export interface Producto {
  id: string
  nombre: string
  descripcion?: string
  precio: number
  unidad: string
  activo: boolean
}

export interface CotizacionItem {
  id: string
  cotizacion_id: string
  producto_id?: string
  nombre: string
  cantidad: number
  precio_unitario: number
}

export interface Cotizacion {
  id: string
  folio: string
  lead_id: string
  lead?: Pick<Lead, 'id' | 'contacto' | 'empresa' | 'email'>
  vendedor_id?: string
  vendedor?: Pick<Usuario, 'id' | 'nombre'>
  estado: CotizacionEstado
  vigencia_dias: number
  notas?: string
  pdf_url?: string
  created_at: string
  items?: CotizacionItem[]
  monto_total?: number
}

export interface KpiVendedor {
  vendedor_id: string
  vendedor_nombre: string
  zona?: string
  msgs: number
  resp_min_avg: number
  cotizaciones: number
  cerradas: number
  ingresos: number
  tasa: number
}

export interface DashboardResumen {
  leads_nuevos_sin_asignar: number
  tasa_conversion: number
  respuesta_promedio_min: number
  ingresos_mtd: number
  actividad_canales: CanalActividad[]
  embudo: EtapaCount[]
}

export interface CanalActividad {
  canal_id: string
  canal_nombre: string
  canal_tipo: CanalTipo
  mensajes_24h: number
  leads_nuevos: number
  tiempo_resp_min: number
}

export interface EtapaCount {
  etapa: Etapa
  count: number
  porcentaje: number
}

export interface AsignacionRegla {
  id: string
  canal_id: string
  modo: AsignacionModo
  updated_at: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  user: Pick<Usuario, 'id' | 'nombre' | 'email' | 'rol' | 'zona'>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

export interface LeadsFilters {
  etapa?: Etapa
  asignado_a?: string
  canal_id?: string
  prioridad?: Prioridad
  buscar?: string
  page?: number
  limit?: number
}

export interface WSEvent {
  type: 'new_message' | 'lead_updated' | 'new_lead' | 'pong'
  leadId?: string
  data?: Mensaje | Lead
  timestamp: string
}
