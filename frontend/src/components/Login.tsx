import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'

export function Login() {
  const { login, isLoading, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await login(email, password)
    } catch {
      // error already in state
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9z"/>
          </svg>
          <div>
            <div className="brand-name">Electrica<span>Ventas</span></div>
            <div className="brand-sub">CRM de ventas</div>
          </div>
        </div>

        <h2 className="login-title">Iniciar sesión</h2>

        {error && (
          <div className="toast-item toast-bad" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="stack" style={{ gap: 14 }}>
          <div>
            <div className="kpi-label" style={{ marginBottom: 4 }}>Correo electrónico</div>
            <input
              className="input"
              type="email"
              placeholder="usuario@electrica.mx"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <div className="kpi-label" style={{ marginBottom: 4 }}>Contraseña</div>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            className="btn btn-accent"
            type="submit"
            disabled={isLoading || !email || !password}
            style={{ marginTop: 8, width: '100%', justifyContent: 'center', padding: '10px 0' }}
          >
            {isLoading ? 'Ingresando…' : 'Entrar'}
          </button>
        </form>

        <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 20 }}>
          Electrica Ventas CRM v1.0 — Acceso restringido
        </div>
      </div>
    </div>
  )
}
