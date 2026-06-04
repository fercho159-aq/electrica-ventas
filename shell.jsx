// Shell de la app: sidebar + topbar + contenedor de rutas
const { useState, useEffect, useMemo, useRef } = React;

// ─── Iconos monocromos SVG ────────────────────────────────────────────────
const Ico = ({ d, size = 16, stroke = 1.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{display:'block'}}>
    <path d={d}/>
  </svg>
);
const IcoInbox      = (p) => <Ico {...p} d="M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>;
const IcoUsers      = (p) => <Ico {...p} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"/>;
const IcoKanban     = (p) => <Ico {...p} d="M6 3v18 M10 3h11v4H10z M10 10h11v4H10z M10 17h7v4h-7z"/>;
const IcoBarChart   = (p) => <Ico {...p} d="M3 3v18h18 M7 16V10 M12 16V6 M17 16v-4"/>;
const IcoDoc        = (p) => <Ico {...p} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6"/>;
const IcoRefresh    = (p) => <Ico {...p} d="M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5"/>;
const IcoMap        = (p) => <Ico {...p} d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16"/>;
const IcoDashboard  = (p) => <Ico {...p} d="M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z"/>;
const IcoSearch     = (p) => <Ico {...p} d="m21 21-4.35-4.35 M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"/>;
const IcoBell       = (p) => <Ico {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0"/>;
const IcoBolt       = (p) => <Ico {...p} d="M13 2 3 14h9l-1 8 10-12h-9z"/>;
const IcoLogout     = (p) => <Ico {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9"/>;
const IcoWhatsapp   = (p) => <Ico {...p} d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>;
const IcoMail       = (p) => <Ico {...p} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2 M22 6 12 13 2 6"/>;
const IcoChevronR   = (p) => <Ico {...p} d="m9 18 6-6-6-6"/>;
const IcoChevronD   = (p) => <Ico {...p} d="m6 9 6 6 6-6"/>;
const IcoPlus       = (p) => <Ico {...p} d="M12 5v14 M5 12h14"/>;
const IcoFilter     = (p) => <Ico {...p} d="M22 3H2l8 9.46V19l4 2v-8.54z"/>;
const IcoCheck      = (p) => <Ico {...p} d="M20 6 9 17l-5-5"/>;
const IcoX          = (p) => <Ico {...p} d="M18 6 6 18 M6 6l12 12"/>;
const IcoClock      = (p) => <Ico {...p} d="M12 6v6l4 2 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"/>;
const IcoTarget     = (p) => <Ico {...p} d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12 M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>;
const IcoTrend      = (p) => <Ico {...p} d="m23 6-9.5 9.5-5-5L1 18 M17 6h6v6"/>;
const IcoUser       = (p) => <Ico {...p} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>;
const IcoPhone      = (p) => <Ico {...p} d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>;
const IcoSend       = (p) => <Ico {...p} d="m22 2-7 20-4-9-9-4z M22 2 11 13"/>;
const IcoMore       = (p) => <Ico {...p} d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2"/>;
const IcoBuilding   = (p) => <Ico {...p} d="M3 21h18 M5 21V7l7-4 7 4v14 M9 9h1 M14 9h1 M9 13h1 M14 13h1 M9 17h1 M14 17h1"/>;
const IcoTruck      = (p) => <Ico {...p} d="M1 3h15v13H1z M16 8h4l3 3v5h-7 M5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5"/>;
const IcoPaperclip  = (p) => <Ico {...p} d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>;
const IcoMic        = (p) => <Ico {...p} d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3 M8 22h8"/>;
const IcoTrash      = (p) => <Ico {...p} d="M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6"/>;
const IcoSticker    = (p) => <Ico {...p} d="M15.5 21H8a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v5.5 M20 12.5 12.5 20v-3.5a4 4 0 0 1 4-4z M8.5 9.5h.01 M14.5 9.5h.01 M9 14s1 1.5 3 1.5"/>;

Object.assign(window, {
  Ico, IcoInbox, IcoUsers, IcoKanban, IcoBarChart, IcoDoc, IcoRefresh, IcoMap,
  IcoDashboard, IcoSearch, IcoBell, IcoBolt, IcoLogout, IcoWhatsapp, IcoMail,
  IcoChevronR, IcoChevronD, IcoPlus, IcoFilter, IcoCheck, IcoX, IcoClock,
  IcoTarget, IcoTrend, IcoUser, IcoPhone, IcoSend, IcoMore, IcoBuilding, IcoTruck,
  IcoPaperclip, IcoMic, IcoTrash, IcoSticker,
});

// ─── Utilidades ───────────────────────────────────────────────────────────
const money = (n) => '$' + n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
const pct = (n) => Math.round(n * 100) + '%';
const relTime = (ts) => {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const dd = Math.floor(h / 24);
  return dd + 'd';
};

function ChipCanal({ canal, size = 14 }) {
  if (canal && canal.startsWith('whatsapp')) {
    return <span className="chip-canal" style={{color:'#15803d'}} title={canal}><IcoWhatsapp size={size}/></span>;
  }
  return <span className="chip-canal" style={{color:'#0369a1'}} title="email"><IcoMail size={size}/></span>;
}

function ChipEtapa({ etapa }) {
  const e = ETAPAS.find(x => x.id === etapa);
  return <span className="chip-etapa" style={{'--c': e.color}}>{e.label}</span>;
}

function Avatar({ vendedor, size = 28 }) {
  if (!vendedor) return <span className="avatar avatar-empty" style={{width:size,height:size}}>—</span>;
  const v = typeof vendedor === 'string' ? VENDEDORES.find(x => x.id === vendedor) : vendedor;
  if (!v) return <span className="avatar avatar-empty" style={{width:size,height:size}}>—</span>;
  return (
    <span className="avatar" style={{width:size,height:size,fontSize:size*0.38}} title={v.nombre}>
      {v.iniciales}
      {v.estado === 'online' && <span className="avatar-dot" style={{background:'#15803d'}}/>}
      {v.estado === 'ocupado' && <span className="avatar-dot" style={{background:'#c2410c'}}/>}
      {v.estado === 'offline' && <span className="avatar-dot" style={{background:'#a8a29e'}}/>}
    </span>
  );
}

Object.assign(window, { money, pct, relTime, ChipCanal, ChipEtapa, Avatar });

// ─── Shell ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',   label: 'Dashboard',       icon: IcoDashboard, roles: ['gerente'] },
  { id: 'inbox',       label: 'Bandeja',         icon: IcoInbox,     roles: ['gerente','vendedor'], badge: 'nuevos' },
  { id: 'asignacion',  label: 'Asignación',      icon: IcoUsers,     roles: ['gerente'] },
  { id: 'pipeline',    label: 'Pipeline',        icon: IcoKanban,    roles: ['gerente','vendedor'] },
  { id: 'cotizaciones',label: 'Cotizaciones',    icon: IcoDoc,       roles: ['gerente','vendedor'] },
  { id: 'kpis',        label: 'KPIs',            icon: IcoBarChart,  roles: ['gerente'] },
  { id: 'remarketing', label: 'Remarketing',     icon: IcoRefresh,   roles: ['gerente','vendedor'] },
  { id: 'unidades',    label: 'Unidades GPS',    icon: IcoMap,       roles: ['gerente'], beta: true },
];

function Sidebar({ route, setRoute, rol, rolActivoVendedor, setRol, onLogout }) {
  // Conteo real de leads nuevos (backend lo filtra por rol). Gerente: sin asignar.
  const [nuevosCount, setNuevosCount] = React.useState(0);
  React.useEffect(() => {
    const cargar = () => {
      ApiClient.getLeads({ etapa: 'nuevo', limit: '100' })
        .then(r => {
          const ls = r.data || [];
          setNuevosCount(rol === 'gerente' ? ls.filter(l => !l.vendedor_id).length : ls.length);
        })
        .catch(() => {});
    };
    cargar();
    const offs = ['new_message','new_lead','lead_updated'].map(ev => WsClient.on(ev, cargar));
    return () => offs.forEach(off => off());
  }, [rol]);
  const items = NAV.filter(n => n.roles.includes(rol));
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/assets/logo.png" className="brand-logo" alt="San Miguel" />
      </div>

      <nav className="sidebar-nav">
        {items.map(it => {
          const Icon = it.icon;
          const active = route === it.id;
          return (
            <button key={it.id} className={'nav-item' + (active ? ' active' : '')} onClick={() => setRoute(it.id)}>
              <Icon size={16}/>
              <span>{it.label}</span>
              {it.badge === 'nuevos' && nuevosCount > 0 && <span className="nav-badge">{nuevosCount}</span>}
              {it.beta && <span className="nav-beta">pronto</span>}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="role-card">
          <div className="role-label">Sesión activa</div>
          {rol === 'gerente' ? (
            <div className="role-user">
              <div className="role-avatar role-avatar-gm">GM</div>
              <div>
                <div className="role-name">Gerente General</div>
                <div className="role-email">gerencia@electrica.mx</div>
              </div>
            </div>
          ) : (
            <div className="role-user">
              <Avatar vendedor={rolActivoVendedor} size={32}/>
              <div>
                <div className="role-name">{VENDEDORES.find(v=>v.id===rolActivoVendedor)?.nombre}</div>
                <div className="role-email">Vendedor · {VENDEDORES.find(v=>v.id===rolActivoVendedor)?.zona}</div>
              </div>
            </div>
          )}
          <button className="btn-logout" onClick={onLogout}><IcoLogout size={13}/> Cerrar sesión</button>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ title, subtitle, rol, onCmdK, onNotif, notifOpen, children }) {
  const nuevos = LEADS.filter(l => l.etapa === 'nuevo' && !l.asignadoA).length;
  return (
    <header className="topbar">
      <div>
        <div className="crumb">
          <span>{rol === 'gerente' ? 'Gerencia' : 'Vendedor'}</span>
          <IcoChevronR size={12}/>
          <span className="crumb-now">{title}</span>
        </div>
        <h1 className="topbar-title">{title}</h1>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>
      <div className="topbar-actions">
        {children}
        <button className="icon-btn" title="Buscar (⌘K)" onClick={onCmdK}><IcoSearch size={15}/></button>
        <button className="icon-btn icon-btn-badge" title="Notificaciones" onClick={onNotif}>
          <IcoBell size={15}/>
          {nuevos > 0 && <span className="badge-dot"/>}
        </button>
      </div>
    </header>
  );
}

Object.assign(window, { Sidebar, TopBar, NAV });
