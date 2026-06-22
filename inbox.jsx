// Bandeja unificada conectada al backend real

// ─── Hooks de datos ──────────────────────────────────────────────────────────

// Detecta viewport móvil (≤820px) reactivamente
function useIsMobile() {
  const [m, setM] = React.useState(typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches);
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const on = () => setM(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  return m;
}

function useLeadsAPI(rol, rolVendedor, isLiveMode) {
  const [leads, setLeads] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [wsOnline, setWsOnline] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!isLiveMode) {
      const base = rol === 'gerente' ? LEADS : LEADS.filter(l => l.asignadoA === rolVendedor);
      setLeads(base);
      setLoading(false);
      return;
    }
    try {
      const { data } = await ApiClient.getLeads();
      // Normalize API response to match component expectations
      const normalized = data.map(l => ({
        ...l,
        asignadoA: l.asignado_a,
        ultimaInteraccion: new Date(l.ultima_interaccion).getTime(),
        createdAt: new Date(l.created_at).getTime(),
        tiempoRespMin: null,
        cotizacionEnviada: ['cotizado','negociacion','cerrado','no_cierre'].includes(l.etapa),
        motivoNoCierre: l.motivo_no_cierre,
        montoEstimado: l.monto_estimado,
        productos: [],
      }));
      setLeads(normalized);
    } catch (err) {
      console.warn('[Inbox] API error, using mock:', err.message);
      const base = rol === 'gerente' ? LEADS : LEADS.filter(l => l.asignadoA === rolVendedor);
      setLeads(base);
    } finally {
      setLoading(false);
    }
  }, [rol, rolVendedor, isLiveMode]);

  React.useEffect(() => {
    setLoading(true);
    load();

    if (!isLiveMode) return;

    // Poll every 10s
    const interval = setInterval(load, 10000);

    // WebSocket updates
    const offMsg  = WsClient.on('new_message',   () => load());
    const offLead = WsClient.on('new_lead',      (e) => {
      if (e.data) setLeads(prev => {
        const normalized = {
          ...e.data,
          asignadoA: e.data.asignado_a,
          ultimaInteraccion: new Date(e.data.ultima_interaccion || Date.now()).getTime(),
          createdAt: new Date(e.data.created_at || Date.now()).getTime(),
        };
        return [normalized, ...prev.filter(l => l.id !== normalized.id)];
      });
    });
    const offUpd  = WsClient.on('lead_updated',  () => load());
    const offConn = WsClient.on('connected',     () => setWsOnline(true));
    const offDisc = WsClient.on('disconnected',  () => setWsOnline(false));
    setWsOnline(WsClient.isConnected);

    return () => {
      clearInterval(interval);
      offMsg(); offLead(); offUpd(); offConn(); offDisc();
    };
  }, [load, isLiveMode]);

  const prependLead = (lead) => setLeads(prev => [lead, ...prev.filter(l => l.id !== lead.id)]);

  return { leads, loading, wsOnline, reload: load, prependLead };
}

