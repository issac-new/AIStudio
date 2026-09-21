// overlay/custom/client/ia2/adapters/activity.ts
// v13 协作感知纯聚合（2026-09-21 沟通协作完善轮）：三组纯函数，全部无副作用、
// 可被组件测试直接消费。调研锚点（multica/routa 源码级调研，见
// docs/comm-collab-v13-research.md）：
//   ① loopRunActivity —— multica「agent 活动指示器」的循环面投影：看板行上
//      谁在干活（Working/Queued）→ 左栏循环行的运行中/待确认计数；
//   ② buildAttention —— multica 收件箱 severity 三档（action_required/attention/
//      info）中的 attention 档：不需点击但要人看一眼的受阻/失败，与右栏「等我」
//      （action_required 档）互补成两档分诊；
//   ③ classifyRunEvent/semanticCounts —— routa「语义块时间线」的词汇适配：
//      事件编年按语义类着色过滤（read/write/terminal 的图词汇对位：
//      节点/步进/介入/阶段/生命周期/成本）。
import type { RunSummary } from '@/custom/loop/runcenter/types'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

// ── ① 循环活动（左栏存在感）──────────────────────────────────────────

/** 单循环活动摘要（来自该循环全部 run 的现状计数） */
export interface LoopActivity {
  running: number
  awaiting: number
  failed: number
}

/** graphId → loopId（graph-compiler 约定 `loop-<loopId>`；非 loop 图返回 null） */
function loopIdOfGraph(graphId: string): string | null {
  if (!graphId.startsWith('loop-')) return null
  const id = graphId.slice(5)
  return id || null
}

/** runs → 按 loopId 聚合的活动索引（WorkbenchView 一次计算，左栏行消费） */
export function loopRunActivity(runs: readonly RunSummary[]): Map<string, LoopActivity> {
  const out = new Map<string, LoopActivity>()
  for (const r of runs) {
    const loopId = loopIdOfGraph(r.graphId)
    if (!loopId) continue
    const acc = out.get(loopId) ?? { running: 0, awaiting: 0, failed: 0 }
    if (r.status === 'running') acc.running++
    else if (r.status === 'awaiting-input') acc.awaiting++
    else if (r.status === 'failed') acc.failed++
    out.set(loopId, acc)
  }
  return out
}

// ── ② 需关注分诊（右栏 attention 档）─────────────────────────────────

export type AttentionKind = 'task-blocked' | 'run-failed' | 'loop-stuck'

export interface AttentionRow {
  kind: AttentionKind
  /** 去重 id：task:<id> / run:<runId>（failed 与 stuck 同 run 去重取 stuck） */
  id: string
  /** 主标题（数据非 i18n：任务标题 / runId） */
  title: string
  /** 副文 i18n key */
  subKey: string
  ts: number
  taskId?: string
  runId?: string
}

/** lastActivityAt 归一 ms（ISO 串 ∪ ms 数 ∪ null → 0） */
function tsMs(ts: string | number | null): number {
  if (ts == null) return 0
  if (typeof ts === 'number') return ts
  const parsed = Date.parse(ts)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** 事件时刻归一 ms（GraphEventLike.ts 为 ISO 串 ∪ epoch ms） */
function eventTsMs(ts: string | number | undefined): number {
  if (ts == null) return 0
  if (typeof ts === 'number') return ts
  const parsed = Date.parse(ts)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** runs 事件里是否出现过 loop.stuck（熔断），并取其最新时刻 */
function latestStuckAt(run: RunSummary): number {
  let latest = 0
  for (const e of run.events) {
    const name = e.kind ?? e.type ?? ''
    if (name === 'loop.stuck') {
      const at = eventTsMs(e.ts)
      if (at > latest) latest = at
    }
  }
  return latest
}

/**
 * 需关注行（attention 档）：受阻任务（kanban blocked 态）+ 失败/停滞 run。
 * 与 buildWaiting 的边界：awaiting-input 已进「等我」（action_required 档），
 * 此处只收不需点击但需人过目的异常态。同 run 同时 failed+stuck 时保留
 * stuck（原因更可行动），runId 去重。排序：时间倒序。
 */
export function buildAttention(
  tasks: readonly CockpitTask[],
  runs: readonly RunSummary[],
  _now: number,
): AttentionRow[] {
  const out: AttentionRow[] = []
  for (const t of tasks) {
    if (t.status !== 'blocked') continue
    out.push({
      kind: 'task-blocked', id: `task:${t.id}`, title: t.title,
      subKey: 'ia2.att.subTaskBlocked', ts: t.createdAt, taskId: t.id,
    })
  }
  const seenRun = new Set<string>()
  for (const r of runs) {
    const stuckAt = latestStuckAt(r)
    if (stuckAt > 0) {
      out.push({
        kind: 'loop-stuck', id: `run:${r.runId}`, title: r.runId,
        subKey: 'ia2.att.subLoopStuck', ts: stuckAt || tsMs(r.lastActivityAt), runId: r.runId,
      })
      seenRun.add(r.runId)
      continue
    }
    if (r.status === 'failed' && !seenRun.has(r.runId)) {
      out.push({
        kind: 'run-failed', id: `run:${r.runId}`, title: r.runId,
        subKey: 'ia2.att.subRunFailed', ts: tsMs(r.lastActivityAt), runId: r.runId,
      })
    }
  }
  return out.sort((a, b) => b.ts - a.ts)
}

// ── ③ 语义块分类（历史回放着色/过滤）────────────────────────────────

export type SemanticKind = 'lifecycle' | 'step' | 'node' | 'interrupt' | 'stage' | 'cost' | 'other'

/** 展示顺序（strip/chips 固定序；semanticCounts 依此输出） */
export const SEMANTIC_ORDER: readonly SemanticKind[] = [
  'node', 'step', 'stage', 'interrupt', 'lifecycle', 'cost', 'other',
]

/**
 * 事件名（chronicle row.type = kind ?? type 的合并词汇）→ 语义类。
 * 两个词汇通吃：socket 词汇（graph.* / interrupt.* / cost.* / loop.*）与
 * 日志词汇（completed / error-routed / interrupted / resumed）。
 */
export function classifyRunEvent(name: string): SemanticKind {
  if (name === 'loop.stuck') return 'interrupt'
  if (name.startsWith('loop.stage')) return 'stage'
  if (name.startsWith('graph.node')) return 'node'
  if (name === 'graph.step-start' || name === 'step-start') return 'step'
  if (
    name.startsWith('interrupt.') || name === 'interrupted' || name === 'resumed'
    || name === 'graph.interrupt' || name === 'graph.resume'
  ) return 'interrupt'
  if (name.startsWith('cost.')) return 'cost'
  if (
    name === 'graph.started' || name === 'graph.completed' || name === 'graph.failed'
    || name === 'graph.forked' || name === 'started' || name === 'failed'
  ) return 'lifecycle'
  if (name === 'completed' || name === 'error-routed' || name === 'node-error') return 'node'
  return 'other'
}

/** 事件名序列 → 各语义类计数（按 SEMANTIC_ORDER 序，零计数省略） */
export function semanticCounts(names: readonly string[]): Array<{ kind: SemanticKind; n: number }> {
  const acc = new Map<SemanticKind, number>()
  for (const n of names) {
    const kind = classifyRunEvent(n)
    acc.set(kind, (acc.get(kind) ?? 0) + 1)
  }
  return SEMANTIC_ORDER.filter(k => acc.has(k)).map(kind => ({ kind, n: acc.get(kind)! }))
}
