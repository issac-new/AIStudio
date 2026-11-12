// overlay/resume 域：自动恢复判定（2026-10-18 残余项②）。
//
// 现状：图检查点有真快照，agent 侧有交接/进展检查点，但两者没有统一 run 键，
// 恢复全靠人；源文《Harness Engineering》要求“下次运行读到整理好的工作台，
// 而不是重新猜前情”。本模块把三类检查点汇总成三档判定：
//   auto_resume —— 检查点新鲜、无 pending interrupt、无冲突标记；
//   manual_gate —— 有待应答 interrupt 或检查点过旧（可能改过环境）；
//   new_session —— 无检查点 / 文件损坏 / run 与 session 不匹配。
// 只给建议与证据，不自动执行恢复（自动续跑可能重复副作用）。
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { createEventLogStore, type EventLogStore } from '../loop/graph/event-log-store'
import { resolveLoopBaseDir } from '../loop/paths'
import { underHermes } from '../lib/paths'

export type ResumeDecision = 'auto_resume' | 'manual_gate' | 'new_session'

export interface CheckpointEvidence {
  found: boolean
  path?: string
  ageMs?: number | null
  superStep?: number
  pendingInterrupts?: number
  next?: string
  corrupt?: boolean
  note?: string
}

export interface UnsettledActions {
  found: boolean
  count: number
  actions?: Array<{ key: string; tool: string; status: string; ts?: number }>
  path?: string
  corrupt?: boolean
  note?: string
}

export interface ResumeFacts {
  runId?: string
  sessionId?: string
  graph: CheckpointEvidence
  handoff: CheckpointEvidence
  progress: CheckpointEvidence
  /** 2026-11-12 handbook 吸收：未结算副作用动作（sent/intended）。缺席=未查/无账本。 */
  unsettled?: UnsettledActions
}

export interface ResumePlan {
  runId?: string
  sessionId?: string
  decision: ResumeDecision
  reasons: string[]
  next?: string
  facts: ResumeFacts
}

export interface ResumePlanOptions {
  /** 检查点最大新鲜度（默认 2 小时）。 */
  maxAgeMs?: number
  now?: number
}

export function resumeMaxAgeMs(): number {
  const v = Number(process.env.HERMES_RESUME_MAX_AGE_MS)
  return Number.isFinite(v) && v > 0 ? v : 2 * 3_600_000
}

function sessionCheckpointsDir(): string {
  return process.env.HERMES_SESSION_CHECKPOINTS_DIR?.trim()
    || underHermes('session-checkpoints')
}

function progressCheckpointsDir(): string {
  return process.env.HERMES_PROGRESS_CHECKPOINTS_DIR?.trim()
    || underHermes('memories', 'checkpoints')
}

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return null }
}

function findHandoff(key: string | undefined): { path: string; record: Record<string, unknown>; corrupt: boolean } | null {
  if (!key) return null
  const dir = sessionCheckpointsDir()
  if (!existsSync(dir)) return null
  const exact = join(dir, `${key.replace(/[\\/]/g, '_')}.json`)
  const candidates = existsSync(exact)
    ? [exact]
    : readdirSync(dir).filter((f) => f.endsWith('.json')).slice(0, 500).map((f) => join(dir, f))
  for (const path of candidates) {
    const parsed = readJson<{ history?: Array<Record<string, unknown>>; key?: string }>(path)
    if (!parsed) {
      if (path === exact) return { path, record: {}, corrupt: true }
      continue
    }
    const history = Array.isArray(parsed.history) ? parsed.history : []
    const record = history[history.length - 1]
    if (!record) continue
    const pointers = (record.pointers ?? {}) as Record<string, unknown>
    const keys = [parsed.key, pointers.session_key, pointers.prev_session_id].filter(Boolean).map(String)
    if (path === exact || keys.includes(key)) return { path, record, corrupt: false }
  }
  return null
}

function findProgress(key: string | undefined): { path: string; text: string } | null {
  if (!key) return null
  const dir = progressCheckpointsDir()
  if (!existsSync(dir)) return null
  const exact = join(dir, `${key}.md`)
  if (existsSync(exact)) {
    try { return { path: exact, text: readFileSync(exact, 'utf8') } } catch { return null }
  }
  return null
}

function nextFromProgress(text: string): string | undefined {
  const m = text.match(/^##\s*next\s*\n([\s\S]*?)(?:\n##|$)/im)
  return m?.[1]?.trim().split('\n')[0]?.trim() || undefined
}

function epochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value
  return null
}

