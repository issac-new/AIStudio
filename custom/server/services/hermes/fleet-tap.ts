// overlay/custom/server/services/hermes/fleet-tap.ts
//
// ChatRunSocket 实例 taps —— 跨 profile 舰队聚合的桥。
//
// patch 195-server-chatrun-fleet-tap.patch 在 chat-run.ts 的 init()/close()
// 里调用 registerChatRunSocket/unregisterChatRunSocket，把实例与
// { getSession, listSessions } 依赖注入进来（custom 代码不能反向 import
// upstream 模块：symlink 真实路径会让相对 import 失效，见 trace.ts 注释）。
//
// 读取路径全部是内存数据：sessionMap（isWorking/queue/runStartedAt）、
// state.events（working 期间最近 200 条事件，含 approval/clarify 往返）、
// state.messages（尾部预览）。不 spawn 任何进程。

import {
  buildFleetSnapshot,
  type FleetClarifyPreview,
  type FleetApprovalPreview,
  type FleetDbSession,
  type FleetLiveEntry,
  type FleetSession,
  type FleetSubagent,
  normalizeSubagentTask,
  sortSubagents,
} from './fleet-snapshot'

interface InjectedDeps {
  getSession: (sessionId: string) => any
  listSessions: (...args: any[]) => any[]
}

interface LiveSessionState {
  isWorking?: boolean
  isAborting?: boolean
  queue?: unknown[]
  runStartedAt?: number
  profile?: string
  source?: string
  events?: Array<{ event: string; data: any }>
  messages?: Array<{ role?: string; content?: unknown; display_content?: unknown }>
  /** bridge background_poll 写入的子代理花名册（upstream applyBackgroundSessionPoll） */
  backgroundTasks?: Record<string, any>
}

let registeredInstance: any = null
let deps: InjectedDeps | null = null

export function registerChatRunSocket(instance: any, injected: InjectedDeps): void {
  registeredInstance = instance
  deps = injected
}

export function unregisterChatRunSocket(): void {
  registeredInstance = null
  deps = null
}

export function isFleetTapReady(): boolean {
  return registeredInstance !== null
}

/** 从事件流（按时间序）提取仍未解决的 approval/clarify */
export function extractPendingInteractions(
  events: Array<{ event: string; data: any }> | undefined,
): { approvals: FleetApprovalPreview[]; clarifies: FleetClarifyPreview[] } {
  const approvals = new Map<string, FleetApprovalPreview>()
  const clarifies = new Map<string, FleetClarifyPreview>()
  for (const { event, data } of events || []) {
    if (!data || typeof data !== 'object') continue
    if (event === 'approval.requested') {
      const id = String(data.approval_id || '')
      if (!id) continue
      const rawChoices = Array.isArray(data.choices) ? data.choices.map((item: unknown) => String(item)) : []
      approvals.set(id, {
        approval_id: id,
        preview: String(data.preview || data.tool || data.name || data.summary || '').trim(),
        choices: rawChoices.length ? rawChoices : ['once', 'session', 'deny'],
      })
    } else if (event === 'approval.resolved') {
      approvals.delete(String(data.approval_id || ''))
    } else if (event === 'clarify.requested') {
      const id = String(data.clarify_id || '')
      if (!id) continue
      clarifies.set(id, {
        clarify_id: id,
        question: String(data.question || data.text || data.message || '').trim(),
      })
    } else if (event === 'clarify.resolved') {
      clarifies.delete(String(data.clarify_id || ''))
    }
  }
  return { approvals: [...approvals.values()], clarifies: [...clarifies.values()] }
}

/** 从消息尾部提取最后一条可读预览 */
export function extractLastPreview(
  messages: Array<{ role?: string; content?: unknown; display_content?: unknown }> | undefined,
): string {
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message) continue
    const role = String(message.role || '')
    if (role !== 'assistant' && role !== 'user') continue
    const raw = message.display_content ?? message.content
    const text = typeof raw === 'string' ? raw : Array.isArray(raw)
      ? raw.map(block => (block && typeof block === 'object' && typeof (block as any).text === 'string'
        ? (block as any).text
        : '')).join(' ')
      : ''
    const clipped = text.trim().slice(0, 200)
    if (clipped) return clipped
  }
  return ''
}

