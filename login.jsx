// Login con autenticación real contra el backend
const { useState: useStateL } = React;

function Login({ onEnter }) {
  const [modo, setModo] = useStateL('real');   // 'real' | 'demo'
  const [email, setEmail] = useStateL('gerencia@electrica.mx');
  const [pass, setPass]   = useStateL('Admin2024!');
  const [loading, setLoading] = useStateL(false);
  const [error, setError]     = useStateL('');

  // Demo mode (mock data)
  const [rolDemo, setRolDemo] = useStateL('gerente');
  const [vendedorDemo, setVendedorDemo] = useStateL('v3');

  const handleRealLogin = async (e) => {
    e && e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await ApiClient.login(email, pass);
      const rol = data.usuario?.rol || data.user?.rol || 'vendedor';
      const id  = data.usuario?.id  || data.user?.id  || 'v1';
      WsClient.connect(data.accessToken);
      onEnter(rol, id, true);
    } catch (err) {
      setError(err.message || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    onEnter(rolDemo, vendedorDemo, false);
  };

  return (
    <div className="login-wrap">
      <div className="login-side">
        <div className="login-brand">
          <img src="/assets/logo.png" className="brand-logo brand-logo-lg" alt="San Miguel" />
        </div>
        <div className="login-quote">
          Todos tus <b>leads de WhatsApp</b> y <b>correo</b>, en una sola bandeja.
          Sin sesgos, sin leads perdidos.
        </div>
        <div className="login-meta">
          <span>v1.0.0 · local</span>
          <span>·</span>
          <span>API conectada</span>
        </div>
      </div>

      <div className="login-form">
        {/* Logo (visible sobre todo en móvil, donde se oculta el panel lateral) */}
        <img src="/assets/logo.png" className="brand-logo login-form-logo" alt="San Miguel" />
        {/* Tabs */}
        <div className="row" style={{gap:0,borderBottom:'1px solid var(--line)',marginBottom:20}}>
          {[['real','Iniciar sesión'],['demo','Modo demo']].map(([id,label])=>(
            <button key={id} onClick={()=>setModo(id)}
              style={{flex:1,appearance:'none',border:0,background:'transparent',padding:'8px 0',cursor:'pointer',
                fontSize:13,fontWeight:500,
                color:modo===id?'var(--ink)':'var(--ink-4)',
                borderBottom:modo===id?'2px solid var(--ink)':'2px solid transparent',
                marginBottom:-1}}>
              {label}
            </button>
          ))}
        </div>

        {modo === 'real' ? (
          <form onSubmit={handleRealLogin} className="stack" style={{gap:14}}>
            <div>
              <div className="kpi-label" style={{marginBottom:6}}>Correo electrónico</div>
              <input className="input" type="email" value={email}
                onChange={e=>setEmail(e.target.value)} required
                placeholder="usuario@electrica.mx"/>
            </div>
            <div>
              <div className="kpi-label" style={{marginBottom:6}}>Contraseña</div>
              <input className="input" type="password" value={pass}
                onChange={e=>setPass(e.target.value)} required
                placeholder="••••••••"/>
            </div>

            {error && (
              <div style={{background:'#fff0f0',border:'1px solid #fca5a5',borderRadius:6,padding:'8px 12px',fontSize:12,color:'#c2410c'}}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" type="submit"
              disabled={loading}
              style={{padding:'10px 14px',justifyContent:'center',marginTop:4}}>
              {loading ? 'Conectando…' : 'Entrar'}<IcoChevronR size={14}/>
            </button>

            <div className="muted" style={{fontSize:11,borderTop:'1px solid var(--line)',paddingTop:12}}>
              Backend: <b className="mono" style={{color:'var(--ok)'}}>● localhost:3000</b>
            </div>
          </form>
        ) : (
          <div className="stack" style={{gap:16}}>
            <p className="muted" style={{margin:0,fontSize:13}}>Selecciona el rol para continuar con datos mock.</p>
            <div className="login-roles">
              <button className={'login-role'+(rolDemo==='gerente'?' selected':'')} onClick={()=>setRolDemo('gerente')}>
                <div className="row" style={{justifyContent:'space-between'}}>
                  <div className="login-role-title">Gerente General</div>
                  <div className="role-avatar role-avatar-gm" style={{width:28,height:28,fontSize:11}}>GM</div>
                </div>
                <div className="login-role-desc">Acceso total · bandeja central · KPIs globales</div>
              </button>
              <button className={'login-role'+(rolDemo==='vendedor'?' selected':'')} onClick={()=>setRolDemo('vendedor')}>
                <div className="row" style={{justifyContent:'space-between'}}>
                  <div className="login-role-title">Vendedor</div>
                  <Avatar vendedor={vendedorDemo} size={28}/>
                </div>
                <div className="login-role-desc">Solo sus leads · su pipeline · sus cotizaciones</div>
              </button>
            </div>
            {rolDemo === 'vendedor' && (
              <div className="login-vendedor-grid">
                {VENDEDORES.map(v => (
                  <button key={v.id}
                    className={'login-vendedor'+(vendedorDemo===v.id?' selected':'')}
                    onClick={()=>setVendedorDemo(v.id)}>
                    <Avatar vendedor={v} size={26}/>
                    <div className="stack" style={{gap:1}}>
                      <div style={{fontSize:12.5,fontWeight:500}}>{v.nombre}</div>
                      <div style={{fontSize:10.5,color:'var(--ink-4)'}}>{v.zona}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-primary"
              style={{padding:'10px 14px',justifyContent:'center'}}
              onClick={handleDemoLogin}>
              Entrar como {rolDemo==='gerente'?'Gerente General':VENDEDORES.find(v=>v.id===vendedorDemo)?.nombre}
              <IcoChevronR size={14}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

window.Login = Login;
