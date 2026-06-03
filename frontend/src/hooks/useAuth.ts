import { useState, useEffect, useCallback } from 'react'
import { authApi, getTokens, setTokens, clearTokens } from '../services/api'
import type { Usuario } from '../types'

type AuthUser = Pick<Usuario, 'id' | 'nombre' | 'email' | 'rol' | 'zona'>

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    const tokens = getTokens()
    if (tokens?.user) {
      setState({ user: tokens.user, isAuthenticated: true, isLoading: false, error: null })
    } else {
      setState((s) => ({ ...s, isLoading: false }))
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null }))
    try {
      const tokens = await authApi.login(email, password)
      setTokens(tokens)
      setState({ user: tokens.user, isAuthenticated: true, isLoading: false, error: null })
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error al iniciar sesión',
      }))
      throw err
    }
  }, [])

  const logout = useCallback(async () => {
    const tokens = getTokens()
    if (tokens?.refreshToken) {
      await authApi.logout(tokens.refreshToken).catch(() => null)
    }
    clearTokens()
    setState({ user: null, isAuthenticated: false, isLoading: false, error: null })
  }, [])

  return { ...state, login, logout }
}
