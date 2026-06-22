// Panel de asignación + Pipeline kanban + Cotizaciones + Remarketing + KPIs + Unidades
//
// Todas estas pantallas leen del backend vía ApiClient y se auto-refrescan con
// eventos WebSocket (new_message / new_lead / lead_updated).

// Hook genérico: ejecuta `fetcher` (Promise) al montar y en cada evento WS.
function useBackendData(fetcher, evts) {
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;
  const load = React.useCallback(() => {
    fetcherRef.current()
      .then(d => { setData(d); setErr(null); })
      .catch(e => setErr(e.message));
  }, []);
  React.useEffect(() => {
    load();
    const events = evts || ['new_message', 'new_lead', 'lead_updated'];
    const offs = events.map(ev => WsClient.on(ev, load));
    return () => offs.forEach(off => off());
  }, [load]);
  return { data, err, reload: load };
}

// Construye objeto vendedor compatible con <Avatar/> a partir de fila de /api/kpis
function vendedorFromKpiRow(r) {
  const nombre = r.vendedor_nombre || '—';
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  return { id: r.vendedor_id, nombre, iniciales, estado: 'offline', zona: r.zona };
}
const N = (x) => Number(x) || 0;

// ─── Asignación ───────────────────────────────────────────────────────────
function Asignacion() {
  const [modo, setModo] = React.useState('rr');
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();

  const nuevosQ = useBackendData(() => ApiClient.getLeads({ etapa: 'nuevo', limit: '100' }).then(r => (r.data || []).filter(l => !l.vendedor_id)));
  const vendQ = useBackendData(() => ApiClient.getKpis('mes').then(r => r.data || []));
  const nuevos = nuevosQ.data || [];
  const vendedores = (vendQ.data || []).map(r => ({ ...vendedorFromKpiRow(r), cargaActual: N(r.leads_activos) }));

  const asignar = (leadId, vendedorId) => {
    const v = vendedores.find(x => x.id === vendedorId);
    ApiClient.asignarLead(leadId, vendedorId)
      .then(() => { toast('Lead asignado a ' + (v ? v.nombre : 'vendedor'), 'ok'); nuevosQ.reload(); vendQ.reload(); })
      .catch(e => toast('Error: ' + e.message, 'bad'));
  };

  // Item 5: clasificar 1 clic — informativo (no se asigna) / prospecto (se asigna).
  const clasificar = (leadId, clasificacion) => {
    ApiClient.clasificarLead(leadId, clasificacion)
      .then(() => { toast('Lead marcado como ' + clasificacion, 'ok'); nuevosQ.reload(); })
      .catch(e => toast('Error: ' + e.message, 'bad'));
  };

  const autoAsignar = () => {
    setBusy(true);
    ApiClient.autoAsignar()
      .then(res => { toast((res.data?.resumen) || 'Asignación automática ejecutada', 'ok'); nuevosQ.reload(); vendQ.reload(); })
      .catch(e => toast('Error: ' + e.message, 'bad'))
      .finally(() => setBusy(false));
  };

  if (nuevosQ.err) return <div className="page"><div className="card" style={{padding:24,color:'var(--accent)'}}>Error: {nuevosQ.err}</div></div>;

  return (
    <div className="page">
      <div className="card" style={{marginBottom:16}}>
        <div className="card-hd">
          <h3>Reglas de distribución automática</h3>
          <div className="row" style={{gap:8}}>
            <button className={'btn btn-sm' + (modo==='rr'?' btn-primary':'')} onClick={()=>setModo('rr')}>Round-robin</button>
            <button className={'btn btn-sm' + (modo==='carga'?' btn-primary':'')} onClick={()=>setModo('carga')}>Por carga</button>
            <button className={'btn btn-sm' + (modo==='manual'?' btn-primary':'')} onClick={()=>setModo('manual')}>Manual</button>
          </div>
        </div>
        <div className="card-body">
          {modo === 'rr' && <div className="muted" style={{fontSize:13}}>Los leads nuevos se reparten <b style={{color:'var(--ink)'}}>equitativamente</b> entre los <b style={{color:'var(--ink)'}}>{vendedores.length}</b> vendedores activos. El backend aplica la regla configurada por canal.</div>}
          {modo === 'carga' && <div className="muted" style={{fontSize:13}}>Los leads se asignan al vendedor con <b style={{color:'var(--ink)'}}>menor carga actual</b> en leads abiertos.</div>}
          {modo === 'manual' && <div className="muted" style={{fontSize:13}}>Cada lead nuevo se asigna <b style={{color:'var(--ink)'}}>manualmente</b> desde esta pantalla.</div>}
          {modo !== 'manual' && <button className="btn btn-accent" style={{marginTop:12}} disabled={busy||nuevos.length===0} onClick={autoAsignar}><IcoBolt size={13}/>{busy?'Asignando…':'Asignar '+nuevos.length+' leads nuevos'}</button>}
        </div>
      </div>

      <div className="grid-2" style={{alignItems:'start'}}>
        {/* Leads sin asignar */}
        <div className="card">
          <div className="card-hd"><h3>Cola de leads nuevos <span className="pill pill-accent">{nuevos.length}</span></h3></div>
          <div style={{maxHeight:560,overflowY:'auto'}}>
            <table className="tbl">
              <thead><tr><th>Lead</th><th>Canal</th><th>Clasificar</th><th>Asignar</th></tr></thead>
              <tbody>
                {nuevos.map(l=>(
                  <tr key={l.id}>
                    <td>
                      <div style={{fontSize:12.5,fontWeight:500}}>{l.contacto}</div>
                      <div className="muted" style={{fontSize:11}}>{l.empresa || '—'} · {relTime(new Date(l.ultima_interaccion || l.created_at || Date.now()).getTime())}</div>
                    </td>
                    <td><ChipCanal canal={l.canal_tipo || 'whatsapp'}/></td>
                    <td>
                      <div className="row" style={{gap:4}}>
                        <button className={'btn btn-sm'+(l.clasificacion==='informativo'?' btn-primary':'')} style={{padding:'2px 6px',fontSize:10.5}}
                          onClick={()=>clasificar(l.id,'informativo')} title="No se asigna, se atiende y cierra">Info</button>
                        <button className={'btn btn-sm'+(l.clasificacion==='prospecto'?' btn-primary':'')} style={{padding:'2px 6px',fontSize:10.5}}
                          onClick={()=>clasificar(l.id,'prospecto')} title="Se asigna a vendedor">Prospecto</button>
                      </div>
                    </td>
                    <td>
                      {l.clasificacion==='informativo' ? (
                        <span className="muted" style={{fontSize:11}}>Bandeja general</span>
                      ) : (
                        <select className="input" style={{padding:'3px 6px',fontSize:11.5}} onChange={e=>{ if(e.target.value) asignar(l.id, e.target.value); }} defaultValue="">
                          <option value="" disabled>Elegir…</option>
                          {vendedores.map(v=><option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
                {nuevos.length===0 && <tr><td colSpan={4} className="muted" style={{fontSize:12,padding:16}}>Nada pendiente de asignar.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Carga por vendedor */}
        <div className="card">
          <div className="card-hd"><h3>Distribución por vendedor</h3><span className="card-sub">leads activos actuales</span></div>
          <div className="card-body" style={{padding:0}}>
            {vendedores.map((v,i)=>{
              const max = 20;
              return (
                <div key={v.id} className="row" style={{padding:'12px 16px',borderBottom:i<vendedores.length-1?'1px solid var(--line-2)':'0',gap:12}}>
                  <Avatar vendedor={v} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <div style={{fontSize:13,fontWeight:500}}>{v.nombre}</div>
                      <div className="mono" style={{fontSize:11.5}}>{v.cargaActual} / {max}</div>
                    </div>
                    <div style={{height:4,background:'var(--line-2)',borderRadius:2,overflow:'hidden',marginTop:5}}>
                      <div style={{width:Math.min(100,v.cargaActual/max*100)+'%',height:'100%',background:'var(--ink-3)'}}/>
                    </div>
                    <div className="muted" style={{fontSize:11,marginTop:3}}>{v.zona || '—'}</div>
                  </div>
                </div>
              );
            })}
            {vendedores.length===0 && <div className="muted" style={{fontSize:12,padding:16}}>Sin vendedores.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Kanban ──────────────────────────────────────────────────────
function Pipeline() {
  const { data, err, reload } = useBackendData(() => ApiClient.getLeads({ limit: '200' }).then(r => r.data || []));
  const [filtroPrio, setFiltroPrio] = React.useState('todas');
  const [dragId, setDragId] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(null);
  const toast = useToast();

  if (err) return <div className="page"><div className="card" style={{padding:24,color:'var(--accent)'}}>Error: {err}</div></div>;
  if (!data) return <div className="page"><div className="muted" style={{padding:24,fontSize:13}}>Cargando pipeline…</div></div>;

  const base = data.map(l => ({
    id: l.id, contacto: l.contacto, empresa: l.empresa, prioridad: l.prioridad || 'media',
    etapa: l.etapa, monto: N(l.monto_estimado), canal: l.canal_tipo || 'whatsapp',
    asignadoA: l.vendedor_id, motivoNoCierre: l.motivo_no_cierre,
  }));
  const leadsFiltered = base.filter(l => filtroPrio === 'todas' || l.prioridad === filtroPrio);

  const moveLead = (id, newEtapa) => {
    const l = base.find(x => x.id === id);
    if (!l || l.etapa === newEtapa) return;
    const et = ETAPAS.find(x => x.id === newEtapa);
    ApiClient.updateEtapa(id, newEtapa)
      .then(() => { toast(l.contacto + ' → ' + (et ? et.label : newEtapa), 'ok'); reload(); })
      .catch(e => toast('Error: ' + e.message, 'bad'));
  };

  return (
    <div className="page" style={{paddingRight:24,overflow:'hidden'}}>
      <div className="row" style={{marginBottom:16,gap:8}}>
        <span className="muted" style={{fontSize:12}}>{leadsFiltered.length} leads · {leadsFiltered.filter(l=>!['cerrado','no_cierre'].includes(l.etapa)).length} abiertos</span>
        <div style={{flex:1}}/>
        <div className="row" style={{gap:4}}>
          <span className="muted" style={{fontSize:11.5}}>Prioridad:</span>
          {['todas','alta','media','baja'].map(p=>(
            <button key={p} className={'btn btn-sm' + (filtroPrio===p?' btn-primary':'')} onClick={()=>setFiltroPrio(p)}>{p}</button>
          ))}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${ETAPAS.length},minmax(240px,1fr))`,gap:12,overflowX:'auto'}}>
        {ETAPAS.map(e=>{
          const leads = leadsFiltered.filter(l => l.etapa === e.id);
          const monto = leads.reduce((s,l)=>s+l.monto,0);
          const isDragOver = dragOver === e.id;
          return (
            <div key={e.id}
              onDragOver={ev=>{ev.preventDefault();setDragOver(e.id);}}
              onDragLeave={()=>setDragOver(null)}
              onDrop={ev=>{ev.preventDefault();setDragOver(null);if(dragId)moveLead(dragId,e.id);setDragId(null);}}
              style={{background:isDragOver?'oklch(0.96 0.08 95)':'var(--panel)',border:'1px solid var(--line)',borderRadius:10,display:'flex',flexDirection:'column',maxHeight:'calc(100vh - 220px)',transition:'background .1s'}}>
              <div style={{padding:'10px 12px',borderBottom:'1px solid var(--line)'}}>
                <div className="row" style={{justifyContent:'space-between'}}>
                  <div className="row" style={{gap:6}}>
                    <span style={{width:8,height:8,borderRadius:2,background:e.color}}/>
                    <span style={{fontSize:12.5,fontWeight:600}}>{e.label}</span>
                    <span className="pill" style={{fontSize:10.5}}>{leads.length}</span>
                  </div>
                </div>
                <div className="muted mono" style={{fontSize:10.5,marginTop:3}}>{money(monto)}</div>
              </div>
              <div style={{padding:8,display:'flex',flexDirection:'column',gap:6,overflowY:'auto',flex:1}}>
                {leads.map(l=>(
                  <div key={l.id} className="card" draggable
                    onDragStart={()=>setDragId(l.id)}
                    onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                    style={{padding:10,cursor:'grab',opacity:dragId===l.id?0.4:1}}>
                    <div className="row" style={{justifyContent:'space-between',marginBottom:6}}>
                      <span className="muted mono" style={{fontSize:10}}>{String(l.id).slice(0,8)}</span>
                      <span className={'prio-dot prio-'+l.prioridad}/>
                    </div>
                    <div style={{fontSize:12.5,fontWeight:500,marginBottom:2}}>{l.contacto}</div>
                    <div className="muted" style={{fontSize:10.5,marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.empresa || '—'}</div>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <div className="row" style={{gap:4}}>
                        <ChipCanal canal={l.canal} size={10}/>
                      </div>
                      <span className="mono tabular" style={{fontSize:11}}>{money(l.monto)}</span>
                    </div>
                    {l.etapa === 'no_cierre' && l.motivoNoCierre && (
                      <div className="pill pill-bad" style={{marginTop:6,fontSize:10}}>{l.motivoNoCierre}</div>
                    )}
                  </div>
                ))}
                {leads.length === 0 && <div className="muted" style={{fontSize:11,textAlign:'center',padding:20}}>{isDragOver?'Soltar aquí':'Sin leads'}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="muted" style={{fontSize:11,marginTop:12,textAlign:'center'}}>↔ Arrastra tarjetas entre columnas para cambiar de etapa</div>
    </div>
  );
}

// ─── Cotizaciones ─────────────────────────────────────────────────────────
function Cotizaciones() {
  const [verCot, setVerCot] = React.useState(null);
  const [nueva, setNueva] = React.useState(false);
  const toast = useToast();
  const { data, err, reload } = useBackendData(() => ApiClient.getCotizaciones({ limit: '100' }).then(r => r.data || []));

  const abrirPdf = async (id, e) => {
    if (e) e.stopPropagation();
    try { const url = await ApiClient.cotizacionPdfUrl(id); window.open(url, '_blank'); }
    catch (er) { toast('Error al abrir PDF: ' + er.message, 'bad'); }
  };

  const badgeFor = (e) => {
    if (e === 'aceptada') return 'pill-ok';
    if (e === 'rechazada') return 'pill-bad';
    if (e === 'vista') return 'pill-info';
    if (e === 'enviada') return 'pill-accent';
    return '';
  };

  if (err) return <div className="page"><div className="card" style={{padding:24,color:'var(--accent)'}}>Error: {err}</div></div>;
  if (!data) return <div className="page"><div className="muted" style={{padding:24,fontSize:13}}>Cargando cotizaciones…</div></div>;

  const base = data.map(c => ({
    id: c.id, folio: c.folio, cliente: c.lead_empresa || c.lead_contacto || '—', contacto: c.lead_contacto || '',
    vendedorId: c.vendedor_id, vendedorNombre: c.vendedor_nombre, estado: c.estado,
    monto: N(c.monto_total), vigencia: c.vigencia_dias, numItems: N(c.num_items),
    fecha: new Date(c.created_at),
  }));
  const enPipeline = base.filter(c => ['enviada','vista','pendiente'].includes(c.estado)).reduce((s,c)=>s+c.monto,0);
  const ticket = base.length ? Math.round(base.reduce((s,c)=>s+c.monto,0)/base.length) : 0;
  const inic = (nombre) => (nombre||'—').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();

  return (
    <div className="page">
      <div className="grid-4" style={{marginBottom:16}}>
        <KpiCard label="Cotizaciones este mes" value={base.length}/>
        <KpiCard label="Aceptadas" value={base.filter(c=>c.estado==='aceptada').length}/>
        <KpiCard label="Monto en pipeline" value={money(enPipeline)}/>
        <KpiCard label="Ticket promedio" value={money(ticket)}/>
      </div>
      <div className="card">
        <div className="card-hd">
          <h3>Cotizaciones</h3>
          <button className="btn btn-sm btn-accent" onClick={()=>setNueva(true)}><IcoPlus size={12}/>Nueva cotización</button>
        </div>
        <table className="tbl">
          <thead><tr><th>Folio</th><th>Cliente</th><th>Vendedor</th><th>Fecha</th><th>Vigencia</th><th>Estado</th><th style={{textAlign:'right'}}>Monto</th><th>PDF</th></tr></thead>
          <tbody>
            {base.map(c=>(
              <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setVerCot(c)}>
                <td className="mono" style={{fontSize:12}}>{c.folio}</td>
                <td>
                  <div style={{fontSize:12.5,fontWeight:500}}>{c.cliente}</div>
                  <div className="muted" style={{fontSize:11}}>{c.contacto}</div>
                </td>
                <td><div className="row" style={{gap:6}}><Avatar vendedor={{id:c.vendedorId,nombre:c.vendedorNombre,iniciales:inic(c.vendedorNombre)}} size={22}/><span style={{fontSize:12}}>{inic(c.vendedorNombre)}</span></div></td>
                <td className="mono muted" style={{fontSize:11.5}}>{c.fecha.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</td>
                <td className="mono muted" style={{fontSize:11.5}}>{c.vigencia} días</td>
                <td><span className={'pill '+badgeFor(c.estado)}>{c.estado}</span></td>
                <td className="tabular mono" style={{textAlign:'right',fontWeight:500}}>{money(c.monto)}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={(e)=>abrirPdf(c.id,e)} title="Abrir PDF"><IcoDoc size={12}/></button></td>
              </tr>
            ))}
            {base.length===0 && <tr><td colSpan={8} className="muted" style={{fontSize:12,padding:16}}>Sin cotizaciones.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!verCot} onClose={()=>setVerCot(null)} title={verCot ? 'Cotización ' + verCot.folio : ''} width={560}
        footer={<>
          {verCot && <button className="btn btn-primary" onClick={()=>abrirPdf(verCot.id)}><IcoDoc size={12}/>Abrir PDF</button>}
          <button className="btn" onClick={()=>setVerCot(null)}>Cerrar</button>
        </>}>
        {verCot && <CotizacionDetalle cot={verCot} badgeFor={badgeFor}/>}
      </Modal>

      <NuevaCotizacionModal open={nueva} onClose={()=>setNueva(false)} onDone={reload}/>
    </div>
  );
}

// Detalle de cotización con partidas reales (item 6/7)
function CotizacionDetalle({ cot, badgeFor }) {
  const [det, setDet] = React.useState(null);
  React.useEffect(() => {
    setDet(null);
    ApiClient.getCotizacion(cot.id).then(r => setDet(r.data)).catch(() => setDet({ items: [] }));
  }, [cot.id]);
  const items = det?.items || [];
  return (
    <>
      <div className="row" style={{justifyContent:'space-between',marginBottom:12}}>
        <div>
          <div style={{fontSize:14,fontWeight:600}}>{cot.cliente}</div>
          <div className="muted" style={{fontSize:12}}>{cot.contacto}</div>
        </div>
        <span className={'pill ' + badgeFor(cot.estado)}>{cot.estado}</span>
      </div>
      <div className="stack" style={{gap:8}}>
        <div className="row" style={{justifyContent:'space-between'}}><span className="muted" style={{fontSize:12}}>Vendedor</span><span style={{fontSize:12.5}}>{cot.vendedorNombre || '—'}</span></div>
        <div className="row" style={{justifyContent:'space-between'}}><span className="muted" style={{fontSize:12}}>Vigencia</span><span className="mono" style={{fontSize:12.5}}>{cot.vigencia} días</span></div>
      </div>
      {items.length > 0 && (
        <table className="tbl" style={{marginTop:12}}>
          <thead><tr><th>Partida</th><th style={{textAlign:'right'}}>Cant.</th><th style={{textAlign:'right'}}>P. unit.</th><th style={{textAlign:'right'}}>Importe</th></tr></thead>
          <tbody>
            {items.map((it,i)=>(
              <tr key={i}>
                <td style={{fontSize:12.5}}>{it.nombre}</td>
                <td className="mono" style={{textAlign:'right',fontSize:12}}>{it.cantidad}</td>
                <td className="mono" style={{textAlign:'right',fontSize:12}}>{money(Number(it.precio_unitario))}</td>
                <td className="mono tabular" style={{textAlign:'right',fontSize:12}}>{money(it.cantidad*Number(it.precio_unitario))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {det?.monto_cerrado != null && (
        <div className="row" style={{justifyContent:'space-between',marginTop:8,color:'var(--ok)'}}>
          <span style={{fontSize:12}}>Cerrado ({det.cierre_tipo})</span>
          <span className="mono tabular" style={{fontSize:13,fontWeight:600}}>{money(Number(det.monto_cerrado))}</span>
        </div>
      )}
      <div className="row" style={{justifyContent:'space-between',paddingTop:12,marginTop:8,borderTop:'1px solid var(--line)'}}>
        <span className="muted" style={{fontSize:12}}>Total</span>
        <span className="mono tabular" style={{fontSize:16,fontWeight:600}}>{money(cot.monto)}</span>
      </div>
    </>
  );
}

// Crear cotización rápida desde la pestaña global (item 6)
function NuevaCotizacionModal({ open, onClose, onDone }) {
  const toast = useToast();
  const [leads, setLeads] = React.useState([]);
  const [leadId, setLeadId] = React.useState('');
  const [monto, setMonto] = React.useState('');
  const [vigencia, setVigencia] = React.useState(15);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLeadId(''); setMonto(''); setVigencia(15);
    ApiClient.getLeads({ limit: '200' }).then(r => setLeads(r.data || [])).catch(() => setLeads([]));
  }, [open]);

  const crear = async () => {
    const m = parseFloat(monto);
    if (!leadId) { toast('Elige un lead', 'bad'); return; }
    if (!m || m <= 0) { toast('Captura un monto válido', 'bad'); return; }
    setBusy(true);
    try {
      const r = await ApiClient.crearCotizacion({ lead_id: leadId, monto: m, vigencia_dias: Number(vigencia) });
      toast('Cotización ' + r.data.folio + ' creada', 'ok');
      onDone?.(); onClose();
    } catch (e) { toast('Error: ' + e.message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva cotización" width={480}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-accent" onClick={crear} disabled={busy}><IcoPlus size={12}/>Crear</button>
      </>}>
      <div className="stack" style={{gap:12}}>
        <div><div className="kpi-label" style={{marginBottom:4}}>Lead</div>
          <select className="input" value={leadId} onChange={e=>setLeadId(e.target.value)}>
            <option value="">Elegir lead…</option>
            {leads.map(l=><option key={l.id} value={l.id}>{l.contacto}{l.empresa?(' · '+l.empresa):''}</option>)}
          </select></div>
        <div className="grid-2">
          <div><div className="kpi-label" style={{marginBottom:4}}>Monto (MXN)</div>
            <input className="input mono" type="number" min="0" step="0.01" placeholder="0.00" value={monto} onChange={e=>setMonto(e.target.value)}/></div>
          <div><div className="kpi-label" style={{marginBottom:4}}>Vigencia</div>
            <select className="input" value={vigencia} onChange={e=>setVigencia(e.target.value)}>
              <option value={7}>7 días</option><option value={15}>15 días</option><option value={30}>30 días</option></select></div>
        </div>
        <div className="muted" style={{fontSize:11}}>Genera el folio y un PDF abrible. Puedes desglosar partidas después.</div>
      </div>
    </Modal>
  );
}

// ─── Remarketing ──────────────────────────────────────────────────────────
function Remarketing() {
  const toast = useToast();
  const [recontactados, setRecontactados] = React.useState({});
  const [recoSeg, setRecoSeg] = React.useState(null); // segmento abierto en modal de recontacto
  const { data, err } = useBackendData(() => ApiClient.getLeads({ etapa: 'no_cierre', limit: '200' }).then(r => r.data || []));
  const segQ = useBackendData(() => ApiClient.getSegmentos().then(r => r.data || []));
  const segmentos = segQ.data || [];

  const exportar = (key) => {
    ApiClient.exportSegmentoCsv(key).then(() => toast('CSV exportado', 'ok')).catch(e => toast('Error: ' + e.message, 'bad'));
  };

  if (err) return <div className="page"><div className="card" style={{padding:24,color:'var(--accent)'}}>Error: {err}</div></div>;
  if (!data) return <div className="page"><div className="muted" style={{padding:24,fontSize:13}}>Cargando…</div></div>;

  const base = data.map(l => ({
    id: l.id, contacto: l.contacto, empresa: l.empresa,
    monto: N(l.monto_estimado), motivoNoCierre: l.motivo_no_cierre || 'Sin motivo',
    createdAt: new Date(l.created_at || Date.now()).getTime(),
  }));
  const motivos = {};
  base.forEach(l => { motivos[l.motivoNoCierre] = (motivos[l.motivoNoCierre]||0)+1; });
  const total = base.reduce((s,l)=>s+l.monto,0);

  return (
    <div className="page">
      <div className="grid-3" style={{marginBottom:16}}>
        <KpiCard label="Leads no cerrados" value={base.length}/>
        <KpiCard label="Valor recuperable" value={money(total)}/>
        <KpiCard label="Mayor motivo" value={Object.entries(motivos).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—'}/>
      </div>

      <div className="grid-2" style={{alignItems:'start'}}>
        <div className="card">
          <div className="card-hd"><h3>Motivos de no cierre</h3></div>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10}}>
            {Object.entries(motivos).sort((a,b)=>b[1]-a[1]).map(([m,n])=>{
              const max = Math.max(...Object.values(motivos));
              return (
                <div key={m} className="row" style={{gap:10}}>
                  <div style={{width:140,fontSize:12.5}}>{m}</div>
                  <div style={{flex:1,height:18,background:'var(--line-2)',borderRadius:3,overflow:'hidden'}}>
                    <div style={{width:(n/max*100)+'%',height:'100%',background:'var(--bad)',opacity:0.7}}/>
                  </div>
                  <div className="mono tabular" style={{width:30,textAlign:'right',fontSize:12}}>{n}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><h3>Segmentos automáticos</h3><span className="card-sub">para campañas y re-contacto</span></div>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
            {segmentos.length === 0 && <div className="muted" style={{fontSize:12}}>Cargando segmentos…</div>}
            {segmentos.map(s => (
              <div key={s.key} className="row" style={{gap:12,padding:12,border:'1px solid var(--line)',borderRadius:8}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{s.label}</div>
                  <div className="muted" style={{fontSize:11}}>{s.count} leads</div>
                </div>
                <button className="btn btn-sm btn-ghost" disabled={s.count===0} onClick={()=>exportar(s.key)} title="Exportar CSV para FB/IG"><IcoDoc size={11}/>CSV</button>
                <button className="btn btn-sm btn-accent" disabled={s.count===0} onClick={()=>setRecoSeg(s)}><IcoRefresh size={11}/>Re-contactar</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{marginTop:16}}>
        <div className="card-hd"><h3>Leads a re-contactar</h3></div>
        <table className="tbl">
          <thead><tr><th>Lead</th><th>Empresa</th><th>Motivo</th><th>Monto perdido</th><th>Días</th><th></th></tr></thead>
          <tbody>
            {base.slice(0,10).map(l=>(
              <tr key={l.id}>
                <td><div style={{fontSize:12.5,fontWeight:500}}>{l.contacto}</div><div className="muted mono" style={{fontSize:11}}>{l.id}</div></td>
                <td style={{fontSize:12.5}}>{l.empresa}</td>
                <td><span className="pill pill-bad" style={{fontSize:10.5}}>{l.motivoNoCierre}</span></td>
                <td className="tabular mono">{money(l.monto)}</td>
                <td className="mono muted" style={{fontSize:11.5}}>{Math.floor((Date.now()-l.createdAt)/86400000)}d</td>
                <td>
                  <button className="btn btn-sm" disabled={recontactados[l.id]}
                    onClick={()=>setRecoSeg({ key:null, label:'Re-contactar a '+l.contacto, leadIds:[l.id], onSent:()=>setRecontactados(s=>({...s,[l.id]:true})) })}>
                    {recontactados[l.id] ? <><IcoCheck size={11}/>Contactado</> : <><IcoRefresh size={11}/>Re-contactar</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RecontactarModal seg={recoSeg} onClose={()=>setRecoSeg(null)}/>
    </div>
  );
}

// Modal de re-contacto: elige plantilla/mensaje y canal, encola campaña (items 13/15)
function RecontactarModal({ seg, onClose }) {
  const toast = useToast();
  const [plantillas, setPlantillas] = React.useState([]);
  const [canales, setCanales] = React.useState([]);
  const [plantillaId, setPlantillaId] = React.useState('');
  const [mensaje, setMensaje] = React.useState('');
  const [canalId, setCanalId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const open = !!seg;

  React.useEffect(() => {
    if (!open) return;
    setPlantillaId(''); setMensaje(''); setCanalId('');
    ApiClient.getPlantillas().then(r => setPlantillas(r.data || [])).catch(() => setPlantillas([]));
    ApiClient.getCanales().then(r => {
      const list = r.data || r || [];
      const wa = list.filter(c => c.tipo === 'whatsapp');
      setCanales(list);
      if (wa[0]) setCanalId(wa[0].id);
    }).catch(() => setCanales([]));
  }, [open]);

  const enviar = async () => {
    if (!canalId) { toast('Elige un canal', 'bad'); return; }
    if (!plantillaId && !mensaje.trim()) { toast('Elige plantilla o escribe mensaje', 'bad'); return; }
    setBusy(true);
    try {
      let leadIds = seg.leadIds;
      if (!leadIds && seg.key) {
        const r = await ApiClient.getSegmento(seg.key);
        leadIds = (r.data || []).map(l => l.id);
      }
      if (!leadIds || leadIds.length === 0) { toast('Segmento sin leads', 'info'); setBusy(false); return; }
      await ApiClient.recontactar({
        lead_ids: leadIds, canal_id: canalId,
        plantilla_id: plantillaId || undefined,
        mensaje: plantillaId ? undefined : mensaje.trim(),
        tipo: 'whatsapp', nombre: seg.label,
      });
      toast('Re-contacto encolado a ' + leadIds.length + ' leads', 'ok');
      seg.onSent?.();
      onClose();
    } catch (e) { toast('Error: ' + e.message, 'bad'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={seg ? seg.label : ''} width={480}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn btn-accent" onClick={enviar} disabled={busy}><IcoSend size={12}/>Enviar</button>
      </>}>
      <div className="stack" style={{gap:12}}>
        <div><div className="kpi-label" style={{marginBottom:4}}>Canal WhatsApp</div>
          <select className="input" value={canalId} onChange={e=>setCanalId(e.target.value)}>
            <option value="">Elegir canal…</option>
            {canales.filter(c=>c.tipo==='whatsapp').map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select></div>
        <div><div className="kpi-label" style={{marginBottom:4}}>Plantilla aprobada</div>
          <select className="input" value={plantillaId} onChange={e=>setPlantillaId(e.target.value)}>
            <option value="">— Mensaje libre —</option>
            {plantillas.map(p=><option key={p.id} value={p.id}>{p.nombre} ({p.categoria})</option>)}
          </select></div>
        {!plantillaId && (
          <div><div className="kpi-label" style={{marginBottom:4}}>Mensaje</div>
            <textarea className="input" rows={3} placeholder="Mensaje de seguimiento…" value={mensaje} onChange={e=>setMensaje(e.target.value)}/></div>
        )}
        <div className="muted" style={{fontSize:11}}>Reenvío en un clic — se encola como campaña.</div>
      </div>
    </Modal>
  );
}

// ─── KPIs ─────────────────────────────────────────────────────────────────
function KpisView() {
  const [sort, setSort] = React.useState('ingresos');
  const { data, err } = useBackendData(() => ApiClient.getKpis('mes').then(r => r.data || []));

  if (err) return <div className="page"><div className="card" style={{padding:24,color:'var(--accent)'}}>Error: {err}</div></div>;
  if (!data) return <div className="page"><div className="muted" style={{padding:24,fontSize:13}}>Cargando KPIs…</div></div>;

  const rows = data.map(r => ({
    ...vendedorFromKpiRow(r),
    msgs: N(r.mensajes_enviados) + N(r.mensajes_recibidos),
    respMin: r.tiempo_respuesta_min_promedio != null ? Number(r.tiempo_respuesta_min_promedio) : null,
    cotiz: N(r.cotizaciones_enviadas),
    cerradas: N(r.leads_cerrados),
    tasa: N(r.tasa_conversion_pct),
    ingresos: N(r.ingresos_periodo),
  }));
  const sorted = [...rows].sort((a,b) => (b[sort] || 0) - (a[sort] || 0));
  const maxMsgs = Math.max(1, ...rows.map(v=>v.msgs));
  const totMsgs = rows.reduce((s,k)=>s+k.msgs,0);
  const conResp = rows.filter(k=>k.respMin!=null);
  const respEquipo = conResp.length ? (conResp.reduce((s,k)=>s+k.respMin,0)/conResp.length).toFixed(1)+' min' : '—';
  const totCotiz = rows.reduce((s,k)=>s+k.cotiz,0);
  const totCerr = rows.reduce((s,k)=>s+k.cerradas,0);
  const tasaGlobal = totCotiz ? Math.round(totCerr/totCotiz*100) : 0;

  return (
    <div className="page">
      <div className="grid-4" style={{marginBottom:16}}>
        <KpiCard label="Mensajes totales" value={totMsgs.toLocaleString()}/>
        <KpiCard label="Resp. promedio equipo" value={respEquipo}/>
        <KpiCard label="Cotizaciones enviadas" value={totCotiz}/>
        <KpiCard label="Tasa conversión global" value={tasaGlobal+'%'}/>
      </div>

      <div className="card">
        <div className="card-hd">
          <h3>Desempeño por vendedor</h3>
          <div className="row" style={{gap:4}}>
            <span className="muted" style={{fontSize:11.5}}>Ordenar por:</span>
            {[['ingresos','Ingresos'],['tasa','Conversión'],['respMin','Resp.'],['cotiz','Cotiz.'],['msgs','Msgs']].map(([k,l])=>(
              <button key={k} className={'btn btn-sm' + (sort===k?' btn-primary':'')} onClick={()=>setSort(k)}>{l}</button>
            ))}
          </div>
        </div>
        <table className="tbl">
          <thead><tr>
            <th style={{width:40}}>#</th><th>Vendedor</th><th>Zona</th>
            <th>Mensajes</th><th>Resp. prom.</th><th>Cotizaciones</th>
            <th>Cerradas</th><th>Tasa</th><th style={{textAlign:'right'}}>Ingresos</th>
          </tr></thead>
          <tbody>
            {sorted.map((k,i)=>(
              <tr key={k.id}>
                <td className="mono muted" style={{fontSize:11}}>{String(i+1).padStart(2,'0')}</td>
                <td><div className="row" style={{gap:8}}><Avatar vendedor={k} size={26}/><span style={{fontSize:13,fontWeight:500}}>{k.nombre}</span></div></td>
                <td className="muted" style={{fontSize:12}}>{k.zona || '—'}</td>
                <td>
                  <div className="row" style={{gap:8}}>
                    <div style={{width:80,height:6,background:'var(--line-2)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{width:(k.msgs/maxMsgs*100)+'%',height:'100%',background:'var(--ink-3)'}}/>
                    </div>
                    <span className="mono tabular" style={{fontSize:12}}>{k.msgs}</span>
                  </div>
                </td>
                <td className="mono tabular" style={{fontSize:11.5}}>{k.respMin != null ? k.respMin+' min' : '—'}</td>
                <td className="mono tabular">{k.cotiz}</td>
                <td className="mono tabular">{k.cerradas}</td>
                <td className="mono tabular" style={{fontWeight:500}}>{k.tasa}%</td>
                <td className="tabular mono" style={{textAlign:'right',fontWeight:500}}>{money(k.ingresos)}</td>
              </tr>
            ))}
            {sorted.length===0 && <tr><td colSpan={9} className="muted" style={{fontSize:12,padding:16}}>Sin vendedores.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Unidades GPS ─────────────────────────────────────────────────────────
function Unidades() {
  const [sel, setSel] = React.useState('U01');
  const u = UNIDADES.find(x=>x.id===sel);
  return (
    <div className="page">
      <div className="card" style={{background:'oklch(0.97 0.04 95)',border:'1px dashed oklch(0.75 0.15 95)',padding:14,marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:32,height:32,borderRadius:8,background:'var(--accent)',color:'var(--accent-ink)',display:'grid',placeItems:'center'}}>
          <IcoTruck size={16}/>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600}}>Roadmap · Fase 2</div>
          <div className="muted" style={{fontSize:12}}>Vista previa de módulo GPS para camionetas. Requiere integración con proveedor (Wialon, Teltonika o similar).</div>
        </div>
        <span className="pill pill-accent">próximamente</span>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16}}>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{aspectRatio:'16/10',background:'linear-gradient(180deg, oklch(0.98 0.01 240) 0%, oklch(0.94 0.02 240) 100%)',position:'relative'}}>
            {/* calles placeholder */}
            <svg viewBox="0 0 100 62" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}>
              <defs>
                <pattern id="gg" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0v8" fill="none" stroke="oklch(0.92 0.01 240)" strokeWidth="0.15"/></pattern>
              </defs>
              <rect width="100" height="62" fill="url(#gg)"/>
              <path d="M0 40 L100 38" stroke="oklch(0.85 0.02 240)" strokeWidth="0.8" fill="none"/>
              <path d="M30 0 L34 62" stroke="oklch(0.85 0.02 240)" strokeWidth="0.8" fill="none"/>
              <path d="M60 0 L56 62" stroke="oklch(0.85 0.02 240)" strokeWidth="0.6" fill="none"/>
              <path d="M0 20 L100 22" stroke="oklch(0.88 0.02 240)" strokeWidth="0.5" fill="none"/>
              <path d="M15 12 Q 40 30 70 50" stroke="var(--accent)" strokeWidth="0.4" strokeDasharray="1 1" fill="none"/>
            </svg>
            {UNIDADES.map(un=>(
              <button key={un.id} onClick={()=>setSel(un.id)}
                style={{position:'absolute',left:un.x+'%',top:un.y+'%',transform:'translate(-50%,-50%)',
                  appearance:'none',border:0,cursor:'pointer',background:'transparent',padding:0}}>
                <div style={{
                  width:36,height:36,borderRadius:'50%',
                  background:un.id===sel?'var(--accent)':'var(--ink)',
                  color:un.id===sel?'var(--accent-ink)':'#fff',
                  display:'grid',placeItems:'center',
                  boxShadow:'0 4px 12px rgba(0,0,0,0.2)',
                  border:'3px solid #fff',
                }}>
                  <IcoTruck size={14}/>
                </div>
                <div style={{position:'absolute',top:-18,left:'50%',transform:'translateX(-50%)',
                  background:'var(--ink)',color:'#fff',fontSize:10,padding:'2px 5px',borderRadius:3,fontFamily:'JetBrains Mono',whiteSpace:'nowrap'}}>
                  {un.id}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd"><h3>{u.id} · {u.placa}</h3><span className={'pill ' + (u.estatus==='En ruta'?'pill-ok':u.estatus==='Entrega'?'pill-info':'pill-warn')}>{u.estatus}</span></div>
            <div className="card-body" style={{display:'flex',flexDirection:'column',gap:10}}>
              <SidePanelRow label="Operador" value={<div className="row" style={{gap:6}}><Avatar vendedor={u.vendedor} size={22}/>{VENDEDORES.find(v=>v.id===u.vendedor)?.nombre}</div>}/>
              <SidePanelRow label="Ubicación" value={u.ubicacion}/>
              <SidePanelRow label="Velocidad" value="42 km/h" mono/>
              <SidePanelRow label="Próx. entrega" value="45 min" mono/>
              <SidePanelRow label="Última señal" value="hace 12 s" mono/>
            </div>
          </div>
          <div className="card" style={{marginTop:12}}>
            <div className="card-hd"><h3>Flota activa</h3></div>
            <div style={{padding:0}}>
              {UNIDADES.map((un,i)=>(
                <button key={un.id} onClick={()=>setSel(un.id)}
                  style={{appearance:'none',border:0,width:'100%',textAlign:'left',cursor:'pointer',
                    background:sel===un.id?'var(--line-2)':'transparent',
                    padding:'10px 16px',borderBottom:i<UNIDADES.length-1?'1px solid var(--line-2)':'0',
                    display:'flex',gap:10,alignItems:'center',font:'inherit'}}>
                  <div style={{width:22,height:22,borderRadius:5,background:'var(--ink)',color:'#fff',display:'grid',placeItems:'center'}}><IcoTruck size={11}/></div>
                  <div style={{flex:1}}>
                    <div className="mono" style={{fontSize:11.5,fontWeight:500}}>{un.id} · {un.placa}</div>
                    <div className="muted" style={{fontSize:10.5}}>{un.ubicacion}</div>
                  </div>
                  <span className="pill" style={{fontSize:10}}>{un.estatus}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Asignacion, Pipeline, Cotizaciones, Remarketing, KpisView, Unidades, KpiCard });
