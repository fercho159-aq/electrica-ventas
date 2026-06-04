// Dashboard del gerente + Bandeja + Detalle

function Sparkline({ data, color='currentColor', height=32, width=120 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const d = points.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = d + ` L${width},${height} L0,${height} Z`;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={area} fill={color} opacity="0.1"/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function KpiCard({ label, value, delta, deltaDir='up', spark, sparkColor }) {
  return (
    <div className="card" style={{padding:16}}>
      <div className="kpi-label">{label}</div>
      <div className="row" style={{justifyContent:'space-between',alignItems:'flex-end',marginTop:8}}>
        <div>
          <div className="kpi-value tabular">{value}</div>
          {delta && <div className={'kpi-delta ' + deltaDir}>{deltaDir==='up' ? '↑' : '↓'} {delta}</div>}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor || 'var(--ink-3)'} />}
      </div>
    </div>
  );
}

const { useState: _useState, useEffect: _useEffect } = React;

// Construye un objeto vendedor compatible con <Avatar/> a partir de fila de /api/kpis
function vendedorFromKpi(row) {
  const nombre = row.vendedor_nombre || '—';
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
  return { id: row.vendedor_id, nombre, iniciales, estado: 'offline', zona: row.zona };
}

function Dashboard({ setRoute }) {
  const [resumen, setResumen] = _useState(null);
  const [embudo, setEmbudo]   = _useState(null);
  const [ranking, setRanking] = _useState(null);
  const [nuevos, setNuevos]   = _useState(null);
  const [err, setErr]         = _useState(null);

  const cargar = React.useCallback(() => {
    Promise.all([
      ApiClient.getDashboard(),
      ApiClient.getEmbudo(),
      ApiClient.getKpis('mes'),
      ApiClient.getLeads({ etapa: 'nuevo', limit: '20' }),
    ]).then(([r, e, k, l]) => {
      setResumen(r.data);
      setEmbudo(e.data);
      setRanking(k.data || []);
      setNuevos((l.data || []).filter(x => !x.asignado_a));
      setErr(null);
    }).catch(ex => setErr(ex.message));
  }, []);

  _useEffect(() => {
    cargar();
    const off = WsClient.on('new_message', cargar);
    const offL = WsClient.on('new_lead', cargar);
    const offU = WsClient.on('lead_updated', cargar);
    return () => { off(); offL(); offU(); };
  }, [cargar]);

  if (err) return <div className="page"><div className="card" style={{padding:24,color:'var(--accent)'}}>Error cargando dashboard: {err}</div></div>;
  if (!resumen || !embudo || !ranking) return <div className="page"><div className="muted" style={{padding:24,fontSize:13}}>Cargando datos…</div></div>;

  const top = ranking.slice(0,5).map(r => ({ v: vendedorFromKpi(r), k: r }));
  const maxIng = Math.max(1, ...top.map(t => Number(t.k.ingresos_periodo) || 0));
  const maxEtapa = Math.max(1, ...embudo.embudo.map(e => e.count));
  const labelEtapa = (id) => (ETAPAS.find(e => e.id === id) || {}).label || id;
  const colorEtapa = (id) => (ETAPAS.find(e => e.id === id) || {}).color || 'var(--ink-3)';

  return (
    <div className="page">
      <div className="grid-4" style={{marginBottom:16}}>
        <KpiCard label="Leads nuevos sin asignar" value={resumen.leads_nuevos_sin_asignar}/>
        <KpiCard label="Tasa de conversión" value={(resumen.tasa_conversion_pct ?? 0)+'%'}/>
        <KpiCard label="Resp. promedio" value={resumen.respuesta_promedio_min != null ? resumen.respuesta_promedio_min+' min' : '—'}/>
        <KpiCard label="Ingresos MTD" value={money(resumen.ingresos_mtd || 0)}/>
      </div>

      <div className="grid-2" style={{marginBottom:16}}>
        {/* Canales */}
        <div className="card">
          <div className="card-hd">
            <h3>Actividad por canal <span className="card-sub">últimas 24h</span></h3>
            <span className="pill pill-ok"><span className="prio-dot" style={{background:'currentColor'}}/> En línea</span>
          </div>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
            {(resumen.actividad_canales || []).filter(c => Number(c.mensajes_24h) > 0).length === 0 && (
              <div className="muted" style={{fontSize:12}}>Sin actividad en las últimas 24h.</div>
            )}
            {(resumen.actividad_canales || []).map(c => (
              <CanalRow
                key={c.canal_id}
                icon={c.canal_tipo === 'email' ? <IcoMail size={16}/> : <IcoWhatsapp size={16}/>}
                color={c.canal_tipo === 'email' ? '#0369a1' : '#15803d'}
                label={c.canal_nombre}
                mensajes={Number(c.mensajes_24h) || 0}
                nuevos={Number(c.leads_nuevos_24h) || 0}
                tiempoMs="—"
              />
            ))}
            <div className="muted mono" style={{fontSize:11,borderTop:'1px dashed var(--line)',paddingTop:10,marginTop:4}}>
              ∆ Integración: WhatsApp Cloud API (Meta) · IMAP/SMTP
            </div>
          </div>
        </div>

        {/* Top vendedores */}
        <div className="card">
          <div className="card-hd">
            <h3>Ranking de vendedores <span className="card-sub">mes en curso</span></h3>
            <button className="btn btn-sm btn-ghost" onClick={()=>setRoute('kpis')}>Ver todos <IcoChevronR size={12}/></button>
          </div>
          <div className="card-body" style={{padding:0}}>
            {top.length === 0 && <div className="muted" style={{fontSize:12,padding:16}}>Sin vendedores activos.</div>}
            {top.map(({v, k}, i) => {
              const ing = Number(k.ingresos_periodo) || 0;
              return (
                <div key={v.id} className="row" style={{padding:'10px 16px',borderBottom:i<top.length-1?'1px solid var(--line-2)':'0',gap:12}}>
                  <div className="mono" style={{fontSize:11,color:'var(--ink-4)',width:16}}>{String(i+1).padStart(2,'0')}</div>
                  <Avatar vendedor={v} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{v.nombre}</div>
                    <div className="muted" style={{fontSize:11}}>{k.leads_cerrados} ventas · {(k.tasa_conversion_pct ?? 0)}% conv.</div>
                  </div>
                  <div style={{width:90}}>
                    <div style={{height:4,background:'var(--line-2)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{width:(ing/maxIng*100)+'%',height:'100%',background:'var(--ink)'}}/>
                    </div>
                  </div>
                  <div className="tabular mono" style={{fontSize:12,width:80,textAlign:'right'}}>{money(ing)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Leads nuevos */}
        <div className="card">
          <div className="card-hd">
            <h3>Leads nuevos sin asignar <span className="pill pill-accent" style={{marginLeft:6}}>{resumen.leads_nuevos_sin_asignar}</span></h3>
            <button className="btn btn-sm btn-accent" onClick={()=>setRoute('asignacion')}>Asignar todos <IcoChevronR size={12}/></button>
          </div>
          <div className="card-body" style={{padding:0,maxHeight:320,overflowY:'auto'}}>
            {(nuevos || []).length === 0 && <div className="muted" style={{fontSize:12,padding:16}}>Nada pendiente de asignar.</div>}
            {(nuevos || []).slice(0,7).map((l,i)=>(
              <div key={l.id} className="row" style={{padding:'10px 16px',borderBottom:i<6?'1px solid var(--line-2)':'0',gap:10}}>
                <ChipCanal canal={l.canal_tipo || 'whatsapp'}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500}}>{l.contacto}</div>
                  <div className="muted" style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.empresa || '—'} · {l.zona || '—'}</div>
                </div>
                <div className="muted mono" style={{fontSize:11}}>{relTime(new Date(l.ultima_interaccion || l.created_at || Date.now()).getTime())}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Embudo */}
        <div className="card">
          <div className="card-hd">
            <h3>Embudo actual <span className="card-sub">todos los leads</span></h3>
            <button className="btn btn-sm btn-ghost" onClick={()=>setRoute('pipeline')}>Abrir pipeline <IcoChevronR size={12}/></button>
          </div>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:8}}>
            {embudo.embudo.length === 0 && <div className="muted" style={{fontSize:12}}>Sin leads.</div>}
            {embudo.embudo.map(e => (
              <div key={e.etapa} className="row" style={{gap:10}}>
                <div style={{width:100,fontSize:12,color:'var(--ink-3)'}}>{labelEtapa(e.etapa)}</div>
                <div style={{flex:1,height:22,background:'var(--line-2)',borderRadius:4,overflow:'hidden',position:'relative'}}>
                  <div style={{width:(e.count/maxEtapa*100)+'%',height:'100%',background:colorEtapa(e.etapa),opacity:0.85}}/>
                  <div className="mono" style={{position:'absolute',right:8,top:3,fontSize:11,color:'#fff',fontWeight:500}}>{e.count}</div>
                </div>
                <div className="tabular mono muted" style={{fontSize:11,width:40,textAlign:'right'}}>{e.porcentaje}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CanalRow({ icon, color, label, mensajes, nuevos, tiempoMs }) {
  return (
    <div className="row" style={{gap:12}}>
      <div className="chip-canal" style={{color,width:28,height:28}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:500}}>{label}</div>
        <div className="muted" style={{fontSize:11}}>{mensajes} mensajes · {tiempoMs} resp. promedio</div>
      </div>
      {nuevos > 0 && <span className="pill pill-accent">{nuevos} nuevos</span>}
    </div>
  );
}

window.Dashboard = Dashboard;
window.Sparkline = Sparkline;
