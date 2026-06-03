import { useState, useEffect, useCallback } from 'react'
import { mensajesApi } from '../services/api'
import type { Mensaje } from '../types'

export function useMensajes(leadId: string | null) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | undefined>()

  const load = useCallback(async (cursor?: string) => {
    if (!leadId) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await mensajesApi.list(leadId, cursor)
      if (cursor) {
        setMensajes((prev) => [...res.data, ...prev])
      } else {
        setMensajes(res.data)
      }
      setNextCursor(res.nextCursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando mensajes')
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    setMensajes([])
    setNextCursor(undefined)
    if (leadId) void load()
  }, [leadId, load])

  const appendMensaje = useCallback((msg: Mensaje) => {
    setMensajes((prev) => [...prev.filter((m) => m.id !== msg.id), msg])
  }, [])

  const send = useCallback(async (
    texto: string,
    canalId: string,
    tipo: 'whatsapp' | 'email'
  ): Promise<Mensaje> => {
    if (!leadId) throw new Error('No lead selected')
    const msg = await mensajesApi.send(leadId, { texto, canal_id: canalId, tipo })
    appendMensaje(msg)
    return msg
  }, [leadId, appendMensaje])

  return {
    mensajes, isLoading, error, nextCursor,
    loadMore: () => load(nextCursor),
    appendMensaje, send,
  }
}
