/**
 * 进度联邦控制器（挂 /api/progress 同 Router；2026-10-11 跨机三步的端点面）：
 *  - GET /api/progress/machines —— 全局机器视图（本机+联邦房各机器：最近心跳/
 *    在途任务数/静默分钟；联邦未接线=只有本机一条，如实标注 wired:false）。
 *  - 联邦拉取节流内嵌 pullFederationEvents；发布器（上行心跳）默认 60s 一次，
 *    由本模块首次路由命中时惰性启动（unref 定时器，MX_FEDERATION_ROOM 未配=空转）。
 */
import { readGatewayMatrixEnv } from '../matrix/gateway-env'
import { readDispatchLedger } from '../governance/dispatch-ledger'
import { getZcodeProjectionRuntime } from '../zcode/projection-runtime'
import { getSessionStore, readWorkspaceMilestones } from './task-progress-store'
import { taskProgressOverview } from './task-progress-analytics'
import {
  type FederationEvent, type FederationTaskSnapshot, machineId, federationEnabled, federationRoomId,
  registrySnapshot, pullFederationEvents, publishFederationEvent,
} from './federation'

export interface MachineView {
  machineId: string
  self: boolean
  lastSeenMs: number
  activeTasks: number
  activeAgents?: number
  /** 静默分钟（now-lastSeen；本机恒≈0） */
  silentMin: number
  tasks?: FederationTaskSnapshot[]
}

function fetchFace() {
  const env = readGatewayMatrixEnv(process.env)
  if (!env) return null
  return { homeserverUrl: env.homeserverUrl, accessToken: env.accessToken, fetchImpl: globalThis.fetch.bind(globalThis) }
}

/** 本机事件组装：复用 /tasks 的本机聚合（台账×会话×里程碑）压缩成联邦快照 */
export function buildLocalEvent(): FederationEvent {
  const ledger = readDispatchLedger(2000).filter((e) => e.taskId)
  const sessions = getSessionStore(getZcodeProjectionRuntime())
  const milestonesByWorkspace = new Map<string, ReturnType<typeof readWorkspaceMilestones>>()
  for (const e of ledger) {
    if (e.workspaceId && !milestonesByWorkspace.has(e.workspaceId)) {
      milestonesByWorkspace.set(e.workspaceId, readWorkspaceMilestones(e.workspaceId))
    }
  }
  const overview = taskProgressOverview(ledger, sessions, { activeOnly: false, limit: 50, milestonesByWorkspace })
  const tasks: FederationTaskSnapshot[] = overview.tasks.slice(0, 20).map((t) => ({
    taskId: t.taskId,
    target: t.target,
    currentPhase: t.currentPhase,
    active: t.active,
    sessionKnown: t.sessionKnown,
    milestones: t.milestones.slice(-3).map((m) => `${m.milestone}(${m.status ?? 'done'})`),
  }))
  return { v: 1, machine: machineId(), ts: Date.now(), type: 'tasks', activeAgents: overview.activeCount, tasks }
}

export async function machinesView(): Promise<{ wired: boolean; room?: string; machines: MachineView[] }> {
  const self = buildLocalEvent()
  const ff = fetchFace()
  if (ff && federationEnabled()) {
    await pullFederationEvents(ff).catch(() => 0)
    // 本机也入注册表（自己的上行若已发布则注册表已有；这里保证未发布也可见）
    const evt = { ...self, type: 'heartbeat' as const, tasks: undefined }
    registrySnapshot() // no-op 触发排序不变量（保持函数纯读语义）
  }
  const now = Date.now()
  const machines: MachineView[] = registrySnapshot()
    .filter((m) => now - m.lastSeenMs < 24 * 3600_000)
    .map((m) => ({
      machineId: m.machineId,
      self: m.machineId === self.machine,
      lastSeenMs: m.lastSeenMs,
      activeTasks: m.lastEvent.tasks?.length ?? 0,
      activeAgents: m.lastEvent.activeAgents,
      silentMin: Math.max(0, Math.round((now - m.lastSeenMs) / 60000)),
      tasks: m.lastEvent.tasks,
    }))
  // 本机保底条目（未上行/联邦未接线时也可见）
  if (!machines.some((m) => m.machineId === self.machine)) {
    machines.unshift({
      machineId: self.machine, self: true, lastSeenMs: self.ts,
      activeTasks: self.tasks?.length ?? 0, activeAgents: self.activeAgents,
      silentMin: 0, tasks: self.tasks,
    })
  }
  return { wired: federationEnabled() && !!ff, room: federationRoomId(), machines }
}

// ── 上行发布器（60s 心跳；首次取机器视图时惰性启动）────────────────────
let publisherTimer: ReturnType<typeof setInterval> | null = null
let lastPublishMs = 0

export async function publishOnce(): Promise<boolean> {
  const ff = fetchFace()
  if (!ff || !federationEnabled()) return false
  const e = buildLocalEvent()
  const ok = await publishFederationEvent(e, ff)
  if (ok) lastPublishMs = Date.now()
  return ok
}

export function ensureFederationPublisher(): void {
  if (publisherTimer || !federationEnabled()) return
  publisherTimer = setInterval(() => { void publishOnce() }, 60_000)
  publisherTimer.unref?.()
  void publishOnce()
}

export function stopFederationPublisherForTests(): void {
  if (publisherTimer) clearInterval(publisherTimer)
  publisherTimer = null
}
