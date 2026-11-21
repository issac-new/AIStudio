// overlay[expcandidates/effect-report]（批一 b 变更 2）：record 维度注入效果归因——纯投影。
//
// 语义：按 recordId 聚合召回留痕账（injectionLog 有 taskId 的条目）→ join 任务终态
// （tasks.status，TERMINAL_TASK_STATUSES 同口径：done/archived=success、cancelled=
// failure、其余含缺席=unknown 不猜）→ 与同 scope（注入现场 column＋specialist 语义，
// 列经 task_events column_transition 轨迹匹配——同列即同自动化步链，specialist 是步
// 属性不是任务属性，故列即 cohort 键，回执上的 specialist 只作观测记录）未注入任务
// 成功率对照，输出 injections/success/failure/unknown/successRate/baselineSuccessRate
// /coverage/effect。与 outcome 维度对照（outcome/comparison.ts）并存不合并：本投影
// 回答「这条经验有没有用」，那回答「这个结果有没有改善」（spec 决策 3）。
//
// 纪律（fail-soft 不造假）：样本 < MIN_EFFECT_SAMPLES（处置组或基线任一侧）、终态
// 缺失、回执无列信息（基线不可限定）→ effect=unknown，宁 unknown 不猜数；无 taskId
// 的旧回执不入归因（runLabel 是标签不是任务 id，不造对应）。
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { listInjectionLog, normalizeEvents } from './exp-store'
import type { ExpInjectionKind, ExpInjectionRecord } from './exp-types'

/** 效果判读最小决断样本（任一侧 <5 → effect=unknown；与试用期 minSamples 同锚）。 */
export const MIN_EFFECT_SAMPLES = 5

/** 任务终态判读三态（join 输出侧）。 */
export type TaskOutcomeKind = 'success' | 'failure' | 'unknown'

/** 终态判读（kanban-resolution TERMINAL_TASK_STATUSES 同口径：done/archived/cancelled
 *  为终列；done/archived 计成功、cancelled 计失败、非终态或缺席计 unknown 不猜）。 */
export function classifyTaskOutcome(status: string | null | undefined): TaskOutcomeKind {
  if (status === 'done' || status === 'archived') return 'success'
  if (status === 'cancelled') return 'failure'
  return 'unknown'
}

export type EffectKind = 'improved' | 'degraded' | 'neutral' | 'unknown'

/** 同口径基线（未注入终态任务）。 */
export interface EffectBaseline {
  tasks: number
  success: number
  failure: number
  successRate: number
}

export interface EffectReportRow {
  recordId: string
  kind: ExpInjectionKind
  injections: number
  success: number
  failure: number
  unknown: number
  /** spec 字面口径：成功注入数/总注入数（unknown 计入分母——覆盖率另给 coverage）。 */
  successRate: number
  /** 终态可判比例 =(success+failure)/injections。 */
  coverage: number
  baseline: EffectBaseline | null
  baselineSuccessRate: number | null
  effect: EffectKind
  /** unknown 时给缺口说明（comparison.ts gapNote 同款纪律）。 */
  note: string
}

/** 纯投影入参：IO（留痕账/板库）由调用方注入——核心可无库测试。 */
export interface EffectJoinInput {
  records: ExpInjectionRecord[]
  /** 注入任务 → 终态列值（查无 null）。 */
  taskStatusOf: (taskId: string) => string | null
  /** 候选基线池（未注入任务；含终态与非终态，核心侧再按可判性过滤）。 */
  baselineTasks: Array<{ taskId: string; status: string; columns: string[] }>
}

/** 曝光单元：一回执可携多记录（ids[]），展开后按 (kind, recordId, taskId) 去重——
 *  同一任务对同一记录只计一次曝光（派单简报路与快照路可能各落一行，不双计）。 */
interface ExposureUnit {
  recordId: string
  kind: ExpInjectionKind
  taskId: string
  at: number
  column?: string
}

function normalizeKind(kind: ExpInjectionKind | undefined): ExpInjectionKind {
  // 旧数据无 kind 按 'exp'（批一 b 变更 4 归一口径）
  return kind ?? 'exp'
}