/** 从 state.backgroundTasks 归一化出子代理花名册（running 在前，更新近的在前） */
export function extractSubagents(
  backgroundTasks: Record<string, unknown> | undefined,
): FleetSubagent[] {
  if (!backgroundTasks || typeof backgroundTasks !== 'object') return []
  const list: FleetSubagent[] = []
  for (const raw of Object.values(backgroundTasks)) {
    const normalized = normalizeSubagentTask(raw)
    if (normalized) list.push(normalized)
  }
  return sortSubagents(list)
}

function toLiveEntry(sessionId: string, state: LiveSessionState, fallbackProfile: string): FleetLiveEntry {
  const pending = extractPendingInteractions(state.events)
  return {
    id: sessionId,
    profile: state.profile || fallbackProfile || 'default',
    isWorking: state.isWorking === true,
    isAborting: state.isAborting === true,
    queueLength: Array.isArray(state.queue) ? state.queue.length : 0,
    runStartedAt: typeof state.runStartedAt === 'number' && state.runStartedAt > 0 ? state.runStartedAt : null,
    source: String(state.source || ''),
    lastPreview: extractLastPreview(state.messages),
    approvals: pending.approvals,
    clarifies: pending.clarifies,
    subagents: extractSubagents(state.backgroundTasks),
  }
}

/** live 条目（sessionMap 全量）。未注册 tap 时返回空数组。 */
export function getFleetLiveEntries(): FleetLiveEntry[] {
  const instance = registeredInstance
  if (!instance) return []
  const sessionMap: Map<string, LiveSessionState> | undefined = instance.sessionMap
  if (!sessionMap || typeof sessionMap.entries !== 'function') return []
  const entries: FleetLiveEntry[] = []
  for (const [sessionId, state] of sessionMap.entries()) {
    if (!state) continue
    let profile = state.profile
    if (!profile && deps?.getSession) {
      try {
        profile = deps.getSession(sessionId)?.profile
      } catch {
        profile = undefined
      }
    }
    entries.push(toLiveEntry(sessionId, state, String(profile || '')))
  }
  return entries
}

function listDbSessions(): FleetDbSession[] {
  if (!deps?.listSessions) return []
  try {
    const rows = deps.listSessions(undefined, undefined, 10_000) || []
    return rows.map(row => ({
      id: String(row?.id || ''),
      profile: String(row?.profile || 'default'),
      title: row?.title != null ? String(row.title) : null,
      last_active: Number(row?.last_active || 0),
      source: row?.source != null ? String(row.source) : null,
      agent: row?.agent != null ? String(row.agent) : null,
    })).filter(row => row.id)
  } catch {
    return []
  }
}

/** 完整舰队快照（live + DB 合并） */
export function buildFleetSnapshotFromTap(): FleetSession[] {
  return buildFleetSnapshot({ live: getFleetLiveEntries(), dbSessions: listDbSessions() })
}

/** 就地审批（跨 profile）：校验由调用方（controller）负责 */
export async function respondFleetApproval(
  approvalId: string,
  choice: string,
): Promise<{ resolved: boolean; error?: string }> {
  const bridge = registeredInstance?.bridge
  if (!bridge || typeof bridge.approvalRespond !== 'function') {
    return { resolved: false, error: 'Agent bridge is not available' }
  }
  try {
    const result = await bridge.approvalRespond(approvalId, choice)
    return { resolved: Boolean(result?.resolved) }
  } catch (err) {
    return { resolved: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 就地澄清应答（跨 profile） */
export async function respondFleetClarify(
  clarifyId: string,
  response: string,
): Promise<{ resolved: boolean; error?: string }> {
  const bridge = registeredInstance?.bridge
  if (!bridge || typeof bridge.clarifyRespond !== 'function') {
    return { resolved: false, error: 'Agent bridge is not available' }
  }
  try {
    const result = await bridge.clarifyRespond(clarifyId, response)
    return { resolved: Boolean((result as any)?.resolved) }
  } catch (err) {
    return { resolved: false, error: err instanceof Error ? err.message : String(err) }
  }
}
