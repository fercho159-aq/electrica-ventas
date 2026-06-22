// Cliente API + WebSocket para Electrica Ventas
// Se carga como script antes de los componentes JSX

// Auto-detección de entorno:
//  - Local (file:// o localhost): backend en localhost:3000
//  - Producción (mismo dominio, nginx proxetea /api y /ws): origen relativo
var IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
var API_BASE = IS_LOCAL ? 'http://localhost:3000' : '';   // '' = mismo origen
var WS_BASE = IS_LOCAL
  ? 'ws://localhost:3000'
  : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

// ─── Cliente HTTP ────────────────────────────────────────────────────────────
window.ApiClient = {
  token: null,
  userId: null,
  userRol: null,
  userName: null,

  async login(email, password) {
    const r = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || 'Credenciales incorrectas');
    }
    const data = await r.json();
    this.token     = data.accessToken;
    this.userId    = data.usuario?.id    || data.user?.id;
    this.userRol   = data.usuario?.rol   || data.user?.rol;
    this.userName  = data.usuario?.nombre || data.user?.nombre;
    return data;
  },

  async _fetch(path, opts = {}) {
    const r = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...(opts.headers || {}),
      },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    if (r.status === 204) return null;
    return r.json();
  },

  // Leads
  getLeads(filters = {}) {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    return this._fetch(`/api/leads?${p}`);
  },
  getLead(id)         { return this._fetch(`/api/leads/${id}`); },
  updateEtapa(id, e, motivo) {
    const body = { etapa: e };
    if (motivo) body.motivo_no_cierre = motivo;
    return this._fetch(`/api/leads/${id}/etapa`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  asignarLead(id, vId){ return this._fetch(`/api/leads/${id}/asignar`, { method: 'PATCH', body: JSON.stringify({ vendedor_id: vId }) }); },
  // PATCH genérico de lead (notas, clasificación, datos)
  updateLead(id, patch) { return this._fetch(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); },
  clasificarLead(id, clasificacion) { return this.updateLead(id, { clasificacion }); },
  // Cerró en mostrador (item 9)
  cerrarMostrador(id, ticket) { return this._fetch(`/api/leads/${id}/mostrador`, { method: 'PATCH', body: JSON.stringify(ticket ? { ticket } : {}) }); },

  // Mensajes
  // URL para <img>/<a> de media de WhatsApp (token por query porque <img> no manda headers)
  mediaSrc(mensajeId) {
    return `${API_BASE}/api/media/${mensajeId}?token=${this.token}`;
  },
  // Envía un archivo (imagen/audio/video/documento/sticker) por WhatsApp
  sendMediaFile(leadId, file, caption) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataB64 = String(reader.result).split(',')[1];
        this._fetch(`/api/leads/${leadId}/media`, {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name,
            mime: file.type || 'application/octet-stream',
            dataB64,
            caption: caption || undefined,
          }),
        }).then(resolve).catch(reject);
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  },
  getMensajes(leadId, cursor) {
    const p = cursor ? `?cursor=${cursor}` : '';
    return this._fetch(`/api/leads/${leadId}/mensajes${p}`);
  },
  sendMensaje(leadId, texto, canalId, tipo) {
    return this._fetch(`/api/leads/${leadId}/mensajes`, {
      method: 'POST',
      body: JSON.stringify({ texto, canal_id: canalId, tipo }),
    });
  },

  // Canales
  getCanales() { return this._fetch('/api/canales'); },

  // Dashboard
  getDashboard(excluirInformativos = false) {
    const q = excluirInformativos ? '?excluir_informativos=true' : '';
    return this._fetch(`/api/dashboard/resumen${q}`);
  },
  getEmbudo(excluirInformativos = false) {
    const q = excluirInformativos ? '?excluir_informativos=true' : '';
    return this._fetch(`/api/dashboard/embudo${q}`);
  },
  getActividadCanales() { return this._fetch('/api/canales/actividad'); },

  // Cotizaciones
  getCotizaciones(f = {}) {
    const p = new URLSearchParams(f);
    return this._fetch(`/api/cotizaciones?${p}`);
  },
  getCotizacion(id) { return this._fetch(`/api/cotizaciones/${id}`); },
  crearCotizacion(payload) { return this._fetch('/api/cotizaciones', { method: 'POST', body: JSON.stringify(payload) }); },
  updateCotizacionEstado(id, estado) { return this._fetch(`/api/cotizaciones/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }); },
  // Cierre parcial/total con monto (item 8)
  cerrarCotizacion(id, payload) { return this._fetch(`/api/cotizaciones/${id}/cierre`, { method: 'PATCH', body: JSON.stringify(payload) }); },
  enviarCotizacion(id, canal, canalId) {
    const body = { canal };
    if (canalId) body.canal_id = canalId;
    return this._fetch(`/api/cotizaciones/${id}/enviar`, { method: 'POST', body: JSON.stringify(body) });
  },
  // Abre el PDF (auth por header → blob URL, no por query)
  async cotizacionPdfUrl(id) {
    const r = await fetch(`${API_BASE}/api/cotizaciones/${id}/pdf`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!r.ok) throw new Error('No se pudo generar el PDF');
    return URL.createObjectURL(await r.blob());
  },

  // KPIs
  getKpis(periodo = 'mes') { return this._fetch(`/api/kpis?periodo=${periodo}`); },

  // Auto-asignar
  autoAsignar() { return this._fetch('/api/asignacion/auto', { method: 'POST' }); },

  // Remarketing (Fase 2: items 13-15,17)
  getSegmentos()        { return this._fetch('/api/remarketing/segmentos'); },
  getSegmento(key)      { return this._fetch(`/api/remarketing/segmentos/${key}`); },
  getPlantillas()       { return this._fetch('/api/remarketing/plantillas'); },
  recontactar(payload)  { return this._fetch('/api/remarketing/recontactar', { method: 'POST', body: JSON.stringify(payload) }); },
  async exportSegmentoCsv(segmento) {
    const r = await fetch(`${API_BASE}/api/remarketing/export?segmento=${segmento}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!r.ok) throw new Error('No se pudo exportar');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `segmento-${segmento}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

// ─── WebSocket ───────────────────────────────────────────────────────────────
window.WsClient = {
  ws: null,
  _token: null,
  _handlers: {},
  _reconnectDelay: 1000,

  connect(token) {
    this._token = token;
    this._reconnectDelay = 1000;
    this._connect();
  },

  _connect() {
    if (this.ws) { try { this.ws.close(); } catch {} }
    try {
      this.ws = new WebSocket(`${WS_BASE}/ws?token=${this._token}`);

      this.ws.onopen = () => {
        this._reconnectDelay = 1000;
        this._emit({ type: 'connected' });
        // keepalive
        this._ping = setInterval(() => {
          if (this.ws && this.ws.readyState === 1)
            this.ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };

      this.ws.onmessage = (e) => {
        try { this._emit(JSON.parse(e.data)); } catch {}
      };

      this.ws.onclose = () => {
        clearInterval(this._ping);
        this._emit({ type: 'disconnected' });
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
        setTimeout(() => this._connect(), this._reconnectDelay);
      };

      this.ws.onerror = () => { try { this.ws.close(); } catch {} };
    } catch {
      setTimeout(() => this._connect(), this._reconnectDelay);
    }
  },

  on(type, fn) {
    if (!this._handlers[type]) this._handlers[type] = new Set();
    this._handlers[type].add(fn);
    return () => this._handlers[type]?.delete(fn);
  },

  // El backend publica tipos en español; el frontend escucha en inglés.
  // Mapeo backend -> tipos que escuchan las pantallas.
  _aliasFor(type) {
    return {
      mensaje_entrante: 'new_message',
      mensaje_saliente: 'new_message',
      etapa_changed:    'lead_updated',
      lead_assigned:    'lead_updated',
      recordatorio_cotizacion: 'lead_updated',
    }[type];
  },

  _emit(event) {
    const types = [event.type, this._aliasFor(event.type)].filter(Boolean);
    for (const t of types) {
      this._handlers[t]?.forEach(fn => {
        try { fn(event); } catch {}
      });
    }
  },

  get isConnected() {
    return this.ws?.readyState === 1;
  },
};

// ApiClient y WsClient ya están en window
