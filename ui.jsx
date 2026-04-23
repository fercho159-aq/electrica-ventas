// Utilidades compartidas: toasts, modal, comando K, confirm

const ToastCtx = React.createContext(null);

function ToastProvider({ children }) {
  const [items, setItems] = React.useState([]);
  const push = React.useCallback((msg, kind='info') => {
    const id = Math.random().toString(36).slice(2);
    setItems(prev => [...prev, { id, msg, kind }]);
    setTimeout(() => setItems(prev => prev.filter(x => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {items.map(t => (
          <div key={t.id} className={'toast toast-' + t.kind}>
            {t.kind === 'ok' && <IcoCheck size={14}/>}
            {t.kind === 'bad' && <IcoX size={14}/>}
            {t.kind === 'info' && <IcoBolt size={14}/>}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => React.useContext(ToastCtx);

function Modal({ open, onClose, title, children, footer, width=520 }) {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{width}} onClick={e=>e.stopPropagation()}>
        <div className="modal-hd">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><IcoX size={14}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

function CommandPalette({ open, onClose, setRoute, rol }) {
  const [q, setQ] = React.useState('');
  React.useEffect(() => { if (open) setQ(''); }, [open]);
  if (!open) return null;
  const items = [
    ...NAV.filter(n => n.roles.includes(rol)).map(n => ({ label: 'Ir a ' + n.label, action: () => setRoute(n.id), kind: 'Navegación' })),
    ...LEADS.slice(0, 20).map(l => ({ label: l.contacto + ' · ' + l.empresa, sub: l.id, action: () => setRoute('inbox'), kind: 'Lead' })),
    { label: 'Nueva cotización', action: () => setRoute('cotizaciones'), kind: 'Acción' },
    { label: 'Auto-asignar leads nuevos', action: () => setRoute('asignacion'), kind: 'Acción' },
  ];
  const filtered = items.filter(i => i.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="modal-bg" onClick={onClose} style={{alignItems:'flex-start',paddingTop:'12vh'}}>
      <div className="cmdk" onClick={e=>e.stopPropagation()}>
        <div className="cmdk-search">
          <IcoSearch size={16}/>
          <input autoFocus placeholder="Buscar comando, lead, vendedor…" value={q} onChange={e=>setQ(e.target.value)}/>
          <kbd>ESC</kbd>
        </div>
        <div className="cmdk-list">
          {filtered.slice(0, 12).map((i, idx) => (
            <button key={idx} className="cmdk-item" onClick={() => { i.action(); onClose(); }}>
              <span className="cmdk-kind">{i.kind}</span>
              <span className="cmdk-label">{i.label}</span>
              {i.sub && <span className="cmdk-sub mono">{i.sub}</span>}
              <IcoChevronR size={12}/>
            </button>
          ))}
          {filtered.length === 0 && <div className="muted" style={{padding:20,textAlign:'center',fontSize:12}}>Sin resultados</div>}
        </div>
      </div>
    </div>
  );
}

function NotifPopover({ open, onClose, setRoute }) {
  if (!open) return null;
  const nuevos = LEADS.filter(l => l.etapa === 'nuevo' && !l.asignadoA).slice(0, 5);
  const notifs = [
    { t: 'hace 2 min', texto: 'Nuevo lead en WhatsApp', sub: nuevos[0]?.contacto, action: 'inbox' },
    { t: 'hace 14 min', texto: 'Carla Vázquez cerró venta', sub: '$48,200 · Constructora Aldama', action: 'pipeline' },
    { t: 'hace 38 min', texto: 'Cotización COT-2041 vista por cliente', sub: 'Sr. Zamudio abrió el PDF', action: 'cotizaciones' },
    { t: 'hace 1 h',  texto: nuevos.length + ' leads sin asignar', sub: 'Revisa la cola de asignación', action: 'asignacion' },
    { t: 'hace 2 h',  texto: 'Héctor Luna: tiempo de respuesta > 15 min', sub: 'Lead L3498 sin respuesta', action: 'inbox' },
  ];
  return (
    <>
      <div className="popover-bg" onClick={onClose}/>
      <div className="popover">
        <div className="popover-hd"><b>Notificaciones</b><button className="btn btn-sm btn-ghost" onClick={onClose}>Cerrar</button></div>
        <div>
          {notifs.map((n,i) => (
            <button key={i} className="popover-item" onClick={() => { setRoute(n.action); onClose(); }}>
              <div className="popover-dot"/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:500}}>{n.texto}</div>
                <div className="muted" style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{n.sub}</div>
              </div>
              <span className="muted mono" style={{fontSize:10}}>{n.t}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { ToastProvider, useToast, Modal, CommandPalette, NotifPopover, ToastCtx });
