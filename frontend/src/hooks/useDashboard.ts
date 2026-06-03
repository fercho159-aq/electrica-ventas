import { useState, useEffect, useCallback } from 'react'
import { dashboardApi } from '../services/api'
import type { DashboardResumen } from '../types'

export function useDashboard() {
  const [resumen, setResumen] = useState<DashboardResumen | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setResumen(await dashboardApi.resumen())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void fetch() }, [fetch])

  return { resumen, isLoading, error, refetch: fetch }
}