let graphStore: EventLogStore | null = null
let graphStorePath = ''

function ensureGraphStore(): boolean {
  const dbPath = join(resolveLoopBaseDir(), 'graph-events.db')
  if (!existsSync(dbPath)) return false
  if (graphStore && graphStorePath === dbPath) return true
  try {
    graphStore = createEventLogStore(dbPath)
    graphStorePath = dbPath
    return true
  } catch {
    graphStore = null
    return false
  }
}

/** 异步读取图检查点（SQLite 一连接复用）。 */
async function readGraphCheckpoint(runId: string | undefined, now: number): Promise<CheckpointEvidence> {
  if (!runId) return { found: false, note: '未提供 runId' }
  if (!ensureGraphStore()) return { found: false, note: '图检查点库缺席或不可读' }
  try {
    const cp = await graphStore!.getLatestCheckpoint(runId)
    if (!cp) return { found: false, note: '该 run 无检查点' }
    const created = Date.parse(cp.createdAt)
    return {
      found: true,
      superStep: cp.superStep,
      pendingInterrupts: cp.pendingInterrupts?.length ?? 0,
      ageMs: Number.isFinite(created) ? Math.max(0, now - created) : null,
      next: cp.nextNodes?.length ? `next: ${cp.nextNodes.join(', ')}` : undefined,
    }
  } catch {
    return { found: false, note: '图检查点读取失败' }
  }
}

function actionLedgerPath(): string {
  const dir = process.env.HERMES_ACTION_LEDGER_DIR?.trim() || underHermes('action-ledger')
  return join(dir, 'ledger.jsonl')
}

/** 只读 action-ledger：同一 key 取末条；sent/intended 且在新鲜窗口内视为未结算。 */
function readUnsettledActions(now: number, maxAgeMs: number): UnsettledActions {
  const path = actionLedgerPath()
  if (!existsSync(path)) return { found: false, count: 0, path }
  let bad = 0
  const latest = new Map<string, Record<string, unknown>>()
  try {
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line) as Record<string, unknown>
        const key = typeof row.key === 'string' ? row.key : ''
        if (key) latest.set(key, row)
      } catch {
        bad += 1
      }
    }
  } catch {
    return { found: false, count: 0, path, corrupt: true, note: '动作账本读取失败' }
  }
  const actions: Array<{ key: string; tool: string; status: string; ts?: number }> = []
  for (const [key, row] of latest) {
    const status = String(row.status ?? '')
    if (status !== 'intended' && status !== 'sent') continue
    const ts = typeof row.ts === 'number' ? row.ts * 1000 : null
    if (ts != null && now - ts > maxAgeMs) continue
    actions.push({
      key,
      tool: String(row.tool ?? 'unknown'),
      status,
      ...(typeof row.ts === 'number' ? { ts: row.ts } : {}),
    })
  }
  actions.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
  return {
    found: actions.length > 0,
    count: actions.length,
    actions: actions.slice(0, 20),
    path,
    ...(bad > 0 && actions.length === 0 ? { corrupt: true, note: `账本有 ${bad} 坏行且无有效未结算记录` } : {}),
  }
}

export function collectResumeFacts(input: { runId?: string; sessionId?: string }, now = Date.now()): Omit<ResumeFacts, 'graph'> & { graph: CheckpointEvidence } {
  const key = input.runId || input.sessionId
  const handoff = findHandoff(key)
  const progress = findProgress(key)
  return {
    runId: input.runId,
    sessionId: input.sessionId,
    graph: { found: false },
    unsettled: readUnsettledActions(now, resumeMaxAgeMs()),
    handoff: handoff
      ? {
          found: true,
          path: handoff.path,
          ageMs: handoff.corrupt ? null : (() => {
            const at = epochMs(handoff.record.ts)
            return at == null ? null : Math.max(0, now - at)
          })(),
          next: typeof handoff.record.left === 'string' ? handoff.record.left : undefined,
          corrupt: handoff.corrupt || undefined,
        }
      : { found: false },
    progress: progress
      ? {
          found: true,
          path: progress.path,
          ageMs: (() => {
            try { return Math.max(0, now - statSync(progress.path).mtimeMs) } catch { return null }
          })(),
          next: nextFromProgress(progress.text),
        }
      : { found: false },
  }
}

