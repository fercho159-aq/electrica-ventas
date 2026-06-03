import { useState, useEffect, useCallback } from 'react'
import { cotizacionesApi } from '../services/api'
import type { Cotizacion } from '../types'

export function useCotizaciones(filters: { vendedor_id?: string; estado?: string; lead_id?: string } = {}) {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filtersKey = JSON.stringify(filters)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await cotizacionesApi.list(filters)
      setCotizaciones(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando cotizaciones')
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  useEffect(() => { void fetch() }, [fetch])

  return { cotizaciones, isLoading, error, refetch: fetch }
}
