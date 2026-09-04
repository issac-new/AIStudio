// fleet-adapter.ts —— 舰队（跨 profile 会话）客户端类型 + WS 流
//
// 服务端 /api/hermes/fleet/events 推 {type:'snapshot', sessions}（1.5s tick、
// 变化才发）。本模块负责：类型镜像、快照防御性归一化、带重连的 WS 订阅。

import { getApiKey, getBaseUrlValue } from '@/api/client'

export interface FleetApprovalPreview {
  approval_id: string
  preview: string
  choices: string[]
}

export interface FleetClarifyPreview {
  clarify_id: string
  question: string
}

export interface FleetSession {
  id: string
  profile: string
  title: string
  status: 'working' | 'idle'
  isAborting: boolean
  queueLength: number
  runStartedAt: number | null
  lastActiveAt: number
  source: string
  agent: string
  lastPreview: string
  approvals: FleetApprovalPreview[]
  clarifies: FleetClarifyPreview[]
}

export interface FleetSnapshot {
  ts: number
  sessions: FleetSession[]
}

function str(value: unknown, fallback = ''): string {
  const s = typeof value === 'string' ? value : ''
  return s || fallback
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** 防御性归一化：服务端字段缺失/类型漂移时兜底，保证 UI 不炸 */
export function normalizeSnapshot(raw: unknown): FleetSnapshot {
  const payload = (raw && typeof raw === 'object' ? raw : {}) as any
  const sessions: FleetSession[] = Array.isArray(payload.sessions)
    ? payload.sessions.filter((item: any) => item && typeof item.id === 'string').map((item: any) => ({
      id: String(item.id),
      profile: str(item.profile, 'default'),
      title: str(item.title) || String(item.id),
      status: item.status === 'working' ? 'working' : 'idle',
      isAborting: item.isAborting === true,
      queueLength: num(item.queueLength),
      runStartedAt: typeof item.runStartedAt === 'number' && item.runStartedAt > 0 ? item.runStartedAt : null,
      lastActiveAt: num(item.lastActiveAt),
      source: str(item.source),
      agent: str(item.agent),
      lastPreview: str(item.lastPreview).slice(0, 200),
      approvals: Array.isArray(item.approvals)
        ? item.approvals.filter((a: any) => a && typeof a.approval_id === 'string').map((a: any) => ({
          approval_id: String(a.approval_id),
          preview: str(a.preview),
          choices: Array.isArray(a.choices) ? a.choices.map((c: unknown) => String(c)) : [],
        }))
        : [],
      clarifies: Array.isArray(item.clarifies)
        ? item.clarifies.filter((c: any) => c && typeof c.clarify_id === 'string').map((c: any) => ({
          clarify_id: String(c.clarify_id),
          question: str(c.question),
        }))
        : [],
    }))
    : []
  return { ts: num(payload.ts), sessions }
}

function buildCommandWebSocketUrl(pathWithQuery: string): string {
  const base = getBaseUrlValue()
  const protocol = base
    ? (base.startsWith('https') ? 'wss:' : 'ws:')
    : (typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:')
  if (base) return `${protocol}//${new URL(base).host}${pathWithQuery}`
  const directDevPort = import.meta.env.VITE_HERMES_DIRECT_WS_PORT
  const host = import.meta.env.DEV && directDevPort
    ? (typeof location !== 'undefined'
      ? (location.hostname.includes(':') ? `[${location.hostname}]` : location.hostname) + ':' + directDevPort
      : 'localhost')
    : (typeof location !== 'undefined' ? location.host : 'localhost')
  return `${protocol}//${host}${pathWithQuery}`
}

function buildFleetWebSocketUrl(): string {
  const params = new URLSearchParams()
  const token = getApiKey()
  if (token) params.set('token', token)
  return buildCommandWebSocketUrl(`/api/hermes/fleet/events?${params.toString()}`)
}

export interface FleetStreamHandlers {
  onSnapshot: (snapshot: FleetSnapshot) => void
  onStatus?: (connected: boolean) => void
}

export interface FleetStreamHandle {
  close: () => void
}

/** 订阅舰队流（指数退避重连，close() 后不再重连） */
export function connectFleetStream(handlers: FleetStreamHandlers): FleetStreamHandle {
  let closed = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let ws: WebSocket | null = null

  const open = () => {
    if (closed) return
    try {
      ws = new WebSocket(buildFleetWebSocketUrl())
    } catch {
      scheduleReconnect()
      return
    }
    ws.onopen = () => {
      attempt = 0
      handlers.onStatus?.(true)
    }
    ws.onmessage = event => {
      let data: unknown
      try {
        data = JSON.parse(String(event.data))
      } catch {
        return
      }
      const type = (data as any)?.type
      if (type === 'snapshot') handlers.onSnapshot(normalizeSnapshot(data))
    }
    ws.onclose = () => {
      handlers.onStatus?.(false)
      scheduleReconnect()
    }
    ws.onerror = () => {
      try {
        ws?.close()
      } catch {
        /* 忽略 */
      }
    }
  }

  const scheduleReconnect = () => {
    if (closed || timer) return
    const delay = Math.min(1000 * 2 ** attempt, 15_000)
    attempt += 1
    timer = setTimeout(() => {
      timer = null
      open()
    }, delay)
  }

  open()
  return {
    close() {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      try {
        ws?.close()
      } catch {
        /* 忽略 */
      }
      handlers.onStatus?.(false)
    },
  }
}

/** 看板聚合事件流（/api/hermes/kanban/overview/events）：任一 board 有事件即回调 */
export function connectOverviewStream(handlers: {
  onBoardEvent: (board: string) => void
  onStatus?: (connected: boolean) => void
}): FleetStreamHandle {
  const params = new URLSearchParams()
  const token = getApiKey()
  if (token) params.set('token', token)
  let closed = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let ws: WebSocket | null = null

  const open = () => {
    if (closed) return
    try {
      ws = new WebSocket(buildCommandWebSocketUrl(`/api/hermes/kanban/overview/events?${params.toString()}`))
    } catch {
      scheduleReconnect()
      return
    }
    ws.onopen = () => {
      attempt = 0
      handlers.onStatus?.(true)
    }
    ws.onmessage = event => {
      let data: unknown
      try {
        data = JSON.parse(String(event.data))
      } catch {
        return
      }
      if ((data as any)?.type === 'board-event') handlers.onBoardEvent(String((data as any).board || ''))
    }
    ws.onclose = () => {
      handlers.onStatus?.(false)
      scheduleReconnect()
    }
    ws.onerror = () => {
      try {
        ws?.close()
      } catch {
        /* 忽略 */
      }
    }
  }

  const scheduleReconnect = () => {
    if (closed || timer) return
    const delay = Math.min(1000 * 2 ** attempt, 15_000)
    attempt += 1
    timer = setTimeout(() => {
      timer = null
      open()
    }, delay)
  }

  open()
  return {
    close() {
      closed = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      try {
        ws?.close()
      } catch {
        /* 忽略 */
      }
      handlers.onStatus?.(false)
    },
  }
}
