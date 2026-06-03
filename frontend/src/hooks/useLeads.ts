import { useState, useEffect, useCallback, useRef } from 'react'
import { leadsApi } from '../services/api'
import type { Lead, LeadsFilters } from '../types'

export function useLeads(filters: LeadsFilters = {}) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filtersKey = JSON.stringify(filters)
  const abortRef = useRef<AbortController | null>(null)

  const fetch = useCallback(async () => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setIsLoading(true)
    setError(null)
    try {
      const res = await leadsApi.list(filters)
      setLeads(res.data)
      setTotal(res.total)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Error cargando leads')
      }
    } finally {
      setIsLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  useEffect(() => {
    void fetch()
    return () => abortRef.current?.abort()
  }, [fetch])

  const prependLead = useCallback((lead: Lead) => {
    setLeads((prev) => [lead, ...prev.filter((l) => l.id !== lead.id)])
    setTotal((t) => t + 1)
  }, [])

  const updateLead = useCallback((updated: Lead) => {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  }, [])

  return { leads, total, isLoading, error, refetch: fetch, prependLead, updateLead }
}