/** 纯投影主函数。 */
export function buildEffectReport(input: EffectJoinInput): EffectReportRow[] {
  const units = new Map<string, ExposureUnit[]>()
  for (const r of input.records) {
    const taskId = r.taskId?.trim()
    if (!taskId) continue // 旧回执无 join 键不入归因
    const kind = normalizeKind(r.kind)
    for (const recordId of r.ids) {
      const key = `${kind}|${recordId}`
      const list = units.get(key) ?? []
      list.push({ recordId, kind, taskId, at: r.at, ...(r.column?.trim() ? { column: r.column.trim() } : {}) })
      units.set(key, list)
    }
  }

  const rows: EffectReportRow[] = []
  for (const [key, list] of units) {
    // (recordId, taskId) 去重：取最新一次曝光（终态同一，时刻取新）
    const latestByTask = new Map<string, ExposureUnit>()
    for (const u of list) {
      const prev = latestByTask.get(u.taskId)
      if (!prev || u.at >= prev.at) latestByTask.set(u.taskId, u)
    }
    const exposures = [...latestByTask.values()]
    let success = 0
    let failure = 0
    let unknown = 0
    for (const u of exposures) {
      const outcome = classifyTaskOutcome(input.taskStatusOf(u.taskId))
      if (outcome === 'success') success += 1
      else if (outcome === 'failure') failure += 1
      else unknown += 1
    }
    const injections = exposures.length
    const scopeColumns = new Set(exposures.map((u) => u.column).filter((c): c is string => Boolean(c)))
    // 基线：未注入任务的终态可判者，列轨迹与注入现场列相交（同列 cohort）
    const decided = scopeColumns.size
      ? input.baselineTasks.filter((b) => {
        const outcome = classifyTaskOutcome(b.status)
        return outcome !== 'unknown' && b.columns.some((c) => scopeColumns.has(c))
      })
      : []
    const baseline: EffectBaseline | null = scopeColumns.size && decided.length
      ? {
        tasks: decided.length,
        success: decided.filter((b) => classifyTaskOutcome(b.status) === 'success').length,
        failure: decided.filter((b) => classifyTaskOutcome(b.status) === 'failure').length,
        successRate: 0,
      }
      : null
    if (baseline) baseline.successRate = baseline.tasks ? baseline.success / baseline.tasks : 0

    const n1 = success + failure
    let effect: EffectKind = 'unknown'
    let note = ''
    if (n1 < MIN_EFFECT_SAMPLES) {
      effect = 'unknown'
      note = `处置组决断样本不足（${n1} < ${MIN_EFFECT_SAMPLES}，终态缺失计 unknown，不猜数）`
    } else if (!baseline) {
      effect = 'unknown'
      note = scopeColumns.size
        ? '同口径基线无可判任务（同列未注入终态任务为空）——不拿全局冒充同口径'
        : '回执无列信息（旧回执/无作用域调用），基线不可限定——效果恒未知'
    } else if (baseline.tasks < MIN_EFFECT_SAMPLES) {
      effect = 'unknown'
      note = `基线决断样本不足（${baseline.tasks} < ${MIN_EFFECT_SAMPLES}）——不猜数`
    } else {
      const p1 = success / n1
      const p0 = baseline.successRate
      effect = p1 > p0 ? 'improved' : p1 < p0 ? 'degraded' : 'neutral'
      note = `处置组 ${success}/${n1} vs 同列基线 ${baseline.success}/${baseline.tasks}`
    }

    const [kind, recordId] = key.split('|') as [ExpInjectionKind, string]
    rows.push({
      recordId,
      kind,
      injections,
      success,
      failure,
      unknown,
      successRate: injections ? success / injections : 0,
      coverage: injections ? n1 / injections : 0,
      baseline,
      baselineSuccessRate: baseline ? baseline.successRate : null,
      effect,
      note,
    })
  }
  // 输出序确定性：kind+recordId
  rows.sort((a, b) => `${a.kind}:${a.recordId}`.localeCompare(`${b.kind}:${b.recordId}`))
  return rows
}

// ---------- 板库 IO 采集（fail-soft，runExtraction 同款读通道） ----------

export interface BoardTaskFacts {
  /** 任务 → 终态列值（tasks.status）。 */
  statusOf: Map<string, string>
  /** 任务 → 到过的列集合（task_events column_transition payload.to，normalizeEvents 归一）。 */
  columnsOf: Map<string, Set<string>>
}

/** 读各板任务终态与列轨迹（单板失败换下一板；node:sqlite 不可用返回空集）。 */
export async function readBoardTaskFacts(homeDir?: string): Promise<BoardTaskFacts> {
  const facts: BoardTaskFacts = { statusOf: new Map(), columnsOf: new Map() }
  for (const dbPath of kanbanDbFiles(homeDir)) {
    let db: Awaited<ReturnType<typeof openReadonly>> | undefined
    try {
      db = await openReadonly(dbPath)
      const tasks = db.prepare('SELECT id, status FROM tasks').all() as Array<{ id?: unknown; status?: unknown }>
      for (const t of tasks) {
        if (typeof t.id === 'string' && t.id) facts.statusOf.set(t.id, typeof t.status === 'string' ? t.status : '')
      }
      const events = db
        .prepare("SELECT id, task_id, kind, payload, created_at FROM task_events WHERE kind = 'column_transition'")
        .all() as unknown as Array<{ id: number; task_id: string; kind: string; payload: unknown; created_at: number }>
      for (const ev of normalizeEvents(events)) {
        if (!ev.to) continue
        const set = facts.columnsOf.get(ev.taskId) ?? new Set<string>()
        set.add(ev.to)
        facts.columnsOf.set(ev.taskId, set)
      }
    } catch { /* 单板失败不阻断（多板合并口径，runExtraction 同纪律） */ }
    finally { try { db?.close() } catch { /* 已关 */ } }
  }
  return facts
}

/** 效果归因采集主函数（REST 只读端点消费）：留痕账＋板库 → 投影行。 */
export async function collectEffectReport(homeDir?: string): Promise<{ generatedAt: string; rows: EffectReportRow[] }> {
  const records = listInjectionLog()
  const facts = await readBoardTaskFacts(homeDir)
  // 「未注入」＝从未出现在任何带 taskId 回执（跨通道：被任何经验/教训注入过的任务不是干净对照）
  const injectedTaskIds = new Set(records.flatMap((r) => (r.taskId?.trim() ? [r.taskId.trim()] : [])))
  const baselineTasks = [...facts.statusOf.entries()]
    .filter(([taskId]) => !injectedTaskIds.has(taskId))
    .map(([taskId, status]) => ({ taskId, status, columns: [...(facts.columnsOf.get(taskId) ?? [])] }))
  const rows = buildEffectReport({
    records,
    taskStatusOf: (taskId) => facts.statusOf.get(taskId) ?? null,
    baselineTasks,
  })
  return { generatedAt: new Date().toISOString(), rows }
}
