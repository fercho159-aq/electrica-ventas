import { useState, useEffect, useCallback } from 'react'
import { kpisApi } from '../services/api'
import type { KpiVendedor } from '../types'

export function useKpis(periodo: 'mes' | 'semana' | 'hoy' = 'mes') {
  const [kpis, setKpis] = useState<KpiVendedor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setKpis(await kpisApi.list(periodo))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando KPIs')
    } finally {
      setIsLoading(false)
    }
  }, [periodo])

  useEffect(() => { void fetch() }, [fetch])

  return { kpis, isLoading, error, refetch: fetch }
}
