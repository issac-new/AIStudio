// overlay/custom/server/services/hermes/fleet-events.ts
//
// 舰队实时 WebSocket —— /api/hermes/fleet/events
//
// 服务端主动推（1.5s tick）：全量快照、按用户 profile 权限过滤、内容变化
// 才发。鉴权与 kanban-events 同构（token query + authenticateUserToken）。
// 依赖全部注入（custom 不 import upstream —— symlink 真实路径陷阱）。

import { WebSocketServer } from 'ws'
import type { WebSocket } from 'ws'
import type { Server as HttpServer, IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type { FleetSession } from './fleet-snapshot'

export interface FleetEventsDeps {
  buildSnapshot: () => FleetSession[]
  isAuthEnabled: () => Promise<boolean>
  authenticateUserToken: (token: string) => Promise<{ id: number; role: string } | null>
  userCanAccessProfile: (userId: number, profile: string) => boolean
  rejectUpgradeOrigin?: (req: IncomingMessage, corsOrigins: unknown) => boolean
  corsOrigins?: unknown
  badUpgrade?: (socket: Duplex) => void
  parseUrl?: (req: IncomingMessage) => URL | null
  tickMs?: number
}

interface FleetClient {
  ws: WebSocket
  user: { id: number; role: string } | null
  lastJson: string
}

export function setupFleetWebSocket(httpServers: HttpServer | HttpServer[], deps: FleetEventsDeps) {
  const wss = new WebSocketServer({ noServer: true })
  const servers = Array.isArray(httpServers) ? httpServers : [httpServers]
  const clients = new Set<FleetClient>()
  const tickMs = deps.tickMs ?? 1500
  let closing = false

  const onUpgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = deps.parseUrl ? deps.parseUrl(req) : new URL(req.url || '/', 'http://localhost')
    if (!url || url.pathname !== '/api/hermes/fleet/events') return

    let user: { id: number; role: string } | null = null
    if (await deps.isAuthEnabled()) {
      const token = url.searchParams.get('token') || ''
      user = await deps.authenticateUserToken(token)
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
    }

    wss.handleUpgrade(req, socket, head, ws => {
      const client: FleetClient = { ws, user, lastJson: '' }
      clients.add(client)
      ws.on('close', () => clients.delete(client))
      ws.on('error', () => clients.delete(client))
      ws.send(JSON.stringify({ type: 'hello', tickMs }))
    })
  }

  servers.forEach(server => server.on('upgrade', onUpgrade))

  const tick = () => {
    if (closing || clients.size === 0) return
    let sessions: FleetSession[]
    try {
      sessions = deps.buildSnapshot()
    } catch {
      return
    }
    const ts = Date.now()
    for (const client of clients) {
      if (client.user && client.user.role !== 'super_admin') {
        const allowed = sessions.filter(item => deps.userCanAccessProfile(client.user!.id, item.profile || 'default'))
        sendRaw(client, allowed, ts)
      } else {
        sendRaw(client, sessions, ts)
      }
    }
  }

  const sendRaw = (client: FleetClient, sessions: FleetSession[], ts: number) => {
    if (client.ws.readyState !== client.ws.OPEN) return
    const payload = { type: 'snapshot', ts, sessions }
    const json = JSON.stringify(payload)
    if (json === client.lastJson) return
    client.lastJson = json
    try {
      client.ws.send(json)
    } catch {
      clients.delete(client)
    }
  }

  const timer = setInterval(tick, tickMs)
  timer.unref?.()

  const detach = () => {
    clearInterval(timer)
    servers.forEach(server => server.off('upgrade', onUpgrade))
    for (const client of clients) client.ws.terminate()
    clients.clear()
  }

  return {
    name: 'Fleet events WebSocket',
    close(): Promise<void> {
      closing = true
      detach()
      return Promise.resolve()
    },
    forceClose: detach,
  }
}
