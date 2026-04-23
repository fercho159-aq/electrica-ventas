// Login / selector de rol
const { useState: useStateL } = React;

function Login({ onEnter }) {
  const [rol, setRolLocal] = useStateL('gerente');
  const [vendedor, setVendedor] = useStateL('v3');

  return (
    <div className="login-wrap">
      <div className="login-side">
        <div className="login-brand">
          <div className="brand-mark"><IcoBolt size={22} stroke={2}/></div>
          <div>
            <div className="brand-name">Electrica<span>Ventas</span></div>
            <div className="brand-sub">CRM de ventas</div>
          </div>
        </div>

        <div className="login-quote">
          Todos tus <b>leads de WhatsApp</b> y <b>correo</b>, en una sola bandeja.
          Sin sesgos, sin leads perdidos.
        </div>

        <div className="login-meta">
          <span>v0.9.2 · preview</span>
          <span>·</span>
          <span>abril 2026</span>
        </div>
      </div>

      <div className="login-form">
        <div>
          <h2>Iniciar sesión</h2>
          <p className="muted">Selecciona el rol para continuar con el prototipo.</p>
        </div>

        <div className="login-roles">
          <button className={'login-role' + (rol==='gerente'?' selected':'')} onClick={()=>setRolLocal('gerente')}>
            <div className="row" style={{justifyContent:'space-between'}}>
              <div className="login-role-title">Gerente General</div>
              <div className="role-avatar role-avatar-gm" style={{width:28,height:28,fontSize:11}}>GM</div>
            </div>
            <div className="login-role-desc">Acceso total · bandeja central · asignación · KPIs globales · unidades GPS</div>
          </button>
          <button className={'login-role' + (rol==='vendedor'?' selected':'')} onClick={()=>setRolLocal('vendedor')}>
            <div className="row" style={{justifyContent:'space-between'}}>
              <div className="login-role-title">Vendedor</div>
              <Avatar vendedor={vendedor} size={28}/>
            </div>
            <div className="login-role-desc">Sólo ve sus leads asignados · su pipeline · sus cotizaciones</div>
          </button>
        </div>

        {rol === 'vendedor' && (
          <div>
            <div className="kpi-label" style={{marginBottom:8}}>Elige vendedor</div>
            <div className="login-vendedor-grid">
              {VENDEDORES.map(v => (
                <button key={v.id}
                  className={'login-vendedor' + (vendedor===v.id?' selected':'')}
                  onClick={()=>setVendedor(v.id)}>
                  <Avatar vendedor={v} size={26}/>
                  <div className="stack" style={{gap:1}}>
                    <div style={{fontSize:12.5,fontWeight:500}}>{v.nombre}</div>
                    <div style={{fontSize:10.5,color:'var(--ink-4)'}}>{v.zona} · {v.cargaActual} leads</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-primary" style={{padding:'10px 14px',justifyContent:'center'}}
          onClick={() => onEnter(rol, vendedor)}>
          Entrar como {rol === 'gerente' ? 'Gerente General' : VENDEDORES.find(v=>v.id===vendedor)?.nombre}
          <IcoChevronR size={14}/>
        </button>

        <div className="muted" style={{fontSize:11,borderTop:'1px solid var(--line)',paddingTop:14}}>
          Conectado a: <b className="mono" style={{color:'var(--ink-2)'}}>+52 81 0000 0101</b> · <b className="mono" style={{color:'var(--ink-2)'}}>+52 81 0000 0202</b> · <b className="mono" style={{color:'var(--ink-2)'}}>ventas@electrica.mx</b>
        </div>
      </div>
    </div>
  );
}

window.Login = Login;
