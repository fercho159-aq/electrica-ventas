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

function Dashboard({ setRoute }) {
  const nuevos = LEADS.filter(l => l.etapa === 'nuevo' && !l.asignadoA);
  const abiertos = LEADS.filter(l => !['cerrado','no_cierre'].includes(l.etapa));
  const cerradosHoy = LEADS.filter(l => l.etapa === 'cerrado').slice(0, 4);
  const ingresosTotales = Object.values(KPIS).reduce((s,k)=>s+k.ingresos,0);
  const cotizTotales = Object.values(KPIS).reduce((s,k)=>s+k.cotiz,0);
  const cerradasTotales = Object.values(KPIS).reduce((s,k)=>s+k.cerradas,0);
  const tasaGlobal = cerradasTotales / cotizTotales;
  const respProm = Object.values(KPIS).reduce((s,k)=>s+k.respMin,0) / Object.values(KPIS).length;
  const topVendedores = [...VENDEDORES].sort((a,b) => KPIS[b.id].ingresos - KPIS[a.id].ingresos).slice(0,5);

  return (
    <div className="page">
      <div className="grid-4" style={{marginBottom:16}}>
        <KpiCard label="Leads nuevos sin asignar" value={nuevos.length} delta="12% vs ayer" spark={SERIES.leadsEntrantes} sparkColor="var(--accent)"/>
        <KpiCard label="Tasa de conversión" value={pct(tasaGlobal)} delta="3.2 pts" spark={SERIES.leadsCerrados} sparkColor="var(--ok)"/>
        <KpiCard label="Resp. promedio" value={respProm.toFixed(1)+' min'} delta="0.8 min" deltaDir="down" spark={SERIES.respuestaMin} sparkColor="var(--info)"/>
        <KpiCard label="Ingresos MTD" value={money(ingresosTotales)} delta="18%" spark={[12,15,14,17,19,22,24,26,28,30,32,36,40,44]} sparkColor="var(--ink)"/>
      </div>

      <div className="grid-2" style={{marginBottom:16}}>
        {/* Canales */}
        <div className="card">
          <div className="card-hd">
            <h3>Actividad por canal <span className="card-sub">últimas 24h</span></h3>
            <span className="pill pill-ok"><span className="prio-dot" style={{background:'currentColor'}}/> En línea</span>
          </div>
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
            <CanalRow icon={<IcoWhatsapp size={16}/>} color="#15803d" label="WhatsApp · +52 81 0000 0101" mensajes={142} nuevos={8} tiempoMs="2.1 min"/>
            <CanalRow icon={<IcoWhatsapp size={16}/>} color="#15803d" label="WhatsApp · +52 81 0000 0202" mensajes={98}  nuevos={3} tiempoMs="3.4 min"/>
            <CanalRow icon={<IcoMail size={16}/>}     color="#0369a1" label="ventas@electrica.mx"        mensajes={56}  nuevos={5} tiempoMs="12 min"/>
            <div className="muted mono" style={{fontSize:11,borderTop:'1px dashed var(--line)',paddingTop:10,marginTop:4}}>
              ∆ Integración: WhatsApp Business Platform (360dialog) · IMAP/SMTP
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
            {topVendedores.map((v, i) => {
              const k = KPIS[v.id];
              const maxIng = KPIS[topVendedores[0].id].ingresos;
              return (
                <div key={v.id} className="row" style={{padding:'10px 16px',borderBottom:i<4?'1px solid var(--line-2)':'0',gap:12}}>
                  <div className="mono" style={{fontSize:11,color:'var(--ink-4)',width:16}}>{String(i+1).padStart(2,'0')}</div>
                  <Avatar vendedor={v} size={30}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:500}}>{v.nombre}</div>
                    <div className="muted" style={{fontSize:11}}>{k.cerradas} ventas · {pct(k.tasa)} conv.</div>
                  </div>
                  <div style={{width:90}}>
                    <div style={{height:4,background:'var(--line-2)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{width:(k.ingresos/maxIng*100)+'%',height:'100%',background:'var(--ink)'}}/>
                    </div>
                  </div>
                  <div className="tabular mono" style={{fontSize:12,width:80,textAlign:'right'}}>{money(k.ingresos)}</div>
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
            <h3>Leads nuevos sin asignar <span className="pill pill-accent" style={{marginLeft:6}}>{nuevos.length}</span></h3>
            <button className="btn btn-sm btn-accent" onClick={()=>setRoute('asignacion')}>Asignar todos <IcoChevronR size={12}/></button>
          </div>
          <div className="card-body" style={{padding:0,maxHeight:320,overflowY:'auto'}}>
            {nuevos.slice(0,7).map((l,i)=>(
              <div key={l.id} className="row" style={{padding:'10px 16px',borderBottom:i<6?'1px solid var(--line-2)':'0',gap:10}}>
                <ChipCanal canal={l.canal}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500}}>{l.contacto}</div>
                  <div className="muted" style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.empresa} · {l.zona}</div>
                </div>
                <div className="muted mono" style={{fontSize:11}}>{relTime(l.ultimaInteraccion)}</div>
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
            {ETAPAS.map(e => {
              const n = LEADS.filter(l => l.etapa === e.id).length;
              const max = Math.max(...ETAPAS.map(et => LEADS.filter(l => l.etapa === et.id).length));
              return (
                <div key={e.id} className="row" style={{gap:10}}>
                  <div style={{width:100,fontSize:12,color:'var(--ink-3)'}}>{e.label}</div>
                  <div style={{flex:1,height:22,background:'var(--line-2)',borderRadius:4,overflow:'hidden',position:'relative'}}>
                    <div style={{width:(n/max*100)+'%',height:'100%',background:e.color,opacity:0.85}}/>
                    <div className="mono" style={{position:'absolute',right:8,top:3,fontSize:11,color:'#fff',fontWeight:500}}>{n}</div>
                  </div>
                  <div className="tabular mono muted" style={{fontSize:11,width:40,textAlign:'right'}}>{pct(n/LEADS.length)}</div>
                </div>
              );
            })}
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
