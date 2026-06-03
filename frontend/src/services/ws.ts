import type { WSEvent } from '../types'

type EventHandler = (event: WSEvent) => void

class WSClient {
  private ws: WebSocket | null = null
  private token: string | null = null
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectDelay = 1000
  private maxDelay = 30000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private pingInterval: ReturnType<typeof setInterval> | null = null

  private get wsUrl(): string {
    const base = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:3000`
    return `${base}/ws?token=${this.token}`
  }

  connect(token: string): void {
    this.token = token
    this.destroyed = false
    this.reconnectDelay = 1000
    this._connect()
  }

  private _connect(): void {
    if (this.destroyed || !this.token) return

    try {
      this.ws = new WebSocket(this.wsUrl)

      this.ws.onopen = () => {
        this.reconnectDelay = 1000
        this._emit({ type: 'connected' as WSEvent['type'], timestamp: new Date().toISOString() })
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25000)
      }

      this.ws.onmessage = (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data as string) as WSEvent
          this._emit(event)
        } catch {
          // ignore
        }
      }

      this.ws.onclose = () => {
        if (this.pingInterval) clearInterval(this.pingInterval)
        this._emit({ type: 'disconnected' as WSEvent['type'], timestamp: new Date().toISOString() })
        if (!this.destroyed) this._scheduleReconnect()
      }

      this.ws.onerror = () => {
        this.ws?.close()
      }
    } catch {
      if (!this.destroyed) this._scheduleReconnect()
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay)
      this._connect()
    }, this.reconnectDelay)
  }

  disconnect(): void {
    this.destroyed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pingInterval) clearInterval(this.pingInterval)
    this.ws?.close()
    this.ws = null
  }

  on(type: WSEvent['type'] | 'connected' | 'disconnected', handler: EventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  private _emit(event: WSEvent): void {
    this.handlers.get(event.type)?.forEach((h) => h(event))
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsClient = new WSClient()
