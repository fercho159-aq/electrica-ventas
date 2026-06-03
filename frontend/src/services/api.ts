import type {
  AuthTokens, Lead, LeadsFilters, Mensaje, Cotizacion, CotizacionItem,
  KpiVendedor, DashboardResumen, Canal, AsignacionRegla, PaginatedResponse,
} from '../types'

const BASE = import.meta.env.VITE_API_URL ?? ''

// ─── Token storage ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'ev_tokens'

export function getTokens(): AuthTokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthTokens) : null
  } catch {
    return null
  }
}

export function setTokens(tokens: AuthTokens): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// ─── HTTP client ─────────────────────────────────────────────────────────────
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getTokens()
  if (!tokens?.refreshToken) return null

  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  })

  if (!res.ok) {
    clearTokens()
    window.location.href = '/login'
    return null
  }

  const data = (await res.json()) as { accessToken: string }
  const updated = { ...tokens, accessToken: data.accessToken }
  setTokens(updated)
  return data.accessToken
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const tokens = getTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 && retry) {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push(async (newToken: string) => {
          try {
            resolve(await apiFetch<T>(path, options, false))
          } catch (err) {
            reject(err)
          }
        })
      })
    }

    isRefreshing = true
    const newToken = await refreshAccessToken()
    isRefreshing = false

    if (newToken) {
      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []
      return apiFetch<T>(path, options, false)
    }

    throw new Error('Session expired')
  }

  if (!res.ok) {
    const error = (await res.json().catch(() => ({ error: res.statusText }))) as { error: string }
    throw new Error(error.error ?? `HTTP ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<AuthTokens>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: (refreshToken: string) =>
    apiFetch<void>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
}

// ─── Leads ────────────────────────────────────────────────────────────────────
export const leadsApi = {
  list: (filters: LeadsFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.etapa) params.set('etapa', filters.etapa)
    if (filters.asignado_a) params.set('asignado_a', filters.asignado_a)
    if (filters.canal_id) params.set('canal_id', filters.canal_id)
    if (filters.prioridad) params.set('prioridad', filters.prioridad)
    if (filters.buscar) params.set('buscar', filters.buscar)
    if (filters.page) params.set('page', String(filters.page))
    if (filters.limit) params.set('limit', String(filters.limit))
    return apiFetch<PaginatedResponse<Lead>>(`/api/leads?${params}`)
  },

  get: (id: string) => apiFetch<Lead>(`/api/leads/${id}`),

  create: (data: Partial<Lead>) =>
    apiFetch<Lead>('/api/leads', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Partial<Lead>) =>
    apiFetch<Lead>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  updateEtapa: (id: string, etapa: string) =>
    apiFetch<Lead>(`/api/leads/${id}/etapa`, { method: 'PATCH', body: JSON.stringify({ etapa }) }),

  asignar: (id: string, vendedorId: string) =>
    apiFetch<Lead>(`/api/leads/${id}/asignar`, { method: 'PATCH', body: JSON.stringify({ vendedor_id: vendedorId }) }),
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────
export const mensajesApi = {
  list: (leadId: string, cursor?: string) => {
    const params = cursor ? `?cursor=${cursor}` : ''
    return apiFetch<{ data: Mensaje[]; nextCursor?: string }>(`/api/leads/${leadId}/mensajes${params}`)
  },

  send: (leadId: string, data: { texto: string; canal_id: string; tipo: 'whatsapp' | 'email' }) =>
    apiFetch<Mensaje>(`/api/leads/${leadId}/mensajes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ─── Cotizaciones ─────────────────────────────────────────────────────────────
export const cotizacionesApi = {
  list: (filters: { vendedor_id?: string; estado?: string; lead_id?: string } = {}) => {
    const params = new URLSearchParams(filters as Record<string, string>)
    return apiFetch<PaginatedResponse<Cotizacion>>(`/api/cotizaciones?${params}`)
  },

  create: (data: { lead_id: string; vigencia_dias?: number; notas?: string; items: Omit<CotizacionItem, 'id' | 'cotizacion_id'>[] }) =>
    apiFetch<Cotizacion>('/api/cotizaciones', { method: 'POST', body: JSON.stringify(data) }),

  updateEstado: (id: string, estado: string) =>
    apiFetch<Cotizacion>(`/api/cotizaciones/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),

  getPdfUrl: (id: string) => `${BASE}/api/cotizaciones/${id}/pdf`,

  enviar: (id: string, canal: 'whatsapp' | 'email') =>
    apiFetch<void>(`/api/cotizaciones/${id}/enviar`, { method: 'POST', body: JSON.stringify({ canal }) }),
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
export const kpisApi = {
  list: (periodo: 'mes' | 'semana' | 'hoy' = 'mes') =>
    apiFetch<KpiVendedor[]>(`/api/kpis?periodo=${periodo}`),
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  resumen: () => apiFetch<DashboardResumen>('/api/dashboard/resumen'),
}

// ─── Canales ─────────────────────────────────────────────────────────────────
export const canalesApi = {
  list: () => apiFetch<Canal[]>('/api/canales'),
  actividad: () => apiFetch<DashboardResumen['actividad_canales']>('/api/canales/actividad'),
}

// ─── Asignación ───────────────────────────────────────────────────────────────
export const asignacionApi = {
  reglas: () => apiFetch<AsignacionRegla[]>('/api/asignacion/reglas'),
  updateRegla: (canalId: string, modo: string) =>
    apiFetch<AsignacionRegla>(`/api/asignacion/reglas/${canalId}`, { method: 'PUT', body: JSON.stringify({ modo }) }),
  autoAsignar: () => apiFetch<{ asignados: number }>('/api/asignacion/auto', { method: 'POST' }),
}
