// Panel de asignación + Pipeline kanban + Cotizaciones + Remarketing + KPIs + Unidades

// ─── Asignación ───────────────────────────────────────────────────────────
function Asignacion() {
  const [modo, setModo] = React.useState('rr');
  const [asignados, setAsignados] = React.useState({});
  const toast = useToast();
  const nuevos = LEADS.filter(l => l.etapa === 'nuevo' && !l.asignadoA);

  const rrOrder = VENDEDORES.filter(v => v.activo);
  const asignar = (leadId, vendedorId) => {
    setAsignados({...asignados, [leadId]: vendedorId});
    const v = VENDEDORES.find(x=>x.id===vendedorId);
    toast('Lead asignado a ' + v.nombre, 'ok');
  };

  const autoAsignar = () => {
    const sorted = modo === 'rr'
      ? rrOrder
      : [...rrOrder].sort((a,b) => a.cargaActual - b.cargaActual);
    const nuevos2 = {};
    nuevos.forEach((l,i) => { nuevos2[l.id] = sorted[i % sorted.length].id; });
    setAsignados({...asignados, ...nuevos2});
    toast(nuevos.length + ' leads distribuidos automáticamente', 'ok');
  };

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
          {modo === 'rr' && <div className="muted" style={{fontSize:13}}>Los leads nuevos se reparten <b style={{color:'var(--ink)'}}>equitativamente</b> entre los <b style={{color:'var(--ink)'}}>{rrOrder.length}</b> vendedores activos, en el orden listado abajo. Se omite a quien esté <span className="pill">offline</span>.</div>}
          {modo === 'carga' && <div className="muted" style={{fontSize:13}}>Los leads se asignan al vendedor con <b style={{color:'var(--ink)'}}>menor carga actual</b> en leads abiertos. Evita saturar a un vendedor con muchos leads activos.</div>}
          {modo === 'manual' && <div className="muted" style={{fontSize:13}}>Cada lead nuevo se asigna <b style={{color:'var(--ink)'}}>manualmente</b> desde esta pantalla. El gerente mantiene control total.</div>}
          {modo !== 'manual' && <button className="btn btn-accent" style={{marginTop:12}} onClick={autoAsignar}><IcoBolt size={13}/>Asignar {nuevos.length} leads nuevos</button>}
        </div>
      </div>

      <div className="grid-2" style={{alignItems:'start'}}>
        {/* Leads sin asignar */}
        <div className="card">
          <div className="card-hd"><h3>Cola de leads nuevos <span className="pill pill-accent">{nuevos.length}</span></h3></div>
          <div style={{maxHeight:560,overflowY:'auto'}}>
            <table className="tbl">
              <thead><tr><th>Lead</th><th>Canal</th><th>Espera</th><th>Asignar</th></tr></thead>
              <tbody>
                {nuevos.map(l=>{
                  const asig = asignados[l.id];
                  return (
                    <tr key={l.id}>
                      <td>
                        <div style={{fontSize:12.5,fontWeight:500}}>{l.contacto}</div>
                        <div className="muted" style={{fontSize:11}}>{l.empresa}</div>
                      </td>
                      <td><ChipCanal canal={l.canal}/></td>
                      <td className="mono muted" style={{fontSize:11.5}}>{relTime(l.ultimaInteraccion)}</td>
                      <td>
                        {asig ? (
                          <div className="row" style={{gap:6}}>
                            <Avatar vendedor={asig} size={22}/>
                            <span style={{fontSize:11.5}}>{VENDEDORES.find(v=>v.id===asig)?.iniciales}</span>
                            <button className="btn btn-sm btn-ghost" onClick={()=>setAsignados({...asignados,[l.id]:null})}><IcoX size={11}/></button>
                          </div>
                        ) : (
                          <select className="input" style={{padding:'3px 6px',fontSize:11.5}} onChange={e=>asignar(l.id, e.target.value)} defaultValue="">
                            <option value="" disabled>Elegir…</option>
                            {rrOrder.map(v=><option key={v.id} value={v.id}>{v.nombre}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Carga por vendedor */}
        <div className="card">
          <div className="card-hd"><h3>Distribución por vendedor</h3><span className="card-sub">{Object.keys(asignados).length} nuevos asignados esta sesión</span></div>
          <div className="card-body" style={{padding:0}}>
            {VENDEDORES.map((v,i)=>{
              const addr = Object.values(asignados).filter(x => x === v.id).length;
              const total = v.cargaActual + addr;
              const max = 20;
              return (
                <div key={v.id} className="row" style={{padding:'12px 16px',borderBottom:i<VENDEDORES.length-1?'1px solid var(--line-2)':'0',gap:12}}>
                  <Avatar vendedor={v} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <div style={{fontSize:13,fontWeight:500}}>{v.nombre}</div>
                      <div className="mono" style={{fontSize:11.5}}>{v.cargaActual}{addr>0 && <b style={{color:'var(--ok)'}}> +{addr}</b>} / {max}</div>
                    </div>
                    <div style={{height:4,background:'var(--line-2)',borderRadius:2,overflow:'hidden',marginTop:5}}>
                      <div style={{width:(v.cargaActual/max*100)+'%',height:'100%',background:'var(--ink-3)'}}/>
                      {addr>0 && <div style={{width:(addr/max*100)+'%',height:'100%',background:'var(--accent)',marginTop:-4}}/>}
                    </div>
                    <div className="muted" style={{fontSize:11,marginTop:3}}>{v.zona} · <span className="pill" style={{fontSize:10}}>{v.estado}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Kanban ──────────────────────────────────────────────────────
function Pipeline({ rol, rolVendedor }) {
  const base = rol === 'gerente' ? LEADS : LEADS.filter(l => l.asignadoA === rolVendedor);
  const [etapas, setEtapas] = React.useState(() => {
    const m = {};
    base.forEach(l => { m[l.id] = l.etapa; });
    return m;
  });
  const [showFilter, setShowFilter] = React.useState(false);
  const [filtroPrio, setFiltroPrio] = React.useState('todas');
  const [dragId, setDragId] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(null);
  const toast = useToast();

  const leadsFiltered = base.filter(l => filtroPrio === 'todas' || l.prioridad === filtroPrio);

  const moveLead = (id, newEtapa) => {
    if (etapas[id] === newEtapa) return;
    setEtapas(e => ({...e, [id]: newEtapa}));
    const l = base.find(x => x.id === id);
    const et = ETAPAS.find(x => x.id === newEtapa);
    toast(l.contacto + ' → ' + et.label, 'ok');
  };

  return (
    <div className="page" style={{paddingRight:24,overflow:'hidden'}}>
      <div className="row" style={{marginBottom:16,gap:8}}>
        <span className="muted" style={{fontSize:12}}>{leadsFiltered.length} leads · {leadsFiltered.filter(l=>!['cerrado','no_cierre'].includes(etapas[l.id])).length} abiertos</span>
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
          const leads = leadsFiltered.filter(l => etapas[l.id] === e.id);
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
                      <span className="muted mono" style={{fontSize:10}}>{l.id}</span>
                      <span className={'prio-dot prio-'+l.prioridad}/>
                    </div>
                    <div style={{fontSize:12.5,fontWeight:500,marginBottom:2}}>{l.contacto}</div>
                    <div className="muted" style={{fontSize:10.5,marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.empresa}</div>
                    <div className="row" style={{justifyContent:'space-between'}}>
                      <div className="row" style={{gap:4}}>
                        <ChipCanal canal={l.canal} size={10}/>
                        {l.asignadoA && <Avatar vendedor={l.asignadoA} size={18}/>}
                      </div>
                      <span className="mono tabular" style={{fontSize:11}}>{money(l.monto)}</span>
                    </div>
                    {etapas[l.id] === 'no_cierre' && l.motivoNoCierre && (
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
function Cotizaciones({ rol, rolVendedor }) {
  const [showNueva, setShowNueva] = React.useState(false);
  const [verCot, setVerCot] = React.useState(null);
  const toast = useToast();
  const base = rol === 'gerente' ? COTIZACIONES : COTIZACIONES.filter(c => c.vendedor === rolVendedor);
  const badgeFor = (e) => {
    if (e === 'aceptada') return 'pill-ok';
    if (e === 'rechazada') return 'pill-bad';
    if (e === 'vista') return 'pill-info';
    if (e === 'enviada') return 'pill-accent';
    return '';
  };
  return (
    <div className="page">
      <div className="grid-4" style={{marginBottom:16}}>
        <KpiCard label="Cotizaciones este mes" value={base.length}/>
        <KpiCard label="Aceptadas" value={base.filter(c=>c.estado==='aceptada').length}/>
        <KpiCard label="Monto en pipeline" value={money(base.filter(c=>['enviada','vista','pendiente'].includes(c.estado)).reduce((s,c)=>s+c.monto,0))}/>
        <KpiCard label="Ticket promedio" value={money(Math.round(base.reduce((s,c)=>s+c.monto,0)/base.length))}/>
      </div>
      <div className="card">
        <div className="card-hd">
          <h3>Cotizaciones</h3>
          <button className="btn btn-sm btn-accent" onClick={()=>setShowNueva(true)}><IcoPlus size={12}/>Nueva cotización</button>
        </div>
        <table className="tbl">
          <thead><tr><th>Folio</th><th>Cliente</th><th>Vendedor</th><th>Fecha</th><th>Vigencia</th><th>Estado</th><th style={{textAlign:'right'}}>Monto</th><th></th></tr></thead>
          <tbody>
            {base.map(c=>(
              <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setVerCot(c)}>
                <td className="mono" style={{fontSize:12}}>{c.id}</td>
                <td>
                  <div style={{fontSize:12.5,fontWeight:500}}>{c.cliente}</div>
                  <div className="muted" style={{fontSize:11}}>{c.contacto}</div>
                </td>
                <td><div className="row" style={{gap:6}}><Avatar vendedor={c.vendedor} size={22}/><span style={{fontSize:12}}>{VENDEDORES.find(v=>v.id===c.vendedor)?.iniciales}</span></div></td>
                <td className="mono muted" style={{fontSize:11.5}}>{c.fecha.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</td>
                <td className="mono muted" style={{fontSize:11.5}}>{c.vigencia} días</td>
                <td><span className={'pill '+badgeFor(c.estado)}>{c.estado}</span></td>
                <td className="tabular mono" style={{textAlign:'right',fontWeight:500}}>{money(c.monto)}</td>
                <td><IcoChevronR size={12}/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showNueva} onClose={()=>setShowNueva(false)} title="Nueva cotización" width={560}
        footer={<>
          <button className="btn" onClick={()=>setShowNueva(false)}>Cancelar</button>
          <button className="btn btn-accent" onClick={()=>{setShowNueva(false);toast('Cotización COT-2065 creada','ok');}}><IcoPlus size={12}/>Crear cotización</button>
        </>}>
        <div className="stack" style={{gap:12}}>
          <div><div className="kpi-label" style={{marginBottom:4}}>Cliente</div><select className="input"><option>—Seleccionar lead—</option>{LEADS.slice(0,10).map(l=><option key={l.id}>{l.empresa} · {l.contacto}</option>)}</select></div>
          <div className="grid-2"><div><div className="kpi-label" style={{marginBottom:4}}>Vigencia</div><select className="input"><option>7 días</option><option>15 días</option><option>30 días</option></select></div><div><div className="kpi-label" style={{marginBottom:4}}>Enviar por</div><select className="input"><option>WhatsApp</option><option>Correo</option><option>Ambos</option></select></div></div>
          <div><div className="kpi-label" style={{marginBottom:4}}>Notas al cliente</div><textarea className="input" rows={3} defaultValue="Adjunto cotización con los productos solicitados."/></div>
        </div>
      </Modal>

      <Modal open={!!verCot} onClose={()=>setVerCot(null)} title={verCot ? 'Cotización ' + verCot.id : ''} width={620}
        footer={<>
          <button className="btn" onClick={()=>setVerCot(null)}>Cerrar</button>
          <button className="btn"><IcoDoc size={12}/>Descargar PDF</button>
          <button className="btn btn-primary"><IcoSend size={12}/>Reenviar</button>
        </>}>
        {verCot && (
          <>
            <div className="row" style={{justifyContent:'space-between',marginBottom:12}}>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{verCot.cliente}</div>
                <div className="muted" style={{fontSize:12}}>{verCot.contacto}</div>
              </div>
              <span className={'pill ' + badgeFor(verCot.estado)}>{verCot.estado}</span>
            </div>
            <table className="tbl" style={{fontSize:12}}>
              <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th style={{textAlign:'right'}}>Subtotal</th></tr></thead>
              <tbody>
                {verCot.productos.map((p,i)=>(
                  <tr key={i}><td>{p.nombre}</td><td className="mono">{p.cantidad}</td><td className="mono">{money(p.precio)}</td><td className="mono" style={{textAlign:'right'}}>{money(p.cantidad*p.precio)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{justifyContent:'space-between',paddingTop:12,marginTop:8,borderTop:'1px solid var(--line)'}}>
              <span className="muted" style={{fontSize:12}}>Total</span>
              <span className="mono tabular" style={{fontSize:16,fontWeight:600}}>{money(verCot.monto)}</span>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

// ─── Remarketing ──────────────────────────────────────────────────────────
function Remarketing({ rol, rolVendedor }) {
  const toast = useToast();
  const [recontactados, setRecontactados] = React.useState({});
  const [camps, setCamps] = React.useState({});
  const base = (rol === 'gerente' ? LEADS : LEADS.filter(l=>l.asignadoA===rolVendedor)).filter(l=>l.etapa==='no_cierre');
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
          <div className="card-hd"><h3>Campañas sugeridas</h3></div>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
            {[
              ['c1','Descuento por volumen','Motivo: Precio','Precio','WhatsApp'],
              ['c2','Entrega express 24h','Motivo: Tiempo de entrega','Tiempo de entrega','Correo'],
              ['c3','Match de precio','Motivo: Competencia','Competencia','WhatsApp'],
              ['c4','Financiamiento a 60 días','Motivo: Sin presupuesto','Sin presupuesto','Correo'],
            ].map(([id,titulo,seg,motivo,canal])=>{
              const n = motivos[motivo]||0;
              const lanzada = camps[id];
              return (
                <div key={id} className="row" style={{gap:12,padding:12,border:'1px solid var(--line)',borderRadius:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{titulo}</div>
                    <div className="muted" style={{fontSize:11}}>{seg} · {n} leads · canal: {canal}</div>
                  </div>
                  <button className={'btn btn-sm ' + (lanzada?'':'btn-accent')} disabled={n===0||lanzada}
                    onClick={()=>{setCamps({...camps,[id]:true});toast('Campaña "'+titulo+'" lanzada a '+n+' leads','ok');}}>
                    {lanzada ? <><IcoCheck size={11}/>Lanzada</> : 'Lanzar'}
                  </button>
                </div>
              );
            })}
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
                  <button className={'btn btn-sm ' + (recontactados[l.id]?'':'')} disabled={recontactados[l.id]}
                    onClick={()=>{setRecontactados({...recontactados,[l.id]:true});toast('Mensaje de re-contacto enviado a '+l.contacto,'ok');}}>
                    {recontactados[l.id] ? <><IcoCheck size={11}/>Contactado</> : <><IcoRefresh size={11}/>Re-contactar</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── KPIs ─────────────────────────────────────────────────────────────────
function KpisView() {
  const [sort, setSort] = React.useState('ingresos');
  const sorted = [...VENDEDORES].sort((a,b) => (KPIS[b.id][sort] || 0) - (KPIS[a.id][sort] || 0));
  const maxMsgs = Math.max(...VENDEDORES.map(v=>KPIS[v.id].msgs));
  return (
    <div className="page">
      <div className="grid-4" style={{marginBottom:16}}>
        <KpiCard label="Mensajes totales" value={Object.values(KPIS).reduce((s,k)=>s+k.msgs,0).toLocaleString()} spark={SERIES.leadsEntrantes}/>
        <KpiCard label="Resp. promedio equipo" value={(Object.values(KPIS).reduce((s,k)=>s+k.respMin,0)/11).toFixed(1)+' min'} spark={SERIES.respuestaMin} sparkColor="var(--info)"/>
        <KpiCard label="Cotizaciones enviadas" value={Object.values(KPIS).reduce((s,k)=>s+k.cotiz,0)} spark={SERIES.cotizDiarias} sparkColor="var(--warn)"/>
        <KpiCard label="Tasa conversión global" value={pct(Object.values(KPIS).reduce((s,k)=>s+k.cerradas,0)/Object.values(KPIS).reduce((s,k)=>s+k.cotiz,0))} spark={SERIES.leadsCerrados} sparkColor="var(--ok)"/>
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
            {sorted.map((v,i)=>{
              const k = KPIS[v.id];
              return (
                <tr key={v.id}>
                  <td className="mono muted" style={{fontSize:11}}>{String(i+1).padStart(2,'0')}</td>
                  <td><div className="row" style={{gap:8}}><Avatar vendedor={v} size={26}/><span style={{fontSize:13,fontWeight:500}}>{v.nombre}</span></div></td>
                  <td className="muted" style={{fontSize:12}}>{v.zona}</td>
                  <td>
                    <div className="row" style={{gap:8}}>
                      <div style={{width:80,height:6,background:'var(--line-2)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{width:(k.msgs/maxMsgs*100)+'%',height:'100%',background:'var(--ink-3)'}}/>
                      </div>
                      <span className="mono tabular" style={{fontSize:12}}>{k.msgs}</span>
                    </div>
                  </td>
                  <td className={'mono tabular ' + (k.respMin < 5 ? 'pill pill-ok' : k.respMin > 8 ? 'pill pill-bad' : 'pill')} style={{fontSize:11.5,display:'inline-block',padding:'2px 7px'}}>{k.respMin} min</td>
                  <td className="mono tabular">{k.cotiz}</td>
                  <td className="mono tabular">{k.cerradas}</td>
                  <td className="mono tabular" style={{fontWeight:500}}>{pct(k.tasa)}</td>
                  <td className="tabular mono" style={{textAlign:'right',fontWeight:500}}>{money(k.ingresos)}</td>
                </tr>
              );
            })}
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
