import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { config } from '../config';
import { queryMany } from '../db';

interface WsConnection {
  ws: WebSocket;
  vendedorId: string;
  connectedAt: Date;
}

interface WsEvent {
  type: string;
  leadId?: string;
  [key: string]: unknown;
}

export class WsHub {
  private connections: Map<string, Set<WsConnection>> = new Map();
  private subscriber: Redis;
  private publisher: Redis;

  constructor() {
    this.subscriber = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 100, 5000),
    });

    this.publisher = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.setupSubscriber();
  }

  private setupSubscriber(): void {
    this.subscriber.on('pmessage', async (pattern, channel, message) => {
      try {
        const leadId = channel.replace('lead:', '');
        const event = JSON.parse(message) as WsEvent;
        await this.broadcastToLeadVendors(leadId, event);
      } catch (err) {
        console.error('[WsHub] Error processing Redis message:', (err as Error).message);
      }
    });

    this.subscriber.on('error', (err) => {
      console.error('[WsHub] Redis subscriber error:', err.message);
    });

    this.subscriber.psubscribe('lead:*', (err) => {
      if (err) {
        console.error('[WsHub] Failed to subscribe to lead:* pattern:', err.message);
      } else {
        console.log('[WsHub] Subscribed to Redis pattern lead:*');
      }
    });
  }

  async onConnect(ws: WebSocket, vendedorId: string): Promise<void> {
    const connection: WsConnection = { ws, vendedorId, connectedAt: new Date() };

    if (!this.connections.has(vendedorId)) {
      this.connections.set(vendedorId, new Set());
    }
    this.connections.get(vendedorId)!.add(connection);

    console.log(`[WsHub] Vendor ${vendedorId} connected. Total connections: ${this.getTotalConnections()}`);

    // Send initial connection confirmation
    this.sendToWs(ws, {
      type: 'connected',
      vendedorId,
      timestamp: new Date().toISOString(),
    });

    ws.on('close', () => {
      this.onDisconnect(ws, vendedorId);
    });

    ws.on('error', (err) => {
      console.error(`[WsHub] WS error for vendor ${vendedorId}:`, err.message);
      this.onDisconnect(ws, vendedorId);
    });

    ws.on('pong', () => {
      // Heartbeat received
    });
  }

  onDisconnect(ws: WebSocket, vendedorId: string): void {
    const connections = this.connections.get(vendedorId);
    if (connections) {
      for (const conn of connections) {
        if (conn.ws === ws) {
          connections.delete(conn);
          break;
        }
      }

      if (connections.size === 0) {
        this.connections.delete(vendedorId);
      }
    }

    console.log(`[WsHub] Vendor ${vendedorId} disconnected. Total connections: ${this.getTotalConnections()}`);
  }

  async broadcastToLeadVendors(leadId: string, event: WsEvent): Promise<void> {
    try {
      // Find vendors assigned to this lead
      const vendors = await queryMany<{ asignado_a: string | null }>(
        'SELECT asignado_a FROM leads WHERE id = $1',
        [leadId]
      );

      const vendorIds = vendors
        .map((v) => v.asignado_a)
        .filter((id): id is string => id !== null);

      // Also notify gerentes (managers should see all activity)
      const gerentes = await queryMany<{ id: string }>(
        "SELECT id FROM usuarios WHERE rol = 'gerente' AND activo = true"
      );
      const gerenteIds = gerentes.map((g) => g.id);

      const targetIds = [...new Set([...vendorIds, ...gerenteIds])];

      for (const vendedorId of targetIds) {
        this.broadcastToVendor(vendedorId, { ...event, leadId });
      }
    } catch (err) {
      console.error('[WsHub] Error broadcasting to lead vendors:', (err as Error).message);
    }
  }

  broadcastToVendor(vendedorId: string, event: WsEvent): void {
    const connections = this.connections.get(vendedorId);
    if (!connections || connections.size === 0) {
      return;
    }

    const payload = JSON.stringify(event);
    const deadConnections: WsConnection[] = [];

    for (const conn of connections) {
      if (conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(payload);
        } catch (err) {
          console.error('[WsHub] Send error:', (err as Error).message);
          deadConnections.push(conn);
        }
      } else {
        deadConnections.push(conn);
      }
    }

    // Clean up dead connections
    for (const dead of deadConnections) {
      connections.delete(dead);
    }
  }

  broadcast(leadId: string, event: WsEvent): void {
    this.publisher
      .publish(`lead:${leadId}`, JSON.stringify({ ...event, leadId }))
      .catch((err) => console.error('[WsHub] Publish error:', err.message));
  }

  broadcastAll(event: WsEvent): void {
    const payload = JSON.stringify(event);
    for (const [vendedorId, connections] of this.connections) {
      for (const conn of connections) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          try {
            conn.ws.send(payload);
          } catch {
            // ignore
          }
        }
      }
    }
  }

  private sendToWs(ws: WebSocket, event: WsEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(event));
      } catch {
        // ignore
      }
    }
  }

  startHeartbeat(intervalMs = 30000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      for (const [, connections] of this.connections) {
        for (const conn of connections) {
          if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.ping();
          }
        }
      }
    }, intervalMs);
  }

  getConnectedVendors(): string[] {
    return Array.from(this.connections.keys());
  }

  getTotalConnections(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }

  async destroy(): Promise<void> {
    await this.subscriber.punsubscribe('lead:*');
    this.subscriber.disconnect();
    this.publisher.disconnect();
    console.log('[WsHub] Destroyed');
  }
}

export const wsHub = new WsHub();
