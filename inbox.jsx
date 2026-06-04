// Bandeja unificada conectada al backend real

// ─── Hooks de datos ──────────────────────────────────────────────────────────

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

  const current = selected || leadsFiltered[0] || null;

  return (
    <div style={{flex:1,display:'grid',gridTemplateColumns:'420px 1fr',minHeight:0,overflow:'hidden'}}>
      {/* Lista */}
      <div style={{borderRight:'1px solid var(--line)',display:'flex',flexDirection:'column',minHeight:0}}>
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

      {/* Detalle */}
      {current
        ? <LeadDetail lead={current} rol={rol} isLiveMode={isLiveMode} onLeadUpdated={reload}/>
        : <div className="page muted" style={{display:'grid',placeItems:'center',fontSize:13}}>
            {isLiveMode ? 'Esperando mensajes de WhatsApp…' : 'Sin selección'}
          </div>}
    </div>
  );
}

// ─── Lead Detail ─────────────────────────────────────────────────────────────

function LeadDetail({ lead, rol, isLiveMode, onLeadUpdated }) {
  const [draft, setDraft] = React.useState('');
  const [tab, setTab]     = React.useState('conversacion');
  const [canalActivo, setCanalActivo] = React.useState('whatsapp');
  const [cerrada, setCerrada] = React.useState(lead.etapa === 'cerrado');
  const [sending, setSending] = React.useState(false);
  const [showCotizar, setShowCotizar] = React.useState(false);
  const [showLlamar, setShowLlamar]   = React.useState(false);
  const bottomRef = React.useRef(null);
  const toast = useToast();

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

  const cerrar = async () => {
    if (!isLiveMode) { setCerrada(true); toast('Venta marcada como cerrada', 'ok'); return; }
    try {
      await ApiClient.updateEtapa(lead.id, 'cerrado');
      setCerrada(true);
      toast('Venta cerrada', 'ok');
      onLeadUpdated?.();
    } catch (err) {
      toast('Error: ' + err.message, 'bad');
    }
  };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 300px',minHeight:0,overflow:'hidden'}}>
      {/* Conversación */}
      <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
        {/* Header */}
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <div style={{minWidth:0}}>
            <div className="row" style={{gap:8,flexWrap:'wrap'}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>{lead.contacto}</h3>
              <ChipEtapa etapa={lead.etapa}/>
              <span className="pill mono" style={{fontSize:10.5}}>{String(lead.id).slice(0,8)}</span>
              {isLiveMode && (
                <span className="pill pill-ok" style={{fontSize:9.5}}>● LIVE</span>
              )}
            </div>
            <div className="muted" style={{fontSize:12,marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {lead.empresa && <span>{lead.empresa} · </span>}
              <span className="mono">{lead.telefono}</span>
              {lead.email && <span> · {lead.email}</span>}
            </div>
          </div>
          <div className="row" style={{gap:6,flexShrink:0}}>
            <button className="btn btn-sm" onClick={()=>setShowLlamar(true)}><IcoPhone size={13}/>Llamar</button>
            <button className="btn btn-sm" onClick={()=>setShowCotizar(true)}><IcoDoc size={13}/>Cotizar</button>
            <button className={'btn btn-sm '+(cerrada?'btn-accent':'btn-primary')} onClick={cerrar} disabled={cerrada}>
              <IcoCheck size={13}/>{cerrada?'Cerrada':'Cerrar venta'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="row" style={{padding:'8px 20px',borderBottom:'1px solid var(--line-2)',gap:16}}>
          {['conversacion','actividad','cotizaciones','notas'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{appearance:'none',border:0,background:'transparent',padding:'6px 0',cursor:'pointer',
                fontSize:12.5,fontWeight:500,
                color:tab===t?'var(--ink)':'var(--ink-4)',
                borderBottom:tab===t?'2px solid var(--ink)':'2px solid transparent'}}>
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:'auto',padding:'20px 28px',background:'var(--bg)'}}>
          {msgs.map((m,i) => <Msg key={m.id||i} m={m} vendedor={v}/>)}
          <div ref={bottomRef}/>
        </div>

        {/* Compose */}
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
          <div className="row" style={{gap:8}}>
            <textarea className="input" rows={2}
              placeholder={canalActivo==='whatsapp'?'Mensaje por WhatsApp…':'Mensaje por correo…'}
              value={draft}
              onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();send();} }}
              style={{resize:'none',flex:1}}/>
            <button className="btn btn-accent" onClick={send}
              disabled={!draft.trim()||sending}
              style={{alignSelf:'stretch',minWidth:72}}>
              {sending?'…':<><IcoSend size={14}/>Enviar</>}
            </button>
          </div>
          <div className="muted" style={{fontSize:10.5,marginTop:6}}>
            ⌘+Enter para enviar{isLiveMode&&sendCanalId?' · Canal: '+canalActivo:''}
          </div>
        </div>
      </div>

      {/* Panel lateral */}
      <aside style={{borderLeft:'1px solid var(--line)',padding:20,overflowY:'auto',background:'var(--panel)'}}>
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

      <Modal open={showCotizar} onClose={()=>setShowCotizar(false)} title="Nueva cotización" width={520}
        footer={<>
          <button className="btn" onClick={()=>setShowCotizar(false)}>Cancelar</button>
          <button className="btn btn-accent" onClick={()=>{setShowCotizar(false);toast('Cotización generada','ok');}}><IcoSend size={12}/>Generar y enviar</button>
        </>}>
        <div className="stack" style={{gap:12}}>
          <div className="row" style={{justifyContent:'space-between'}}>
            <div style={{fontSize:13,fontWeight:500}}>{lead.empresa || lead.contacto}</div>
            <span className="pill mono">{String(lead.id).slice(0,8)}</span>
          </div>
          <div className="grid-2">
            <div><div className="kpi-label" style={{marginBottom:4}}>Vigencia</div>
              <select className="input"><option>7 días</option><option>15 días</option><option>30 días</option></select></div>
            <div><div className="kpi-label" style={{marginBottom:4}}>Enviar por</div>
              <select className="input"><option>WhatsApp</option><option>Correo</option></select></div>
          </div>
          <div><div className="kpi-label" style={{marginBottom:4}}>Notas</div>
            <textarea className="input" rows={3} placeholder="Productos y cantidades…"/></div>
        </div>
      </Modal>
    </div>
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
    <div style={{display:'flex',gap:10,marginBottom:14,flexDirection:isV?'row-reverse':'row'}}>
      {isV
        ? <Avatar vendedor={vendedor} size={28}/>
        : <div className="avatar" style={{background:'var(--line)',color:'var(--ink-3)',width:28,height:28,fontSize:11,display:'grid',placeItems:'center'}}>C</div>}
      <div style={{maxWidth:'70%'}}>
        <div className="row" style={{gap:6,marginBottom:4,flexDirection:isV?'row-reverse':'row'}}>
          <span style={{fontSize:11.5,fontWeight:500}}>{isV?(vendedor?.nombre||'Vendedor'):'Cliente'}</span>
          {m.canal && <ChipCanal canal={m.canal} size={10}/>}
          <span className="muted mono" style={{fontSize:10.5}}>{m.ts}</span>
          {isV && m.estado === 'error' && <span title={m.errorDetalle} style={{color:'#ef4444',fontSize:11}}>⚠ no enviado</span>}
          {isV && m.estado === 'enviado' && <span title="Enviado" style={{color:'#22c55e',fontSize:11}}>✓✓</span>}
        </div>
        <div style={{
          background:isV?(m.estado==='error'?'#7f1d1d':'var(--ink)'):'var(--panel)',
          color:isV?'#fff':'var(--ink)',
          border:isV?'0':'1px solid var(--line)',
          padding:'10px 12px',borderRadius:10,fontSize:13,lineHeight:1.45,
          wordBreak:'break-word',
          opacity:isV&&m.estado==='error'?0.85:1,
        }}>{m.texto}</div>
      </div>
    </div>
  );
}

window.Inbox = Inbox;
