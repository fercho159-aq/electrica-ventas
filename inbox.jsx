// Bandeja unificada (inbox) + Detalle de lead con conversación

function Inbox({ rol, rolVendedor, setRoute, setSelectedLead }) {
  const [filter, setFilter] = React.useState('todos');
  const [canal, setCanal] = React.useState('todos');
  const [selected, setSelected] = React.useState(null);

  const leadsBase = rol === 'gerente' ? LEADS : LEADS.filter(l => l.asignadoA === rolVendedor);
  let leads = leadsBase;
  if (filter === 'nuevos') leads = leads.filter(l => l.etapa === 'nuevo');
  else if (filter === 'sin_asignar') leads = leads.filter(l => !l.asignadoA);
  else if (filter === 'activos') leads = leads.filter(l => !['cerrado','no_cierre'].includes(l.etapa));
  else if (filter === 'cerrados') leads = leads.filter(l => l.etapa === 'cerrado');
  if (canal !== 'todos') leads = leads.filter(l => l.canal.startsWith(canal));

  leads = [...leads].sort((a,b) => b.ultimaInteraccion - a.ultimaInteraccion);
  const current = selected || leads[0];

  return (
    <div style={{flex:1,display:'grid',gridTemplateColumns:'420px 1fr',minHeight:0,overflow:'hidden'}}>
      {/* Lista */}
      <div style={{borderRight:'1px solid var(--line)',display:'flex',flexDirection:'column',minHeight:0}}>
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--line)',display:'flex',flexDirection:'column',gap:10}}>
          <div className="search-box"><IcoSearch size={14}/><input placeholder="Buscar empresa, contacto, folio…"/><kbd>⌘K</kbd></div>
          <div className="row" style={{gap:6,flexWrap:'wrap'}}>
            {[['todos','Todos'],['nuevos','Nuevos'],['sin_asignar','Sin asignar'],['activos','Activos'],['cerrados','Cerrados']].map(([id,lbl])=>(
              <button key={id} className={'btn btn-sm' + (filter===id?' btn-primary':'')} onClick={()=>setFilter(id)}>{lbl}</button>
            ))}
          </div>
          <div className="row" style={{gap:6}}>
            {[['todos','Todos canales',null],['whatsapp','WhatsApp',<IcoWhatsapp size={12}/>],['email','Correo',<IcoMail size={12}/>]].map(([id,lbl,ic])=>(
              <button key={id} className={'btn btn-sm' + (canal===id?' btn-primary':'')} onClick={()=>setCanal(id)}>{ic}{lbl}</button>
            ))}
          </div>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {leads.map(l => {
            const active = current && current.id === l.id;
            return (
              <button key={l.id} onClick={()=>setSelected(l)}
                style={{display:'block',width:'100%',textAlign:'left',appearance:'none',border:0,cursor:'pointer',
                  background:active?'oklch(0.96 0.08 95)':'transparent',
                  padding:'12px 16px',borderBottom:'1px solid var(--line-2)',font:'inherit'}}>
                <div className="row" style={{gap:10,marginBottom:4}}>
                  <ChipCanal canal={l.canal}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{l.contacto}</div>
                    <div className="muted" style={{fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{l.empresa}</div>
                  </div>
                  <div className="stack" style={{alignItems:'flex-end'}}>
                    <div className="muted mono" style={{fontSize:10.5}}>{relTime(l.ultimaInteraccion)}</div>
                    {l.asignadoA ? <Avatar vendedor={l.asignadoA} size={20}/> : <span className="pill pill-accent" style={{fontSize:9.5,padding:'1px 5px'}}>NUEVO</span>}
                  </div>
                </div>
                <div className="row" style={{gap:6}}>
                  <ChipEtapa etapa={l.etapa}/>
                  <span className="pill" style={{fontSize:10}}><span className={'prio-dot prio-'+l.prioridad}/>{l.prioridad}</span>
                  <span className="muted mono" style={{fontSize:10.5,marginLeft:'auto'}}>{l.id}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle */}
      {current ? <LeadDetail lead={current} rol={rol}/> : <div className="page muted">Sin selección</div>}
    </div>
  );
}

function LeadDetail({ lead, rol }) {
  const [draft, setDraft] = React.useState('');
  const [msgs, setMsgs] = React.useState(CONVERSACION_EJEMPLO);
  const [tab, setTab] = React.useState('conversacion');
  const [canalActivo, setCanalActivo] = React.useState(lead.canal.startsWith('whatsapp') ? 'whatsapp' : 'email');
  const [cerrada, setCerrada] = React.useState(lead.etapa === 'cerrado');
  const [showCotizar, setShowCotizar] = React.useState(false);
  const [showLlamar, setShowLlamar] = React.useState(false);
  const toast = useToast();
  const v = VENDEDORES.find(x => x.id === lead.asignadoA);

  React.useEffect(() => {
    setMsgs(CONVERSACION_EJEMPLO);
    setDraft('');
    setCerrada(lead.etapa === 'cerrado');
  }, [lead.id]);

  const send = () => {
    if (!draft.trim()) return;
    setMsgs([...msgs, { from:'vendedor', canal:canalActivo, ts:'ahora', texto: draft }]);
    setDraft('');
    toast('Mensaje enviado por ' + (canalActivo === 'whatsapp' ? 'WhatsApp' : 'correo'), 'ok');
    // Respuesta simulada
    setTimeout(() => {
      setMsgs(m => [...m, { from:'cliente', canal:canalActivo, ts:'ahora', texto: 'Gracias, lo reviso y te confirmo.' }]);
    }, 1400);
  };

  const cerrar = () => {
    setCerrada(true);
    toast('Venta marcada como cerrada · ' + money(lead.monto), 'ok');
  };

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 300px',minHeight:0,overflow:'hidden'}}>
      {/* Conversación */}
      <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--line)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div className="row" style={{gap:10}}>
              <h3 style={{margin:0,fontSize:16,fontWeight:600}}>{lead.contacto}</h3>
              <ChipEtapa etapa={lead.etapa}/>
              <span className="pill mono" style={{fontSize:10.5}}>{lead.id}</span>
            </div>
            <div className="muted" style={{fontSize:12,marginTop:3}}>{lead.empresa} · <span className="mono">{lead.telefono}</span> · {lead.email}</div>
          </div>
          <div className="row" style={{gap:6}}>
            <button className="btn btn-sm" onClick={()=>setShowLlamar(true)}><IcoPhone size={13}/>Llamar</button>
            <button className="btn btn-sm" onClick={()=>setShowCotizar(true)}><IcoDoc size={13}/>Cotizar</button>
            <button className={'btn btn-sm ' + (cerrada?'btn-accent':'btn-primary')} onClick={cerrar} disabled={cerrada}>
              <IcoCheck size={13}/>{cerrada ? 'Venta cerrada' : 'Marcar cerrada'}
            </button>
          </div>
        </div>

        <div className="row" style={{padding:'8px 20px',borderBottom:'1px solid var(--line-2)',gap:16}}>
          {['conversacion','actividad','cotizaciones','notas'].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{appearance:'none',border:0,background:'transparent',padding:'6px 0',cursor:'pointer',
                fontSize:12.5,fontWeight:500,color:tab===t?'var(--ink)':'var(--ink-4)',
                borderBottom:tab===t?'2px solid var(--ink)':'2px solid transparent'}}>
              {t[0].toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'20px 28px',background:'var(--bg)'}}>
          {msgs.map((m,i)=>(
            <Msg key={i} m={m} vendedor={v}/>
          ))}
        </div>

        <div style={{borderTop:'1px solid var(--line)',padding:'12px 20px',background:'var(--panel)'}}>
          <div className="row" style={{gap:8,marginBottom:8}}>
            <button className={'btn btn-sm' + (canalActivo==='whatsapp'?' btn-primary':'')} onClick={()=>setCanalActivo('whatsapp')}><IcoWhatsapp size={12}/>WhatsApp</button>
            <button className={'btn btn-sm' + (canalActivo==='email'?' btn-primary':'')} onClick={()=>setCanalActivo('email')}><IcoMail size={12}/>Correo</button>
            <span className="muted" style={{fontSize:11,marginLeft:'auto'}}>Plantilla: <button className="btn btn-sm btn-ghost mono" onClick={()=>setDraft('Buen día, adjunto cotización con los productos solicitados. Vigencia: 15 días. Quedo atento a sus comentarios.')}>cotización_rápida</button></span>
          </div>
          <div className="row" style={{gap:8}}>
            <textarea className="input" rows={2} placeholder={canalActivo==='whatsapp'?'Mensaje por WhatsApp…':'Mensaje por correo…'} value={draft}
              onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ e.preventDefault(); send(); } }}
              style={{resize:'none'}}/>
            <button className="btn btn-accent" onClick={send} style={{alignSelf:'stretch'}} disabled={!draft.trim()}><IcoSend size={14}/>Enviar</button>
          </div>
        </div>
      </div>

      {/* Panel derecho se mantiene abajo */}

      {/* Panel derecho */}
      <aside style={{borderLeft:'1px solid var(--line)',padding:20,overflowY:'auto',background:'var(--panel)'}}>
        <SidePanelRow label="Asignado a" value={
          v ? <div className="row" style={{gap:8}}><Avatar vendedor={v} size={24}/><span style={{fontSize:13}}>{v.nombre}</span></div>
            : <span className="pill pill-accent">Sin asignar</span>
        }/>
        <SidePanelRow label="Canal" value={<div className="row" style={{gap:6}}><ChipCanal canal={lead.canal}/><span className="mono" style={{fontSize:11}}>{lead.canal}</span></div>}/>
        <SidePanelRow label="Zona" value={lead.zona}/>
        <SidePanelRow label="Prioridad" value={<span className="pill"><span className={'prio-dot prio-'+lead.prioridad}/>{lead.prioridad}</span>}/>
        <SidePanelRow label="Tiempo 1ra resp." value={lead.tiempoRespMin ? lead.tiempoRespMin+' min' : '—'} mono/>
        <SidePanelRow label="Creado" value={relTime(lead.createdAt)+' atrás'}/>

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
          <div className="row" style={{justifyContent:'space-between',borderTop:'1px dashed var(--line)',paddingTop:8,marginTop:4}}>
            <span className="muted" style={{fontSize:12}}>Total estimado</span>
            <span className="tabular mono" style={{fontSize:14,fontWeight:600}}>{money(lead.productos.reduce((s,p)=>s+p.cantidad*p.precio,0))}</span>
          </div>
        </div>

        <div style={{borderTop:'1px solid var(--line-2)',margin:'20px 0 16px'}}/>
        <div className="kpi-label" style={{marginBottom:8}}>Trazabilidad</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,fontSize:11.5,color:'var(--ink-3)'}}>
          <div className="row" style={{gap:8}}><IcoClock size={12}/><span>Lead capturado · {relTime(lead.createdAt)} atrás</span></div>
          {lead.tiempoRespMin && <div className="row" style={{gap:8}}><IcoCheck size={12}/><span>1ra respuesta · {lead.tiempoRespMin} min</span></div>}
          {lead.cotizacionEnviada && <div className="row" style={{gap:8}}><IcoDoc size={12}/><span>Cotización enviada</span></div>}
          {lead.etapa === 'cerrado' && <div className="row" style={{gap:8,color:'var(--ok)'}}><IcoCheck size={12}/><span>Venta cerrada · {money(lead.monto)}</span></div>}
          {lead.etapa === 'no_cierre' && <div className="row" style={{gap:8,color:'var(--bad)'}}><IcoX size={12}/><span>No cierre · {lead.motivoNoCierre}</span></div>}
        </div>
      </aside>

      <Modal open={showLlamar} onClose={()=>setShowLlamar(false)} title={"Llamar a " + lead.contacto}
        footer={<>
          <button className="btn" onClick={()=>setShowLlamar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={()=>{setShowLlamar(false);toast('Llamada iniciada vía VoIP','ok');}}><IcoPhone size={12}/>Iniciar llamada</button>
        </>}>
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div className="mono" style={{fontSize:24,fontWeight:500,letterSpacing:'0.02em'}}>{lead.telefono}</div>
          <div className="muted" style={{fontSize:12,marginTop:6}}>{lead.empresa}</div>
        </div>
        <div className="muted" style={{fontSize:11.5,borderTop:'1px solid var(--line)',paddingTop:12}}>
          La llamada se registrará automáticamente en la trazabilidad del lead.
        </div>
      </Modal>

      <Modal open={showCotizar} onClose={()=>setShowCotizar(false)} title="Nueva cotización" width={640}
        footer={<>
          <button className="btn" onClick={()=>setShowCotizar(false)}>Cancelar</button>
          <button className="btn btn-accent" onClick={()=>{setShowCotizar(false);toast('Cotización COT-2064 generada y enviada','ok');}}><IcoSend size={12}/>Generar y enviar</button>
        </>}>
        <div style={{marginBottom:14}}>
          <div className="row" style={{justifyContent:'space-between',marginBottom:8}}>
            <div style={{fontSize:13,fontWeight:500}}>{lead.empresa}</div>
            <span className="pill mono">{lead.id}</span>
          </div>
          <div className="muted" style={{fontSize:12}}>{lead.contacto} · {lead.email}</div>
        </div>
        <table className="tbl" style={{fontSize:12}}>
          <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th style={{textAlign:'right'}}>Subtotal</th></tr></thead>
          <tbody>
            {lead.productos.map((p,i)=>(
              <tr key={i}>
                <td style={{fontSize:12}}>{p.nombre}</td>
                <td className="mono tabular">{p.cantidad}</td>
                <td className="mono tabular">{money(p.precio)}</td>
                <td className="mono tabular" style={{textAlign:'right'}}>{money(p.precio*p.cantidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{justifyContent:'space-between',paddingTop:12,marginTop:8,borderTop:'1px solid var(--line)'}}>
          <span className="muted" style={{fontSize:12}}>Total (incluye IVA)</span>
          <span className="mono tabular" style={{fontSize:16,fontWeight:600}}>{money(lead.productos.reduce((s,p)=>s+p.cantidad*p.precio,0))}</span>
        </div>
        <div className="row" style={{gap:10,marginTop:14}}>
          <div style={{flex:1}}>
            <div className="kpi-label" style={{marginBottom:4}}>Vigencia</div>
            <select className="input" defaultValue="15"><option>7 días</option><option>15 días</option><option>30 días</option></select>
          </div>
          <div style={{flex:1}}>
            <div className="kpi-label" style={{marginBottom:4}}>Enviar por</div>
            <select className="input" defaultValue={canalActivo}><option value="whatsapp">WhatsApp</option><option value="email">Correo</option></select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SidePanelRow({ label, value, mono }) {
  return (
    <div className="row" style={{justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--line-2)'}}>
      <span className="muted" style={{fontSize:11.5}}>{label}</span>
      <span className={mono?'mono':''} style={{fontSize:12.5}}>{value}</span>
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
      {isV ? <Avatar vendedor={vendedor} size={28}/> : <div className="avatar" style={{background:'var(--line)',color:'var(--ink-3)',width:28,height:28,fontSize:11}}>C</div>}
      <div style={{maxWidth:'70%'}}>
        <div className="row" style={{gap:6,marginBottom:4,flexDirection:isV?'row-reverse':'row'}}>
          <span style={{fontSize:11.5,fontWeight:500}}>{isV ? (vendedor?.nombre || 'Vendedor') : 'Cliente'}</span>
          <ChipCanal canal={m.canal} size={10}/>
          <span className="muted mono" style={{fontSize:10.5}}>{m.ts}</span>
        </div>
        <div style={{
          background:isV?'var(--ink)':'var(--panel)',color:isV?'#fff':'var(--ink)',
          border:isV?'0':'1px solid var(--line)',
          padding:'10px 12px',borderRadius:10,fontSize:13,lineHeight:1.45,
        }}>{m.texto}</div>
      </div>
    </div>
  );
}

window.Inbox = Inbox;