function useMensajesAPI(lead, isLiveMode) {
  const [msgs, setMsgs] = React.useState([]);
  const [canales, setCanales] = React.useState([]);
  const leadId = lead?.id;

  // Carga (o recarga) los mensajes del lead desde el API.
  const loadMsgs = React.useCallback(() => {
    if (!isLiveMode || !leadId) { setMsgs(CONVERSACION_EJEMPLO); return; }
    ApiClient.getMensajes(leadId)
      .then(({ data }) => {
        // API devuelve DESC (más reciente primero); invertir a cronológico ASC
        const ordered = [...data].reverse();
        const normalized = ordered.map(m => ({
          id: m.id,
          from: m.origen === 'cliente' ? 'cliente' : m.origen === 'sistema' ? 'sistema' : 'vendedor',
          canal: m.canal_tipo === 'email' ? 'email' : 'whatsapp',
          ts: new Date(m.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
          texto: m.texto || '[media]',
          tipoMedia: m.tipo_media || null,
          tieneMedia: !!(m.media_url && String(m.media_url).startsWith('wa_media:')),
          estado: m.estado,
          errorDetalle: m.error_detalle,
          _raw: m,
        }));
        setMsgs(normalized);
      })
      .catch(() => setMsgs(CONVERSACION_EJEMPLO));
  }, [leadId, isLiveMode]);

  React.useEffect(() => {
    if (!isLiveMode || !leadId) { setMsgs(CONVERSACION_EJEMPLO); return; }
    setMsgs([]);
    loadMsgs();
    // Fetch canales for send selector
    ApiClient.getCanales()
      .then(({ data }) => setCanales(data))
      .catch(() => {});
  }, [leadId, isLiveMode, loadMsgs]);

  // Tiempo real: recargar al recibir cualquier mensaje (entrante o saliente) de ESTE lead.
  React.useEffect(() => {
    if (!isLiveMode || !leadId) return;
    const handler = (e) => { if (e.leadId === leadId) loadMsgs(); };
    const off = WsClient.on('new_message', handler);
    return () => off();
  }, [leadId, isLiveMode, loadMsgs]);

  // Append incoming WS message (fallback manual, ya no se usa para entrantes)
  const appendFromWS = React.useCallback((rawMsg) => {
    const m = {
      id: rawMsg.id,
      from: rawMsg.origen === 'cliente' ? 'cliente' : rawMsg.origen === 'sistema' ? 'sistema' : 'vendedor',
      canal: rawMsg.canal?.tipo === 'email' ? 'email' : 'whatsapp',
      ts: new Date(rawMsg.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      texto: rawMsg.texto || '[media]',
      _raw: rawMsg,
    };
    setMsgs(prev => {
      let next = prev.filter(x => x.id !== m.id);
      // Reconciliar burbuja optimista: si es saliente, quitar el tmp- con mismo texto
      if (m.from !== 'cliente') {
        next = next.filter(x => !(String(x.id).startsWith('tmp-') && x.texto === m.texto));
      }
      return [...next, m];
    });
  }, []);

  const appendOptimistic = React.useCallback((texto, canal) => {
    setMsgs(prev => [...prev, {
      id: 'tmp-' + Date.now(),
      from: 'vendedor',
      canal,
      ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      texto,
    }]);
  }, []);

  return { msgs, canales, appendFromWS, appendOptimistic };
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

function Inbox({ rol, rolVendedor, setRoute, isLiveMode = false }) {
  const [filter, setFilter] = React.useState('todos');
  const [canal, setCanal]   = React.useState('todos');
  const [buscar, setBuscar] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const toast = useToast();

  const { leads, loading, wsOnline, reload, prependLead } = useLeadsAPI(rol, rolVendedor, isLiveMode);

  // WS: new incoming message → select lead and refresh
  React.useEffect(() => {
    if (!isLiveMode) return;
    const off = WsClient.on('new_message', (e) => {
      if (e.leadId && selected?.id !== e.leadId) {
        toast('Nuevo mensaje entrante', 'info');
      }
    });
    const offLead = WsClient.on('new_lead', () => {
      toast('Nuevo lead recibido', 'ok');
    });
    return () => { off(); offLead(); };
  }, [isLiveMode, selected?.id]);

  let leadsFiltered = [...leads];
  if (filter === 'nuevos')      leadsFiltered = leadsFiltered.filter(l => l.etapa === 'nuevo');
  else if (filter === 'sin_asignar') leadsFiltered = leadsFiltered.filter(l => !l.asignadoA && !l.asignado_a);
  else if (filter === 'activos') leadsFiltered = leadsFiltered.filter(l => !['cerrado','no_cierre'].includes(l.etapa));
  else if (filter === 'cerrados') leadsFiltered = leadsFiltered.filter(l => l.etapa === 'cerrado');
  if (canal !== 'todos') leadsFiltered = leadsFiltered.filter(l => (l.canal?.tipo || l.canal || '').includes(canal));
  if (buscar.trim()) {
    const q = buscar.toLowerCase();
    leadsFiltered = leadsFiltered.filter(l =>
      l.contacto?.toLowerCase().includes(q) ||
      l.empresa?.toLowerCase().includes(q) ||
      l.id?.toLowerCase().includes(q)
    );
  }
  leadsFiltered = [...leadsFiltered].sort((a, b) =>
    (b.ultimaInteraccion || new Date(b.ultima_interaccion).getTime()) -
    (a.ultimaInteraccion || new Date(a.ultima_interaccion).getTime())
  );

  const isMobile = useIsMobile();
  // En móvil no auto-seleccionamos el primero: lista o detalle, no ambos
  const current = (isMobile ? selected : (selected || leadsFiltered[0])) || null;

  return (
    <div className="inbox-grid" style={{flex:1,display:'grid',gridTemplateColumns:'420px 1fr',minHeight:0,overflow:'hidden'}}>
      {/* Lista */}
      {(!isMobile || !current) && (
      <div className="inbox-list" style={{borderRight:'1px solid var(--line)',display:'flex',flexDirection:'column',minHeight:0}}>
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--line)',display:'flex',flexDirection:'column',gap:10}}>
          <div className="row" style={{gap:8}}>
            <div className="search-box" style={{flex:1}}>
              <IcoSearch size={14}/>
              <input placeholder="Buscar empresa, contacto, folio…" value={buscar} onChange={e=>setBuscar(e.target.value)}/>
              <kbd>⌘K</kbd>
            </div>
            {isLiveMode && (
              <div className="row" style={{gap:4,fontSize:11,color:wsOnline?'var(--ok)':'var(--ink-4)'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:wsOnline?'var(--ok)':'var(--ink-4)',display:'inline-block'}}/>
                {wsOnline ? 'Live' : 'Off'}
              </div>
            )}
          </div>
          <div className="row" style={{gap:6,flexWrap:'wrap'}}>
            {[['todos','Todos'],['nuevos','Nuevos'],['sin_asignar','Sin asignar'],['activos','Activos'],['cerrados','Cerrados']].map(([id,lbl])=>(
              <button key={id} className={'btn btn-sm'+(filter===id?' btn-primary':'')} onClick={()=>setFilter(id)}>{lbl}</button>
            ))}
          </div>
          <div className="row" style={{gap:6}}>
            {[['todos','Todos canales',null],['whatsapp','WhatsApp',<IcoWhatsapp size={12}/>],['email','Correo',<IcoMail size={12}/>]].map(([id,lbl,ic])=>(
              <button key={id} className={'btn btn-sm'+(canal===id?' btn-primary':'')} onClick={()=>setCanal(id)}>{ic}{lbl}</button>
            ))}
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto'}}>
          {loading ? (
            <div className="muted" style={{padding:24,textAlign:'center',fontSize:13}}>Cargando leads…</div>
          ) : leadsFiltered.length === 0 ? (
            <div className="muted" style={{padding:24,textAlign:'center',fontSize:13}}>Sin leads{buscar ? ' — ajusta la búsqueda' : ''}</div>
          ) : leadsFiltered.map(l => {
            const active = current && current.id === l.id;
            const ts = l.ultimaInteraccion || new Date(l.ultima_interaccion || l.createdAt).getTime();
            return (
              <button key={l.id} onClick={()=>setSelected(l)}
                style={{display:'block',width:'100%',textAlign:'left',appearance:'none',border:0,cursor:'pointer',
                  background:active?'oklch(0.96 0.08 95)':'transparent',
                  padding:'12px 16px',borderBottom:'1px solid var(--line-2)',font:'inherit'}}>
                <div className="row" style={{gap:10,marginBottom:4}}>
                  <ChipCanal canal={l.canal?.tipo || l.canal || 'whatsapp'}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{l.contacto}</div>
                    <div className="muted" style={{fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.empresa || l.canal?.nombre || '—'}</div>
                  </div>
                  <div className="stack" style={{alignItems:'flex-end'}}>
                    <div className="muted mono" style={{fontSize:10.5}}>{relTime(ts)}</div>
                    {(l.asignadoA || l.asignado_a)
                      ? <Avatar vendedor={l.asignadoA || l.asignado_a} size={20}/>
                      : <span className="pill pill-accent" style={{fontSize:9.5,padding:'1px 5px'}}>NUEVO</span>}
                  </div>
                </div>
                <div className="row" style={{gap:6}}>
                  <ChipEtapa etapa={l.etapa}/>
                  <span className="pill" style={{fontSize:10}}><span className={'prio-dot prio-'+(l.prioridad||'media')}/>{l.prioridad||'media'}</span>
                  <span className="muted mono" style={{fontSize:10.5,marginLeft:'auto'}}>{l.id?.slice(0,8) || l.id}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Detalle */}
      {(!isMobile || current) && (
        current
          ? <LeadDetail lead={current} rol={rol} isLiveMode={isLiveMode} onLeadUpdated={reload}
              isMobile={isMobile} onBack={()=>setSelected(null)}/>
          : <div className="page muted" style={{display:'grid',placeItems:'center',fontSize:13}}>
              {isLiveMode ? 'Selecciona un lead' : 'Sin selección'}
            </div>
      )}
    </div>
  );
}

// ─── Lead Detail ─────────────────────────────────────────────────────────────

function LeadDetail({ lead, rol, isLiveMode, onLeadUpdated, isMobile, onBack }) {
  const [draft, setDraft] = React.useState('');
  const [tab, setTab]     = React.useState('conversacion');
  const [canalActivo, setCanalActivo] = React.useState('whatsapp');
  const [cerrada, setCerrada] = React.useState(lead.etapa === 'cerrado');
  const [sending, setSending] = React.useState(false);
  const [showCotizar, setShowCotizar] = React.useState(false);
  const [showLlamar, setShowLlamar]   = React.useState(false);
  const [showCierre, setShowCierre]   = React.useState(false);
  const [showNoCierre, setShowNoCierre] = React.useState(false);
  const bottomRef = React.useRef(null);
  const composeRef = React.useRef(null);
  const toast = useToast();

  // Item 1: la caja de respuesta crece con el contenido (hasta maxHeight).
  React.useEffect(() => {
    const el = composeRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [draft]);

  const { msgs, canales, appendFromWS, appendOptimistic } = useMensajesAPI(lead, isLiveMode);
  const v = VENDEDORES.find(x => x.id === (lead.asignadoA || lead.asignado_a));

  // Reset state when lead changes
  React.useEffect(() => {
    setDraft('');
    setCerrada(lead.etapa === 'cerrado');
    setTab('conversacion');
  }, [lead.id]);

  // Scroll to bottom when messages change
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  // Tiempo real: la recarga de mensajes la maneja useMensajesAPI (suscrito a 'new_message').

  // Determine send canal: use lead's canal, fallback to WA canal from list
  const sendCanalId = React.useMemo(() => {
    if (!isLiveMode) return null;
    if (canalActivo === 'whatsapp') {
      return lead.canal_id || canales.find(c => c.tipo === 'whatsapp')?.id || null;
    }
    return canales.find(c => c.tipo === 'email')?.id || null;
  }, [canalActivo, lead.canal_id, canales, isLiveMode]);

  const send = async () => {
    if (!draft.trim()) return;
    const texto = draft.trim();
    setDraft('');
    appendOptimistic(texto, canalActivo);

    if (!isLiveMode) {
      toast('Mensaje enviado por ' + (canalActivo === 'whatsapp' ? 'WhatsApp' : 'correo'), 'ok');
      return;
    }

    setSending(true);
    try {
      await ApiClient.sendMensaje(lead.id, texto, sendCanalId, canalActivo);
      toast('Enviado por ' + (canalActivo === 'whatsapp' ? 'WhatsApp' : 'correo'), 'ok');
    } catch (err) {
      toast('Error al enviar: ' + err.message, 'bad');
    } finally {
      setSending(false);
    }
  };

  // Grabación de nota de voz (micrófono) estilo WhatsApp
  const [recording, setRecording] = React.useState(false);
  const [recSecs, setRecSecs] = React.useState(0);
  const recRef = React.useRef(null);
  const chunksRef = React.useRef([]);
  const cancelRef = React.useRef(false);
  const timerRef = React.useRef(null);
  const fmtSecs = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  const startRec = async () => {
    if (!isLiveMode) { toast('Modo demo: grabar no disponible', 'info'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) ? 'audio/ogg;codecs=opus'
        : (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        setRecSecs(0);
        if (cancelRef.current) return; // cancelado: descartar
        const base = mime.split(';')[0];
        const ext = base.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: base });
        if (!blob.size) return;
        const file = new File([blob], `nota-voz.${ext}`, { type: base });
        setSending(true);
        try { await ApiClient.sendMediaFile(lead.id, file); toast('Nota de voz enviada', 'ok'); }
        catch (err) { toast('Error al enviar audio: ' + err.message, 'bad'); }
        finally { setSending(false); }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
      setRecSecs(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch (err) {
      toast('No se pudo acceder al micrófono: ' + err.message, 'bad');
    }
  };
  const stopRec = () => { recRef.current && recRef.current.stop(); };
  const cancelRec = () => { cancelRef.current = true; recRef.current && recRef.current.stop(); };

  // Stickers predefinidos para vendedores (webp 512x512 en /assets/stickers)
  const STICKERS = [1, 2, 3, 4, 5, 6];
  const [stickerOpen, setStickerOpen] = React.useState(false);
  const sendSticker = async (n) => {
    setStickerOpen(false);
    if (!isLiveMode) { toast('Modo demo: stickers no disponibles', 'info'); return; }
    setSending(true);
    try {
      const res = await fetch(`/assets/stickers/${n}.webp`);
      if (!res.ok) throw new Error('No se encontró el sticker');
      const blob = await res.blob();
      const file = new File([blob], `${n}.webp`, { type: 'image/webp' });
      await ApiClient.sendMediaFile(lead.id, file);
      toast('Sticker enviado', 'ok');
    } catch (err) {
      toast('Error al enviar sticker: ' + err.message, 'bad');
    } finally {
      setSending(false);
    }
  };

  const fileRef = React.useRef(null);
  const onPickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!isLiveMode) { toast('Modo demo: adjuntar no disponible', 'info'); return; }
    setSending(true);
    try {
      await ApiClient.sendMediaFile(lead.id, file, draft.trim() || undefined);
      setDraft('');
      toast('Archivo enviado', 'ok');
    } catch (err) {
      toast('Error al enviar archivo: ' + err.message, 'bad');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="lead-grid" style={{display:'grid',gridTemplateColumns:'1fr 300px',minHeight:0,overflow:'hidden'}}>
      {/* Conversación */}
      <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
        {/* Header */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <button className="icon-btn inbox-back" title="Volver" onClick={onBack}
            style={{flexShrink:0,marginRight:4}}>
            <span style={{display:'grid',transform:'rotate(180deg)'}}><IcoChevronR size={18}/></span>
          </button>
          <div style={{minWidth:0,flex:1}}>
            <div className="row" style={{gap:8,flexWrap:'wrap'}}>
              <h3 className="lead-title" style={{margin:0,fontSize:16,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{lead.contacto}</h3>
              <ChipEtapa etapa={lead.etapa}/>
              <span className="pill mono hide-mobile" style={{fontSize:10.5}}>{String(lead.id).slice(0,8)}</span>
              {isLiveMode && (
                <span className="pill pill-ok" style={{fontSize:9.5}}>● LIVE</span>
              )}
            </div>
            <div className="muted" style={{fontSize:12,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {lead.empresa && <span>{lead.empresa} · </span>}
              <span className="mono">{lead.telefono}</span>
              {lead.email && <span className="hide-mobile"> · {lead.email}</span>}
            </div>
          </div>
          <div className="row lead-actions" style={{gap:6,flexShrink:0}}>
            <button className="btn btn-sm" onClick={()=>setShowLlamar(true)} title="Llamar"><IcoPhone size={13}/><span className="btn-label">Llamar</span></button>
            <button className="btn btn-sm" onClick={()=>setShowCotizar(true)} title="Registrar cotización u otro"><IcoDoc size={13}/><span className="btn-label">Registrar</span></button>
            {!cerrada && (
              <button className="btn btn-sm" onClick={()=>setShowNoCierre(true)} title="Marcar no cierre">
                <IcoX size={13}/><span className="btn-label">No cierre</span>
              </button>
            )}
            <button className={'btn btn-sm '+(cerrada?'btn-accent':'btn-primary')} onClick={()=>setShowCierre(true)} disabled={cerrada} title="Cerrar venta">
              <IcoCheck size={13}/><span className="btn-label">{cerrada?'Cerrada':'Cerrar venta'}</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="row" style={{padding:'8px 20px',borderBottom:'1px solid var(--line-2)',gap:16}}>
          {['conversacion','actividad'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{appearance:'none',border:0,background:'transparent',padding:'6px 0',cursor:'pointer',
                fontSize:12.5,fontWeight:500,
                color:tab===t?'var(--ink)':'var(--ink-4)',
                borderBottom:tab===t?'2px solid var(--ink)':'2px solid transparent'}}>
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* Contenido según pestaña */}
        {tab === 'conversacion' && (
          <div className="chat-scroll" style={{flex:1,overflowY:'auto',padding:'20px 28px',background:'var(--bg)'}}>
            {msgs.map((m,i) => <Msg key={m.id||i} m={m} vendedor={v}/>)}
            <div ref={bottomRef}/>
          </div>
        )}
        {tab === 'actividad'   && <ActividadTab lead={lead} msgs={msgs}/>}

        {/* Compose (solo en conversación) */}
        {tab === 'conversacion' && (
        <div style={{borderTop:'1px solid var(--line)',padding:'12px 20px',background:'var(--panel)'}}>
          <div className="row" style={{gap:8,marginBottom:8}}>
            <button className={'btn btn-sm'+(canalActivo==='whatsapp'?' btn-primary':'')}
              onClick={()=>setCanalActivo('whatsapp')}><IcoWhatsapp size={12}/>WhatsApp</button>
            <button className={'btn btn-sm'+(canalActivo==='email'?' btn-primary':'')}
              onClick={()=>setCanalActivo('email')}><IcoMail size={12}/>Correo</button>
            <span className="muted" style={{fontSize:11,marginLeft:'auto'}}>
              Plantilla:&nbsp;
              <button className="btn btn-sm btn-ghost mono"
                onClick={()=>setDraft('Buen día, adjunto cotización con los productos solicitados. Vigencia: 15 días. Quedo atento a sus comentarios.')}>
                cotización_rápida
              </button>
            </span>
          </div>
          <input ref={fileRef} type="file" style={{display:'none'}}
            accept="image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.webp"
            onChange={onPickFile}/>
          {recording ? (
            /* Barra de grabación (estilo WhatsApp) */
            <div className="row" style={{gap:12,alignItems:'center',
              border:'1px solid var(--line)',borderRadius:24,padding:'8px 14px',background:'var(--bg)'}}>
              <button className="icon-btn" title="Cancelar" onClick={cancelRec}
                style={{color:'#ef4444'}}><IcoTrash size={18}/></button>
              <span style={{width:9,height:9,borderRadius:'50%',background:'#ef4444',flexShrink:0,
                animation:'pulse 1s infinite'}}/>
              <span className="mono" style={{fontSize:13}}>{fmtSecs(recSecs)}</span>
              <span className="muted" style={{fontSize:12}}>Grabando nota de voz…</span>
              <div style={{flex:1}}/>
              <button className="icon-btn" title="Enviar" onClick={stopRec}
                style={{background:'var(--accent)',color:'var(--accent-ink,#fff)',width:38,height:38,borderRadius:'50%'}}>
                <IcoSend size={17}/>
              </button>
            </div>
          ) : (
            /* Barra normal: sticker + clip + texto + (mic | enviar) */
            <div className="row" style={{gap:8,alignItems:'flex-end',position:'relative',
              border:'1px solid var(--line)',borderRadius:24,padding:'6px 8px 6px 12px',background:'var(--bg)'}}>
              {stickerOpen && (
                <div className="card" style={{position:'absolute',bottom:'calc(100% + 8px)',left:0,
                  padding:10,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,
                  width:240,boxShadow:'0 8px 24px rgba(0,0,0,0.15)',zIndex:20}}>
                  {STICKERS.map(n=>(
                    <button key={n} onClick={()=>sendSticker(n)} disabled={sending}
                      style={{appearance:'none',border:'1px solid var(--line-2)',borderRadius:8,padding:4,
                        background:'var(--panel)',cursor:'pointer'}}>
                      <img src={`/assets/stickers/${n}.webp`} alt={'sticker '+n}
                        style={{width:'100%',aspectRatio:'1',objectFit:'contain',display:'block'}}/>
                    </button>
                  ))}
                </div>
              )}
              <button className="icon-btn" title="Stickers"
                onClick={()=>setStickerOpen(o=>!o)}
                disabled={sending||canalActivo!=='whatsapp'}
                style={{flexShrink:0,color:stickerOpen?'var(--accent)':'var(--ink-3)'}}><IcoSticker size={20}/></button>
              <button className="icon-btn" title="Adjuntar"
                onClick={()=>fileRef.current&&fileRef.current.click()}
                disabled={sending||canalActivo!=='whatsapp'}
                style={{flexShrink:0,color:'var(--ink-3)'}}><IcoPaperclip size={20}/></button>
              <textarea className="compose-input" rows={1} ref={composeRef}
                placeholder={canalActivo==='whatsapp'?'Escribe un mensaje':'Mensaje por correo…'}
                value={draft}
                onChange={e=>setDraft(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();} }}
                style={{resize:'none',flex:1,border:0,outline:'none',background:'transparent',
                  fontSize:13.5,lineHeight:1.4,padding:'8px 4px',maxHeight:120,fontFamily:'inherit',color:'var(--ink)'}}/>
              {draft.trim() ? (
                <button className="icon-btn" title="Enviar" onClick={send} disabled={sending}
                  style={{flexShrink:0,background:'var(--accent)',color:'var(--accent-ink,#fff)',
                    width:38,height:38,borderRadius:'50%'}}>
                  <IcoSend size={17}/>
                </button>
              ) : (
                <button className="icon-btn" title="Grabar nota de voz" onClick={startRec}
                  disabled={sending||canalActivo!=='whatsapp'}
                  style={{flexShrink:0,color:'var(--ink-3)',width:38,height:38}}>
                  <IcoMic size={20}/>
                </button>
              )}
            </div>
          )}
          <div className="muted" style={{fontSize:10.5,marginTop:6}}>
            Enter para enviar · Shift+Enter salto de línea{isLiveMode&&sendCanalId?' · '+canalActivo:''}
          </div>
        </div>
        )}
      </div>

      {/* Panel lateral */}
      <aside className="lead-aside" style={{borderLeft:'1px solid var(--line)',padding:20,overflowY:'auto',background:'var(--panel)'}}>
        <SidePanelRow label="Asignado a" value={
          v ? <div className="row" style={{gap:8}}><Avatar vendedor={v} size={24}/><span style={{fontSize:13}}>{v.nombre}</span></div>
            : <span className="pill pill-accent">Sin asignar</span>
        }/>
        <SidePanelRow label="Canal" value={
          <div className="row" style={{gap:6}}>
            <ChipCanal canal={lead.canal?.tipo || lead.canal || 'whatsapp'} size={14}/>
            <span className="mono" style={{fontSize:11}}>{lead.canal?.nombre || lead.canal || '—'}</span>
          </div>
        }/>
        <SidePanelRow label="Zona"      value={lead.zona || '—'}/>
        <SidePanelRow label="Prioridad" value={<span className="pill"><span className={'prio-dot prio-'+(lead.prioridad||'media')}/>{lead.prioridad||'media'}</span>}/>
        <SidePanelRow label="Teléfono"  value={<span className="mono" style={{fontSize:11.5}}>{lead.telefono||'—'}</span>}/>
        <SidePanelRow label="Correo"    value={<span style={{fontSize:11,wordBreak:'break-all'}}>{lead.email||'—'}</span>}/>
        <SidePanelRow label="Creado"    value={relTime(lead.createdAt || new Date(lead.created_at).getTime())+' atrás'}/>

        {(lead.productos?.length > 0) && (
          <>
            <div style={{borderTop:'1px solid var(--line-2)',margin:'20px 0 16px'}}/>
            <div className="kpi-label" style={{marginBottom:10}}>Productos de interés</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {lead.productos.map((p,i)=>(
                <div key={i} className="row" style={{justifyContent:'space-between',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12.5,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nombre}</div>
                    <div className="muted mono" style={{fontSize:10.5}}>{p.cantidad} × {money(p.precio)}</div>
                  </div>
                  <div className="tabular mono" style={{fontSize:12}}>{money(p.cantidad*p.precio)}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{borderTop:'1px solid var(--line-2)',margin:'20px 0 16px'}}/>
        <div className="kpi-label" style={{marginBottom:8}}>Trazabilidad</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:11.5,color:'var(--ink-3)'}}>
          <div className="row" style={{gap:8}}><IcoClock size={12}/><span>Capturado · {relTime(lead.createdAt || new Date(lead.created_at).getTime())} atrás</span></div>
          {lead.cotizacionEnviada && <div className="row" style={{gap:8}}><IcoDoc size={12}/><span>Cotización enviada</span></div>}
          {lead.etapa === 'cerrado' && <div className="row" style={{gap:8,color:'var(--ok)'}}><IcoCheck size={12}/><span>Venta cerrada</span></div>}
          {lead.etapa === 'no_cierre' && <div className="row" style={{gap:8,color:'var(--bad)'}}><IcoX size={12}/><span>No cierre · {lead.motivoNoCierre}</span></div>}
        </div>

        <SideSection title="Cotizaciones">
          <CotizacionesLeadTab lead={lead} isLiveMode={isLiveMode} embedded/>
        </SideSection>
        <SideSection title="Notas">
          <NotasTab lead={lead} isLiveMode={isLiveMode} onSaved={onLeadUpdated} embedded/>
        </SideSection>
      </aside>

      {/* Modales */}
      <Modal open={showLlamar} onClose={()=>setShowLlamar(false)} title={'Llamar a '+lead.contacto}
        footer={<>
          <button className="btn" onClick={()=>setShowLlamar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{setShowLlamar(false);toast('Llamada iniciada vía VoIP','ok');}}><IcoPhone size={12}/>Iniciar</button>
        </>}>
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div className="mono" style={{fontSize:24,fontWeight:500}}>{lead.telefono}</div>
          <div className="muted" style={{fontSize:12,marginTop:6}}>{lead.empresa}</div>
        </div>
      </Modal>

      <RegistrarModal open={showCotizar} onClose={()=>setShowCotizar(false)} lead={lead}
        isLiveMode={isLiveMode} onDone={onLeadUpdated}/>

      <CierreModal open={showCierre} onClose={()=>setShowCierre(false)} lead={lead}
        isLiveMode={isLiveMode} onCerrada={()=>{setCerrada(true);onLeadUpdated?.();}}/>

      <NoCierreModal open={showNoCierre} onClose={()=>setShowNoCierre(false)} lead={lead}
        isLiveMode={isLiveMode} onDone={()=>{onLeadUpdated?.();}}/>
    </div>
  );
}

// Catálogo de motivos de no cierre (item 4). Configurable.
const MOTIVOS_NO_CIERRE = [
  'Precio',
  'No manejamos el material',
  'Sólo pedía información',
  'Sin respuesta',
  'Tiempo de entrega o existencia',
  'Otro',
];

// ── Modal Registrar: "Cotización / Otro" (items 3 y 6) ──────────────
function RegistrarModal({ open, onClose, lead, isLiveMode, onDone }) {
  const toast = useToast();
  const [modo, setModo] = React.useState('cotizacion'); // 'cotizacion' | 'otro'
  const [monto, setMonto] = React.useState('');
  const [vigencia, setVigencia] = React.useState(15);
  const [enviarPor, setEnviarPor] = React.useState('whatsapp');
  const [notas, setNotas] = React.useState('');
  const [otroTexto, setOtroTexto] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) { setModo('cotizacion'); setMonto(''); setVigencia(15); setEnviarPor('whatsapp'); setNotas(''); setOtroTexto(''); }
  }, [open]);

  const crear = async () => {
    if (modo === 'cotizacion') {
      const m = parseFloat(monto);
      if (!m || m <= 0) { toast('Captura un monto válido', 'bad'); return; }
      if (!isLiveMode) { toast('Cotización registrada (demo)', 'ok'); onClose(); return; }
      setBusy(true);
      try {
        const r = await ApiClient.crearCotizacion({ lead_id: lead.id, monto: m, vigencia_dias: Number(vigencia), notas: notas || undefined });
        const cot = r.data;
        toast('Cotización ' + cot.folio + ' creada', 'ok');
        if (enviarPor) {
          try { await ApiClient.enviarCotizacion(cot.id, enviarPor); toast('Encolada para envío por ' + enviarPor, 'ok'); }
          catch (e) { toast('Creada, pero no se pudo enviar: ' + e.message, 'info'); }
        }
        onDone?.(); onClose();
      } catch (e) { toast('Error: ' + e.message, 'bad'); }
      finally { setBusy(false); }
    } else {
      if (!otroTexto.trim()) { toast('Describe el registro', 'bad'); return; }
      if (!isLiveMode) { toast('Registro guardado (demo)', 'ok'); onClose(); return; }
      setBusy(true);
      try {
        const prev = lead.notas ? lead.notas + '\n' : '';
        await ApiClient.updateLead(lead.id, { notas: prev + '• ' + otroTexto.trim() });
        toast('Registro guardado en notas', 'ok');
        onDone?.(); onClose();
      } catch (e) { toast('Error: ' + e.message, 'bad'); }
      finally { setBusy(false); }
    }
  };

  const seg = (id, label) => (
    <button className={'btn btn-sm'+(modo===id?' btn-primary':'')} onClick={()=>setModo(id)}>{label}</button>
  );

  return (
    <Modal open={open} onClose={onClose} title="Registrar" width={520}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-accent" onClick={crear} disabled={busy}>
          <IcoSend size={12}/>{modo==='cotizacion'?'Crear cotización':'Guardar'}
        </button>
      </>}>
      <div className="stack" style={{gap:12}}>
        <div className="row" style={{gap:8}}>{seg('cotizacion','Cotización')}{seg('otro','Otro')}</div>
        <div className="row" style={{justifyContent:'space-between'}}>
          <div style={{fontSize:13,fontWeight:500}}>{lead.empresa || lead.contacto}</div>
          <span className="pill mono">{String(lead.id).slice(0,8)}</span>
        </div>
        {modo === 'cotizacion' ? (
          <>
            <div className="grid-2">
              <div><div className="kpi-label" style={{marginBottom:4}}>Monto (MXN)</div>
                <input className="input mono" type="number" min="0" step="0.01" placeholder="0.00"
                  value={monto} onChange={e=>setMonto(e.target.value)}/></div>
              <div><div className="kpi-label" style={{marginBottom:4}}>Vigencia</div>
                <select className="input" value={vigencia} onChange={e=>setVigencia(e.target.value)}>
                  <option value={7}>7 días</option><option value={15}>15 días</option><option value={30}>30 días</option></select></div>
            </div>
            <div><div className="kpi-label" style={{marginBottom:4}}>Enviar por</div>
              <select className="input" value={enviarPor} onChange={e=>setEnviarPor(e.target.value)}>
                <option value="whatsapp">WhatsApp</option><option value="email">Correo</option></select></div>
            <div><div className="kpi-label" style={{marginBottom:4}}>Notas</div>
              <textarea className="input" rows={3} placeholder="Productos y cantidades…" value={notas} onChange={e=>setNotas(e.target.value)}/></div>
          </>
        ) : (
          <div><div className="kpi-label" style={{marginBottom:4}}>Otro registro</div>
            <textarea className="input" rows={4} placeholder="Anota lo que ocurrió (visita, llamada, acuerdo…)" value={otroTexto} onChange={e=>setOtroTexto(e.target.value)}/>
            <div className="muted" style={{fontSize:11,marginTop:6}}>Se guarda en las notas del lead.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Modal No cierre con catálogo de motivos (item 4) ────────────────
function NoCierreModal({ open, onClose, lead, isLiveMode, onDone }) {
  const toast = useToast();
  const [motivo, setMotivo] = React.useState(null);
  const [nota, setNota] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (open) { setMotivo(null); setNota(''); } }, [open]);

  const confirmar = async () => {
    if (!motivo) { toast('Selecciona un motivo', 'bad'); return; }
    const texto = motivo === 'Otro' && nota.trim() ? nota.trim() : motivo;
    if (!isLiveMode) { toast('No cierre registrado (demo): ' + texto, 'ok'); onClose(); return; }
    setBusy(true);
    try {
      await ApiClient.updateEtapa(lead.id, 'no_cierre', texto);
      toast('Marcado como no cierre', 'ok');
      onDone?.(); onClose();
    } catch (e) { toast('Error: ' + e.message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Motivo de no cierre" width={460}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={confirmar} disabled={busy||!motivo}>Confirmar</button>
      </>}>
      <div className="stack" style={{gap:10}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {MOTIVOS_NO_CIERRE.map(m => (
            <button key={m} onClick={()=>setMotivo(m)}
              className={'btn btn-sm'+(motivo===m?' btn-primary':'')}
              style={{justifyContent:'flex-start',textAlign:'left'}}>{m}</button>
          ))}
        </div>
        {motivo === 'Otro' && (
          <div><div className="kpi-label" style={{marginBottom:4}}>Nota (opcional)</div>
            <textarea className="input" rows={2} placeholder="Detalle del motivo…" value={nota} onChange={e=>setNota(e.target.value)}/></div>
        )}
      </div>
    </Modal>
  );
}

// ── Modal Cierre: parcial/total por cotización + mostrador (items 8 y 9) ──
function CierreModal({ open, onClose, lead, isLiveMode, onCerrada }) {
  const toast = useToast();
  const [cots, setCots] = React.useState(null);
  const [forms, setForms] = React.useState({});   // cotId -> {sel, tipo, monto, notas}
  const [ticket, setTicket] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTicket('');
    if (!isLiveMode) { setCots([]); return; }
    setCots(null);
    ApiClient.getCotizaciones({ lead_id: lead.id, limit: '50' })
      .then(r => {
        const list = (r.data || []).filter(c => !c.cerrada_at);
        setCots(list);
        const f = {};
        list.forEach(c => { f[c.id] = { sel:false, tipo:'total', monto: String(Number(c.monto_total)||0), notas:'' }; });
        setForms(f);
      })
      .catch(() => setCots([]));
  }, [open, lead.id, isLiveMode]);

  const upd = (id, patch) => setForms(f => ({ ...f, [id]: { ...f[id], ...patch } }));

  const registrar = async () => {
    if (!isLiveMode) { toast('Cierre registrado (demo)', 'ok'); onCerrada?.(); onClose(); return; }
    const seleccionadas = (cots||[]).filter(c => forms[c.id]?.sel);
    setBusy(true);
    try {
      let hizo = false;
      for (const c of seleccionadas) {
        const fm = forms[c.id];
        const m = parseFloat(fm.monto);
        if (!m || m < 0) { toast('Monto inválido en ' + c.folio, 'bad'); continue; }
        await ApiClient.cerrarCotizacion(c.id, { cierre_tipo: fm.tipo, monto_cerrado: m, cierre_notas: fm.notas || undefined });
        hizo = true;
      }
      if (ticket.trim()) { await ApiClient.cerrarMostrador(lead.id, ticket.trim()); hizo = true; }
      if (!hizo) { toast('Selecciona una cotización o captura un ticket de mostrador', 'info'); setBusy(false); return; }
      toast('Cierre registrado', 'ok');
      onCerrada?.(); onClose();
    } catch (e) { toast('Error: ' + e.message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Cerrar venta" width={560}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={registrar} disabled={busy}><IcoCheck size={12}/>Registrar cierre</button>
      </>}>
      <div className="stack" style={{gap:14}}>
        <div>
          <div className="kpi-label" style={{marginBottom:8}}>Cotizaciones pendientes</div>
          {cots === null && <div className="muted" style={{fontSize:13}}>Cargando…</div>}
          {cots && cots.length === 0 && <div className="muted" style={{fontSize:13}}>Sin cotizaciones pendientes. Usa "Cerró en mostrador" abajo.</div>}
          <div className="stack" style={{gap:10}}>
            {(cots||[]).map(c => {
              const fm = forms[c.id] || {};
              return (
                <div key={c.id} className="card" style={{padding:12}}>
                  <label className="row" style={{gap:8,cursor:'pointer',justifyContent:'space-between'}}>
                    <span className="row" style={{gap:8}}>
                      <input type="checkbox" checked={!!fm.sel} onChange={e=>upd(c.id,{sel:e.target.checked})}/>
                      <span className="mono" style={{fontSize:12}}>{c.folio}</span>
                      <span className="pill">{c.estado}</span>
                    </span>
                    <span className="tabular mono" style={{fontSize:12}}>{money(Number(c.monto_total)||0)}</span>
                  </label>
                  {fm.sel && (
                    <div className="grid-2" style={{gap:8,marginTop:10}}>
                      <div><div className="kpi-label" style={{marginBottom:4}}>Tipo</div>
                        <select className="input" value={fm.tipo} onChange={e=>upd(c.id,{tipo:e.target.value})}>
                          <option value="total">Total</option><option value="parcial">Parcial</option></select></div>
                      <div><div className="kpi-label" style={{marginBottom:4}}>Monto cerrado</div>
                        <input className="input mono" type="number" min="0" step="0.01" value={fm.monto} onChange={e=>upd(c.id,{monto:e.target.value})}/></div>
                      <div style={{gridColumn:'1 / -1'}}><div className="kpi-label" style={{marginBottom:4}}>Notas</div>
                        <input className="input" placeholder="Opcional" value={fm.notas} onChange={e=>upd(c.id,{notas:e.target.value})}/></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{borderTop:'1px solid var(--line-2)',paddingTop:12}}>
          <div className="kpi-label" style={{marginBottom:6}}>Cerró en mostrador</div>
          <div className="muted" style={{fontSize:11,marginBottom:6}}>Si compró directo en sucursal, captura el ticket (opcional) y se cerrará el lead.</div>
          <input className="input mono" placeholder="N.º de ticket (opcional)" value={ticket} onChange={e=>setTicket(e.target.value)}/>
        </div>
      </div>
    </Modal>
  );
}

function SidePanelRow({ label, value, mono }) {
  return (
    <div className="row" style={{justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--line-2)'}}>
      <span className="muted" style={{fontSize:11.5}}>{label}</span>
      <span className={mono?'mono':''} style={{fontSize:12.5,textAlign:'right',maxWidth:'60%'}}>{value}</span>
    </div>
  );
}

// ── Sección colapsable (dropdown) del panel lateral ────────────────
function SideSection({ title, badge, defaultOpen=false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={{borderTop:'1px solid var(--line-2)',marginTop:16,paddingTop:14}}>
      <button onClick={()=>setOpen(o=>!o)} aria-expanded={open}
        style={{appearance:'none',border:0,background:'transparent',cursor:'pointer',width:'100%',
          display:'flex',alignItems:'center',justifyContent:'space-between',padding:0}}>
        <span className="kpi-label" style={{display:'flex',alignItems:'center',gap:6}}>
          {title}{badge!=null && <span className="pill" style={{fontSize:10}}>{badge}</span>}
        </span>
        <span style={{display:'inline-flex',color:'var(--ink-4)',transition:'transform .15s',
          transform:open?'rotate(90deg)':'none'}}><IcoChevronR size={13}/></span>
      </button>
      {open && <div style={{marginTop:12}}>{children}</div>}
    </div>
  );
}

// ── Pestaña Actividad ──────────────────────────────────────────────
function ActividadTab({ lead, msgs }) {
  const entrantes = msgs.filter(m => m.from === 'cliente').length;
  const salientes = msgs.filter(m => m.from === 'vendedor').length;
  const fechaFmt = (d) => d ? new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const etiqueta = (et) => (ETAPAS.find(e => e.id === et) || {}).label || et;
  const row = (k, val) => (
    <div className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
      <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{val}</span>
    </div>
  );
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', background: 'var(--bg)' }}>
      <div className="card" style={{ padding: '4px 16px' }}>
        {row('Etapa actual', etiqueta(lead.etapa))}
        {row('Prioridad', lead.prioridad || 'media')}
        {row('Canal', lead.canal_tipo || lead.canal || '—')}
        {row('Mensajes recibidos', entrantes)}
        {row('Mensajes enviados', salientes)}
        {row('Creado', fechaFmt(lead.created_at))}
        {row('Última interacción', fechaFmt(lead.ultima_interaccion))}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 12, textAlign: 'center' }}>
        Resumen de actividad del lead
      </div>
    </div>
  );
}

// ── Pestaña Cotizaciones (de este lead) ────────────────────────────
function CotizacionesLeadTab({ lead, isLiveMode, embedded }) {
  const [cots, setCots] = React.useState(null);
  const [err, setErr] = React.useState(null);
  React.useEffect(() => {
    if (!isLiveMode) { setCots([]); return; }
    ApiClient.getCotizaciones({ lead_id: lead.id, limit: '50' })
      .then(r => setCots(r.data || []))
      .catch(e => setErr(e.message));
  }, [lead.id, isLiveMode]);

  const toast = useToast();
  const abrirPdf = async (id) => {
    if (!isLiveMode) { toast('PDF disponible en modo live', 'info'); return; }
    try { const url = await ApiClient.cotizacionPdfUrl(id); window.open(url, '_blank'); }
    catch (e) { toast('Error al abrir PDF: ' + e.message, 'bad'); }
  };
  const badge = (e) => e==='aceptada'?'pill-ok':e==='rechazada'?'pill-bad':e==='vista'?'pill-info':e==='enviada'?'pill-accent':'';
  return (
    <div style={embedded ? {} : { flex: 1, overflowY: 'auto', padding: '20px 28px', background: 'var(--bg)' }}>
      {err && <div className="card" style={{ padding: 16, color: 'var(--accent)' }}>Error: {err}</div>}
      {!cots && !err && <div className="muted" style={{ fontSize: 13 }}>Cargando…</div>}
      {cots && cots.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Sin cotizaciones.</div>}
      {cots && cots.length > 0 && embedded && (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {cots.map(c => (
            <div key={c.id} style={{border:'1px solid var(--line-2)',borderRadius:8,padding:'8px 10px'}}>
              <div className="row" style={{justifyContent:'space-between',gap:8}}>
                <span className="mono" style={{fontSize:12}}>{c.folio}</span>
                <span className={'pill '+badge(c.estado)} style={{fontSize:10}}>{c.estado}</span>
              </div>
              <div className="row" style={{justifyContent:'space-between',gap:8,marginTop:6}}>
                <span className="tabular mono" style={{fontSize:12.5,fontWeight:500}}>{money(Number(c.monto_total)||0)}</span>
                <button className="btn btn-sm btn-ghost" onClick={()=>abrirPdf(c.id)} title="Abrir PDF"><IcoDoc size={12}/>PDF</button>
              </div>
              {c.monto_cerrado != null && <div style={{fontSize:10.5,marginTop:4,color:'var(--ok)'}}>Cerrado {money(Number(c.monto_cerrado))} ({c.cierre_tipo})</div>}
            </div>
          ))}
        </div>
      )}
      {cots && cots.length > 0 && !embedded && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Folio</th><th>Estado</th><th>Vigencia</th><th style={{textAlign:'right'}}>Monto</th><th style={{textAlign:'right'}}>Cerrado</th><th></th></tr></thead>
            <tbody>
              {cots.map(c => (
                <tr key={c.id}>
                  <td className="mono" style={{ fontSize: 12 }}>{c.folio}</td>
                  <td><span className={'pill ' + badge(c.estado)}>{c.estado}</span></td>
                  <td className="mono muted" style={{ fontSize: 11.5 }}>{c.vigencia_dias} días</td>
                  <td className="tabular mono" style={{ textAlign: 'right', fontWeight: 500 }}>{money(Number(c.monto_total) || 0)}</td>
                  <td className="tabular mono" style={{ textAlign: 'right', fontSize: 11.5 }}>
                    {c.monto_cerrado != null ? <span style={{color:'var(--ok)'}}>{money(Number(c.monto_cerrado))} <span className="muted">({c.cierre_tipo})</span></span> : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" onClick={()=>abrirPdf(c.id)} title="Abrir PDF"><IcoDoc size={12}/>PDF</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Pestaña Notas (editable + autoguardado, item 2) ────────────────
function NotasTab({ lead, isLiveMode, onSaved, embedded }) {
  const toast = useToast();
  const [val, setVal] = React.useState(lead.notas || '');
  const [estado, setEstado] = React.useState('idle'); // idle | guardando | guardado | error
  const timerRef = React.useRef(null);
  const dirtyRef = React.useRef(false);

  React.useEffect(() => { setVal(lead.notas || ''); dirtyRef.current = false; setEstado('idle'); }, [lead.id]);

  const guardar = React.useCallback(async (texto) => {
    if (!isLiveMode) { setEstado('guardado'); return; }
    setEstado('guardando');
    try {
      await ApiClient.updateLead(lead.id, { notas: texto });
      setEstado('guardado');
      dirtyRef.current = false;
      onSaved?.();
    } catch (e) { setEstado('error'); toast('No se pudo guardar la nota: ' + e.message, 'bad'); }
  }, [lead.id, isLiveMode, onSaved, toast]);

  const onChange = (e) => {
    const t = e.target.value;
    setVal(t);
    dirtyRef.current = true;
    setEstado('idle');
    clearInterval(timerRef.current);
    timerRef.current = setTimeout(() => guardar(t), 800); // autoguardado al dejar de escribir
  };

  // Guarda pendiente al desmontar / cambiar de lead
  React.useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (dirtyRef.current) guardar(val);
  }, [lead.id]);

  const label = { idle:'', guardando:'Guardando…', guardado:'Guardado ✓', error:'Error al guardar' }[estado];
  return (
    <div style={embedded ? {} : { flex: 1, overflowY: 'auto', padding: '20px 28px', background: 'var(--bg)' }}>
      <div className="row" style={{ justifyContent: embedded?'flex-end':'space-between', marginBottom: 8, minHeight: 14 }}>
        {!embedded && <div className="kpi-label">Notas del lead</div>}
        <span className="muted" style={{ fontSize: 11, color: estado==='error'?'var(--bad)':estado==='guardado'?'var(--ok)':'var(--ink-3)' }}>{label}</span>
      </div>
      <textarea className="input" rows={embedded?6:10} value={val} onChange={onChange}
        onBlur={() => { clearTimeout(timerRef.current); if (dirtyRef.current) guardar(val); }}
        placeholder="Escribe notas del cliente… (se guardan solas)"
        style={{ width:'100%', fontSize: 13, lineHeight: 1.5, resize:'vertical', minHeight: embedded?110:160 }}/>
    </div>
  );
}

// Reproductor de audio estilo nota de voz WhatsApp
function AudioMsg({ src }) {
  const ref = React.useRef(null);
  const trackRef = React.useRef(null);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + String(ss).padStart(2, '0');
  };
  // ogg/opus de MediaRecorder reporta duration=Infinity hasta hacer seek: hack para forzarla
  const resolveDur = (a) => {
    if (a.duration === Infinity || isNaN(a.duration)) {
      a.currentTime = 1e101;
      const fix = () => { a.removeEventListener('timeupdate', fix); a.currentTime = 0; setDur(a.duration); };
      a.addEventListener('timeupdate', fix);
    } else { setDur(a.duration); }
  };
  const toggle = () => {
    const a = ref.current; if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); } else { a.pause(); setPlaying(false); }
  };
  const seek = (e) => {
    const a = ref.current, t = trackRef.current;
    if (!a || !t || !isFinite(dur) || !dur) return;
    const r = t.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    a.currentTime = ratio * dur; setCur(a.currentTime);
  };
  const pct = (dur && isFinite(dur)) ? (cur / dur) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 218, maxWidth: '100%', padding: '2px 0' }}>
      <button onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}
        style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', border: 0, cursor: 'pointer',
          background: 'var(--accent)', color: 'var(--accent-ink, #fff)', display: 'grid', placeItems: 'center', fontSize: 13 }}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={trackRef} onClick={seek}
          style={{ position: 'relative', height: 16, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ height: 3, width: '100%', borderRadius: 3, background: 'currentColor', opacity: 0.22 }}/>
          <div style={{ position: 'absolute', left: 0, height: 3, borderRadius: 3, background: 'var(--accent)', width: pct + '%' }}/>
          <div style={{ position: 'absolute', left: pct + '%', width: 11, height: 11, borderRadius: '50%',
            background: 'var(--accent)', transform: 'translateX(-50%)', boxShadow: '0 1px 2px rgba(0,0,0,.25)' }}/>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'currentColor', opacity: 0.6, marginTop: 3 }}>
          {(playing || cur > 0) ? fmt(cur) : fmt(dur)}
        </div>
      </div>
      <audio ref={ref} src={src} preload="metadata"
        onLoadedMetadata={(e) => resolveDur(e.target)}
        onTimeUpdate={(e) => setCur(e.target.currentTime || 0)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        style={{ display: 'none' }}/>
    </div>
  );
}

function Msg({ m, vendedor }) {
  if (m.from === 'sistema') {
    return (
      <div style={{textAlign:'center',margin:'14px 0'}}>
        <span className="pill pill-info mono" style={{fontSize:10.5}}>{m.texto} · {m.ts}</span>
      </div>
    );
  }
  const isV = m.from === 'vendedor';
  return (
    <div className={'msg-row '+(isV?'msg-out':'msg-in')} style={{display:'flex',gap:10,marginBottom:14,flexDirection:isV?'row-reverse':'row'}}>
      <span className="msg-avatar">
      {isV
        ? <Avatar vendedor={vendedor} size={28}/>
        : <div className="avatar" style={{background:'var(--line)',color:'var(--ink-3)',width:28,height:28,fontSize:11,display:'grid',placeItems:'center'}}>C</div>}
      </span>
      <div className="msg-col" style={{maxWidth:'70%'}}>
        <div className="row msg-meta" style={{gap:6,marginBottom:4,flexDirection:isV?'row-reverse':'row'}}>
          <span className="msg-name" style={{fontSize:11.5,fontWeight:500}}>{isV?(vendedor?.nombre||'Vendedor'):'Cliente'}</span>
          {m.canal && <span className="msg-canal"><ChipCanal canal={m.canal} size={10}/></span>}
          <span className="muted mono" style={{fontSize:10.5}}>{m.ts}</span>
          {isV && m.estado === 'error' && <span title={m.errorDetalle} style={{color:'#ef4444',fontSize:11}}>⚠ no enviado</span>}
          {isV && m.estado === 'enviado' && <span title="Enviado" style={{color:'#22c55e',fontSize:11}}>✓✓</span>}
        </div>
        <div className={(m.tieneMedia && m.tipoMedia === 'sticker') ? '' : ('chat-bubble '+(isV?'chat-out':'chat-in'))} style={ m.tieneMedia && m.tipoMedia === 'sticker' ? {
          background:'transparent',border:0,padding:0,
        } : {
          background:isV?(m.estado==='error'?'#7f1d1d':'var(--ink)'):'var(--panel)',
          color:isV?'#fff':'var(--ink)',
          border:isV?'0':'1px solid var(--line)',
          padding:(m.tieneMedia&&m.tipoMedia==='image')?6:'10px 12px',borderRadius:10,fontSize:13,lineHeight:1.45,
          overflowWrap:'break-word', wordBreak:'normal',
          opacity:isV&&m.estado==='error'?0.85:1,
        }}>
          {m.tieneMedia && m.tipoMedia === 'sticker' ? (
            <img src={ApiClient.mediaSrc(m.id)} alt="sticker"
                 style={{width:130,height:130,objectFit:'contain',display:'block'}}
                 onError={(e)=>{e.target.replaceWith(Object.assign(document.createElement('span'),{textContent:'[sticker]'}));}}/>
          ) : m.tieneMedia && m.tipoMedia === 'image' ? (
            <a href={ApiClient.mediaSrc(m.id)} target="_blank" rel="noreferrer">
              <img src={ApiClient.mediaSrc(m.id)} alt={m.texto||'imagen'}
                   style={{maxWidth:240,maxHeight:280,borderRadius:6,display:'block'}}
                   onError={(e)=>{e.target.replaceWith(Object.assign(document.createElement('span'),{textContent:'[imagen no disponible]'}));}}/>
            </a>
          ) : m.tieneMedia && m.tipoMedia === 'audio' ? (
            <AudioMsg src={ApiClient.mediaSrc(m.id)} dark={isV}/>
          ) : m.tieneMedia && m.tipoMedia === 'video' ? (
            <video controls src={ApiClient.mediaSrc(m.id)} style={{maxWidth:260,maxHeight:300,borderRadius:6,display:'block'}}/>
          ) : m.tieneMedia && m.tipoMedia === 'document' ? (
            <a href={ApiClient.mediaSrc(m.id)} target="_blank" rel="noreferrer" download
               className="row" style={{color:'currentColor',textDecoration:'none',gap:8,alignItems:'center',fontWeight:500}}>
              <span style={{flexShrink:0,opacity:0.85}}><IcoDoc size={20}/></span>
              <span style={{textDecoration:'underline',wordBreak:'break-word'}}>{m.texto||'documento'}</span>
            </a>
          ) : m.texto}
        </div>
      </div>
    </div>
  );
}

window.Inbox = Inbox;
