import { useState, useEffect, useCallback, useRef } from 'react'
import { wsClient } from '../services/ws'
import { getTokens } from '../services/api'
import type { Mensaje, Lead, WSEvent } from '../types'

interface UseInboxWSOptions {
  onNewMessage?: (msg: Mensaje, leadId: string) => void
  onNewLead?: (lead: Lead) => void
  onLeadUpdated?: (lead: Lead) => void
}

export function useInboxWS({ onNewMessage, onNewLead, onLeadUpdated }: UseInboxWSOptions = {}) {
  const [connected, setConnected] = useState(false)
  const handlersRef = useRef({ onNewMessage, onNewLead, onLeadUpdated })
  handlersRef.current = { onNewMessage, onNewLead, onLeadUpdated }

  useEffect(() => {
    const tokens = getTokens()
    if (!tokens?.accessToken) return

    wsClient.connect(tokens.accessToken)

    const offConnected = wsClient.on('connected', () => setConnected(true))
    const offDisconnected = wsClient.on('disconnected', () => setConnected(false))

    const offMsg = wsClient.on('new_message', (e: WSEvent) => {
      if (e.leadId && e.data) {
        handlersRef.current.onNewMessage?.(e.data as Mensaje, e.leadId)
      }
    })

    const offLead = wsClient.on('new_lead', (e: WSEvent) => {
      if (e.data) handlersRef.current.onNewLead?.(e.data as Lead)
    })

    const offUpdate = wsClient.on('lead_updated', (e: WSEvent) => {
      if (e.data) handlersRef.current.onLeadUpdated?.(e.data as Lead)
    })

    return () => {
      offConnected()
      offDisconnected()
      offMsg()
      offLead()
      offUpdate()
      wsClient.disconnect()
    }
  }, [])

  const isConnected = connected || wsClient.connected

  return { wsConnected: isConnected }
}

export function useLeadWS(leadId: string | null, onMessage: (msg: Mensaje) => void) {
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const handleNew = useCallback((msg: Mensaje, msgLeadId: string) => {
    if (msgLeadId === leadId) onMessageRef.current(msg)
  }, [leadId])

  useInboxWS({ onNewMessage: handleNew })
}
