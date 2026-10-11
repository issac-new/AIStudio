/**
 * 进度跨机联邦（2026-10-11 用户裁定「现在就动」；三步：事件上行→聚合→跨机巡检）。
 *
 * 背景：真实部署里不同用户及其 agent 分布在多台电脑上；进度事实（卡状态/里程碑/
 * git 在途/审计行）此前只落本机文件——跨机互相看不见。本模块以 Matrix 房间为
 * 共享通道（消息服务器本就在网络侧，git 远端本就共享；结论行广播是该形态的雏形）：
 *
 * ①上行：每台机器的进度端点把本机任务进度聚合成一条结构化事件发进联邦房
 *   （[progress:event] 前缀 + 紧凑 JSON），默认 60s 心跳一次；
 * ②聚合：拉房内近期事件解析入机器注册表（内存有界），端点透出 machines 全局视图；
 * ③巡检：集群巡检官读注册表快照，机器「有过心跳但静默超阈且上报过在途任务」
 *   即报 machine.silent（detectMachineSilence）。
 *
 * 配置：MX_FEDERATION_ROOM（房号；不配=未接线，faces fail-soft 返回 ok:false）；
 * MX_FEDERATION=off 显式关；凭据复用网关 Matrix 环境链（readGatewayMatrixEnv）；
 * 机器名=os.hostname()，MX_FEDERATION_MACHINE_ID 覆盖。全部 fail-soft：联邦
 * 故障不影响本机进度端点的既有应答。
 */

/** 联邦事件（v1 契约；body = EVENT_PREFIX + JSON 一行） */
export const EVENT_PREFIX = '[progress:event] '

export interface FederationEvent {
  v: 1
  machine: string
  ts: number
  type: 'heartbeat' | 'tasks'
  /** 在途 agent 数（会话在跑的档案数；heartbeat/tasks 都带） */
  activeAgents?: number
  /** 任务快照（type=tasks 时） */
  tasks?: Array<FederationTaskSnapshot>
}

export interface FederationTaskSnapshot {
  taskId: string
  target?: string
  currentPhase?: string
  active: boolean
  sessionKnown: boolean
  /** 里程碑尾（最近 3 条，"名称(状态)" 形态） */
  milestones?: string[]
}

export function serializeEvent(e: FederationEvent): string {
  return EVENT_PREFIX + JSON.stringify(e)
}

export function parseEvent(body: string): FederationEvent | null {
  if (!body.startsWith(EVENT_PREFIX)) return null
  try {
    const j = JSON.parse(body.slice(EVENT_PREFIX.length)) as FederationEvent
    if (j && j.v === 1 && typeof j.machine === 'string' && j.machine &&
        typeof j.ts === 'number' && (j.type === 'heartbeat' || j.type === 'tasks')) {
      return j
    }
    return null
  } catch {
    return null
  }
}

/** 机器注册表条目（内存有界：每机留最近 20 条事件摘要） */
export interface MachineEntry {
  machineId: string
  lastSeenMs: number
  lastEvent: FederationEvent
  recent: Array<{ ts: number; type: string; activeTasks: number; activeAgents?: number }>
}

const REGISTRY_MAX_MACHINES = 64
const REGISTRY_PER_MACHINE = 20

const registry = new Map<string, MachineEntry>()

export function registrySnapshot(): MachineEntry[] {
  return [...registry.values()].sort((a, b) => b.lastSeenMs - a.lastSeenMs)
}

export function resetRegistryForTests(): void {
  registry.clear()
}

export function ingestEvent(e: FederationEvent): void {
  const count = e.tasks?.length ?? 0
  let entry = registry.get(e.machine)
  if (!entry) {
    if (registry.size >= REGISTRY_MAX_MACHINES) {
      // 淘汰最久未见者（注册表有界）
      let oldest: string | null = null
      let oldestTs = Infinity
      for (const [k, v] of registry) if (v.lastSeenMs < oldestTs) { oldest = k; oldestTs = v.lastSeenMs }
      if (oldest) registry.delete(oldest)
    }
    entry = { machineId: e.machine, lastSeenMs: e.ts, lastEvent: e, recent: [] }
    registry.set(e.machine, entry)
  }
  entry.lastSeenMs = Math.max(entry.lastSeenMs, e.ts)
  entry.lastEvent = e
  entry.recent.push({ ts: e.ts, type: e.type, activeTasks: count, activeAgents: e.activeAgents })
  if (entry.recent.length > REGISTRY_PER_MACHINE) entry.recent.splice(0, entry.recent.length - REGISTRY_PER_MACHINE)
}

/** 从 Matrix /messages 分页响应中提取并摄取联邦事件（返回摄取条数） */
export function ingestFromMessagesPage(chunk: Array<{ type?: string; sender?: string; origin_server_ts?: number; content?: { body?: string } }>): number {
  let n = 0
  for (const ev of chunk ?? []) {
    if (ev?.type !== 'm.room.message') continue
    const body = ev.content?.body
    if (typeof body !== 'string') continue
    const parsed = parseEvent(body)
    if (parsed) { ingestEvent(parsed); n += 1 }
  }
  return n
}

// ── Matrix 收发（复用网关环境链；fail-soft）─────────────────────────────

export interface FederationFetch {
  homeserverUrl: string
  accessToken: string
  fetchImpl: typeof fetch
}

export function federationRoomId(): string | undefined {
  const r = process.env.MX_FEDERATION_ROOM?.trim()
  return r ? r : undefined
}

export function federationEnabled(): boolean {
  return process.env.MX_FEDERATION !== 'off' && !!federationRoomId()
}

export function machineId(): string {
  return process.env.MX_FEDERATION_MACHINE_ID?.trim() || require('node:os').hostname()
}

/** 拉联邦房近期事件入注册表（dir=b 最近 limit 条；30s 内重复调用直接跳过——
 *  端点每次请求触发刷新，但消息拉取有节流）。 */
let lastPullMs = 0
export async function pullFederationEvents(ff: FederationFetch, limit = 200): Promise<number> {
  const room = federationRoomId()
  if (!room) return 0
  const now = Date.now()
  if (now - lastPullMs < 30_000) return 0
  lastPullMs = now
  try {
    const url = new URL(`/_matrix/client/v3/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=${limit}`, ff.homeserverUrl)
    const res = await ff.fetchImpl(url.toString(), { headers: { authorization: `Bearer ${ff.accessToken}` } })
    if (!res.ok) return 0
    const data = await res.json() as { chunk?: Parameters<typeof ingestFromMessagesPage>[0] }
    return ingestFromMessagesPage(data.chunk ?? [])
  } catch {
    return 0
  }
}

/** 发一条联邦事件（上行；txn 幂等形态与 chat-bridge 同） */
export async function publishFederationEvent(e: FederationEvent, ff: FederationFetch): Promise<boolean> {
  const room = federationRoomId()
  if (!room) return false
  try {
    const txn = `fed-${e.type}-${e.ts}-${Math.random().toString(36).slice(2, 8)}`
    const url = new URL(`/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.room.message/${encodeURIComponent(txn)}`, ff.homeserverUrl)
    const res = await ff.fetchImpl(url.toString(), {
      method: 'PUT',
      headers: { authorization: `Bearer ${ff.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ msgtype: 'm.text', body: serializeEvent(e) }),
    })
    return res.ok
  } catch {
    return false
  }
}
