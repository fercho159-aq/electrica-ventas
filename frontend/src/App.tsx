import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { Login } from './components/Login'

type Route =
  | 'dashboard' | 'inbox' | 'asignacion' | 'pipeline'
  | 'cotizaciones' | 'kpis' | 'remarketing' | 'unidades'

export function App() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [route, setRoute] = useState<Route>('dashboard')

  useEffect(() => {
    if (user?.rol === 'vendedor' && !['inbox', 'pipeline', 'cotizaciones', 'remarketing'].includes(route)) {
      setRoute('inbox')
    }
  }, [user?.rol, route])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)'
      }}>
        <div className="muted" style={{ fontSize: 13 }}>Cargando…</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  // Shell + routing — imported lazily via window globals from existing JSX
  // until full component migration is complete
  const ShellComp = (window as unknown as Record<string, React.FC<{
    route: Route
    setRoute: (r: Route) => void
    rol: string
    rolActivoVendedor: string
    setRol: (r: string) => void
    onLogout: () => void
  }>  >).Sidebar

  if (!ShellComp) {
    return (
      <div className="muted" style={{ padding: 40, fontSize: 13 }}>
        Cargando componentes…
      </div>
    )
  }

  return (
    <AppShell
      route={route}
      setRoute={(r: string) => setRoute(r as Route)}
      rol={user?.rol ?? 'vendedor'}
      userId={user?.id ?? ''}
    />
  )
}

// Bridge component while JSX components are migrated
function AppShell({
  route, setRoute, rol, userId
}: {
  route: Route
  setRoute: (r: string) => void
  rol: string
  userId: string
}) {
  const { logout } = useAuth()
  const win = window as unknown as Record<string, React.FC>

  const Sidebar = win.Sidebar as React.FC<{
    route: string; setRoute: (r: string) => void; rol: string
    rolActivoVendedor: string; setRol: (r: string) => void; onLogout: () => void
  }>
  const TopBar = win.TopBar as React.FC<{
    title: string; subtitle: string; rol: string
    onCmdK: () => void; onNotif: () => void
  }>

  if (!Sidebar || !TopBar) return null

  const titles: Record<string, { t: string; s: string }> = {
    dashboard: { t: 'Panorama general', s: 'Vista global del equipo y canales' },
    inbox: { t: 'Bandeja unificada', s: rol === 'gerente' ? 'Todos los canales y vendedores' : 'Tus leads asignados' },
    asignacion: { t: 'Asignación de leads', s: 'Distribuir nuevos leads al equipo' },
    pipeline: { t: 'Pipeline de ventas', s: 'Etapas del embudo' },
    cotizaciones: { t: 'Cotizaciones', s: 'Cotizaciones enviadas y su estado' },
    kpis: { t: 'Indicadores de desempeño', s: 'Métricas del equipo — mes en curso' },
    remarketing: { t: 'Remarketing', s: 'Leads no cerrados listos para re-contactar' },
    unidades: { t: 'Unidades GPS', s: 'Ubicación de flota en tiempo real' },
  }

  const info = titles[route] ?? { t: route, s: '' }

  const screens = win as unknown as Record<string, React.FC<{ rol: string; rolVendedor: string; setRoute: (r: string) => void }>>

  return (
    <div className="app">
      <Sidebar
        route={route}
        setRoute={setRoute}
        rol={rol}
        rolActivoVendedor={userId}
        setRol={() => null}
        onLogout={() => { void logout() }}
      />
      <main className="content">
        <TopBar
          title={info.t}
          subtitle={info.s}
          rol={rol}
          onCmdK={() => null}
          onNotif={() => null}
        />
        {route === 'dashboard' && screens.Dashboard && <screens.Dashboard rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'inbox' && screens.Inbox && <screens.Inbox rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'asignacion' && screens.Asignacion && <screens.Asignacion rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'pipeline' && screens.Pipeline && <screens.Pipeline rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'cotizaciones' && screens.Cotizaciones && <screens.Cotizaciones rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'kpis' && screens.KpisView && <screens.KpisView rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'remarketing' && screens.Remarketing && <screens.Remarketing rol={rol} rolVendedor={userId} setRoute={setRoute} />}
        {route === 'unidades' && screens.Unidades && <screens.Unidades rol={rol} rolVendedor={userId} setRoute={setRoute} />}
      </main>
    </div>
  )
}