/** 纯判定：三档 + 理由（事实缺席如实写进 reasons）。 */
export function decideResume(facts: ResumeFacts, opts: ResumePlanOptions = {}): ResumePlan {
  const now = opts.now ?? Date.now()
  const maxAge = opts.maxAgeMs ?? resumeMaxAgeMs()
  const reasons: string[] = []
  const stale = (e: CheckpointEvidence): boolean => typeof e.ageMs === 'number' && e.ageMs > maxAge

  // 未结算副作用优先于任何检查点：检查点只能证明「任务到哪」，不能证明「钱退没退」。
  if (facts.unsettled?.corrupt) {
    reasons.push(facts.unsettled.note || '动作账本损坏——无法确认外部副作用是否已发生')
    return { runId: facts.runId, sessionId: facts.sessionId, decision: 'manual_gate', reasons, facts }
  }
  if (facts.unsettled?.found && facts.unsettled.count > 0) {
    const sample = (facts.unsettled.actions ?? [])
      .slice(0, 3)
      .map((a) => `${a.tool}(${a.status})`)
      .join('、')
    reasons.push(
      `存在 ${facts.unsettled.count} 个未结算副作用动作${sample ? `：${sample}` : ''}——先查外部真实状态，禁止直接重放`,
    )
    return { runId: facts.runId, sessionId: facts.sessionId, decision: 'manual_gate', reasons, facts }
  }

  if (facts.graph.found) {
    if ((facts.graph.pendingInterrupts ?? 0) > 0) {
      reasons.push(`图检查点有 ${facts.graph.pendingInterrupts} 个待应答 interrupt——需人工确认`)
      return { runId: facts.runId, sessionId: facts.sessionId, decision: 'manual_gate', reasons, next: facts.graph.next, facts }
    }
    if (stale(facts.graph)) {
      reasons.push(`图检查点已超过新鲜度阈值（${Math.round((facts.graph.ageMs ?? 0) / 60000)} 分钟），环境可能已变化`)
      return { runId: facts.runId, sessionId: facts.sessionId, decision: 'manual_gate', reasons, next: facts.graph.next, facts }
    }
    reasons.push(`图检查点第 ${facts.graph.superStep ?? '?'} 步、无待应答 interrupt、在新鲜窗口内`)
    return { runId: facts.runId, sessionId: facts.sessionId, decision: 'auto_resume', reasons, next: facts.graph.next, facts }
  }

  if (facts.handoff.corrupt) {
    reasons.push('交接检查点文件损坏——无法确认前情')
    return { runId: facts.runId, sessionId: facts.sessionId, decision: 'new_session', reasons, facts }
  }
  if (facts.handoff.found) {
    if (stale(facts.handoff)) {
      reasons.push('交接检查点已过新鲜度阈值——建议新会话并人工确认')
      return { runId: facts.runId, sessionId: facts.sessionId, decision: 'manual_gate', reasons, next: facts.handoff.next, facts }
    }
    reasons.push('存在新鲜交接检查点（无图检查点）——可按交接记录继续')
    return { runId: facts.runId, sessionId: facts.sessionId, decision: 'auto_resume', reasons, next: facts.handoff.next, facts }
  }
  if (facts.progress.found) {
    if (stale(facts.progress)) {
      reasons.push('进展检查点已过新鲜度阈值')
      return { runId: facts.runId, sessionId: facts.sessionId, decision: 'manual_gate', reasons, next: facts.progress.next, facts }
    }
    reasons.push('存在新鲜进展检查点（无图/交接检查点）——可按 next 继续')
    return { runId: facts.runId, sessionId: facts.sessionId, decision: 'auto_resume', reasons, next: facts.progress.next, facts }
  }
  reasons.push('未找到任何可用检查点——从新会话开始')
  return { runId: facts.runId, sessionId: facts.sessionId, decision: 'new_session', reasons, facts }
}

/** 组合采集 + 判定（API 消费）。 */
export async function planResume(input: { runId?: string; sessionId?: string }, opts: ResumePlanOptions = {}): Promise<ResumePlan> {
  const now = opts.now ?? Date.now()
  const facts = collectResumeFacts(input, now)
  facts.graph = await readGraphCheckpoint(input.runId, now)
  return decideResume(facts, { ...opts, now })
}

/** 测试隔离：清空图检查点连接。 */
export function _resetResumePlannerForTests(): void {
  graphStore = null
  graphStorePath = ''
}
