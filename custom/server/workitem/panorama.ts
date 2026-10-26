// overlay[workitem] 工作项全景串联（JoyAI 闭环吸收轮 P4，2026-10-26）。
//
// 范式来源：京东 JoyAI 核心精髓——「唯一统一上下文 ID 串联需求设计、协同推演、
// 代码开发、线上发布、运维监控的全链路产物」。AIStudio 现状是五套局部主键
// （sessionId/taskId/caseId/runId/specId）点对点互指；本模块是汇聚层实现：
// 以看板 taskId 为主键，一次查询汇聚全链路八面产物。
//
// 纪律（仓三条不变量）：每面独立 fail-soft——源缺席/损坏返回 available:false
// 不猜数；跨域映射边界如实写进 coverage（trace 会话只给 eval origin 桥接的
// 已知关联；eval re- id 与看板 taskId 的映射不存在，按 origin.taskId + id
// 双路匹配）。不引入新主键、不改任何写入面——纯读侧投影。
import { openReadonly, kanbanDbFiles } from '../governance/governance-analytics'
import { listEvidence, latestVerdict } from '../evidence/evidence-store'
import { listSets, getSet, listRuns } from '../eval/store'
import { listCases } from '../reviewgov/store'
import { listRequested } from '../plan/plan-mode'
import { getEventLogStore } from '../loop/graph/event-log-registry'

/** 单面读数：available=false 表示源缺席/读取失败（error 说明原因），不猜数。 */
export interface Face<T> {
  available: boolean
  error?: string
  data?: T
}

export interface TaskCardFace {
  board: string
  id: string
  title: string
  status: string
  assignee: string | null
  createdAt?: number
  completedAt?: number | null
}

export interface KanbanEventFace {
  id: number
  kind: string
  createdAt: number
  payloadSummary: string
}

export interface EvidenceFace {
  count: number
  records: Array<{ evidenceId: string; kind: string; at: number; note?: string; verdict?: string }>
  latestVerdict: { verdict: string; at: number; basis?: string } | null
}

export interface EvalTaskFace {
  setId: string
  setName: string
  sealed: boolean
  taskId: string
  /** 密封集不携带题面（密封契约：内容不出 API 面）。 */
  problem?: string
  runIds: string[]
}

export interface ReviewFace {
  caseId: string
  title: string
  state: string
  tier: string
  updatedAt: number
}

export interface PlanFace {
  planId: string
  state: string
  fromAgent: string
  at: number
}

export interface GraphRunFace {
  runId: string
  graphId: string
  artifact: string
  ts: number
}

export interface TraceFace {
  sessionId: string
  /** 关联依据（诚实标注）：eval_origin=评测回流 origin 携带；attempt=运行采样携带。 */
  via: 'eval_origin' | 'attempt'
}

export interface WorkitemPanorama {
  taskId: string
  generatedAt: number
  task: Face<TaskCardFace>
  kanbanEvents: Face<KanbanEventFace[]>
  evidence: Face<EvidenceFace>
  evals: Face<EvalTaskFace[]>
  reviews: Face<ReviewFace[]>
  plans: Face<PlanFace[]>
  graphRuns: Face<GraphRunFace[]>
  traces: Face<TraceFace[]>
  /** 串联覆盖边界（诚实声明——哪些关联通道不存在，防止读数被误读为「无产物」）。 */
  coverage: {
    tracesIndexedByTask: boolean
    evalTaskIdMapping: 'origin_taskid' | 'none'
    note: string
  }
}

/** 看板卡片+事件（同库两查）：taskId 跨板定位（板数个位级，主键扫毫秒级）。 */
async function fetchKanban(taskId: string): Promise<{ card: Face<TaskCardFace>; events: Face<KanbanEventFace[]> }> {
  for (const dbPath of kanbanDbFiles()) {
    let db: Awaited<ReturnType<typeof openReadonly>>
    try {
      db = await openReadonly(dbPath)
    } catch (e) {
      return {
        card: { available: false, error: `看板库读取失败：${(e as Error).message}` },
        events: { available: false },
      }
    }
    try {
      const row = db.prepare('SELECT id, title, assignee, status, created_at, completed_at FROM tasks WHERE id = ?')
        .get(taskId) as { id: string; title: string | null; assignee: string | null; status: string; created_at?: number; completed_at?: number | null } | undefined
      if (!row) continue
      const board = dbPath.includes('/boards/') ? (dbPath.match(/boards\/([^/]+)\/kanban\.db$/)?.[1] ?? 'main') : 'main'
      // kanban.db 时间戳为 unix 秒（governance-analytics 头注口径）——转毫秒；
      // 秒级值 <1e12 判秒，缺省/异常不造数（undefined 透传）
      const toMs = (v: number): number => (v < 1e12 ? v * 1000 : v)
      const card: Face<TaskCardFace> = {
        available: true,
        data: {
          board, id: row.id, title: row.title ?? row.id, status: row.status, assignee: row.assignee,
          createdAt: row.created_at !== undefined && row.created_at !== null ? toMs(row.created_at) : undefined,
          completedAt: row.completed_at != null ? toMs(row.completed_at) : null,
        },
      }
      let events: Face<KanbanEventFace[]> = { available: true, data: [] }
      try {
        const rows = db.prepare('SELECT id, kind, payload, created_at FROM task_events WHERE task_id = ? ORDER BY id DESC LIMIT 50')
          .all(taskId) as Array<{ id: number; kind: string; payload: string | null; created_at: number }>
        events = {
          available: true,
          data: rows.map((r) => ({
            id: r.id, kind: r.kind,
            createdAt: r.created_at < 1e12 ? r.created_at * 1000 : r.created_at,
            payloadSummary: (r.payload ?? '').slice(0, 120),
          })),
        }
      } catch { /* task_events 表缺席（新板）=无事件，不谎报失败 */ }
      return { card, events }
    } catch (e) {
      return {
        card: { available: false, error: `看板查询失败：${(e as Error).message}` },
        events: { available: false },
      }
    } finally {
      try { db?.close() } catch { /* 已关 */ }
    }
  }
  return { card: { available: false, error: '任务不在任何看板库中' }, events: { available: false, error: '任务不在任何看板库中' } }
}

/** 评测任务面：双路匹配——task.id === taskId（eval 任务 id 直查，含 re-* 回流题）
 * 或 task.origin.taskId === taskId（回流任务回指源题）。密封集只出元数据不出题面。 */
function fetchEvals(taskId: string): { face: Face<EvalTaskFace[]>; traceSessions: TraceFace[] } {
  try {
    const metas = listSets()
    const matched: EvalTaskFace[] = []
    const sessions = new Map<string, TraceFace>()
    for (const meta of metas) {
      const set = getSet(meta.id)
      if (!set) continue
      for (const t of set.tasks) {
        // ReflowOrigin 联合类型窄化：只有 eval_run 源带 taskId（生产 trace 源无）
        const originTaskId = t.origin && 'taskId' in t.origin ? t.origin.taskId : undefined
        const hit = t.id === taskId || originTaskId === taskId
        if (!hit) continue
        if (t.origin?.source !== 'production_trace' && t.origin?.sessionId) {
          sessions.set(t.origin.sessionId, { sessionId: t.origin.sessionId, via: 'eval_origin' })
        }
        matched.push({
          setId: set.id, setName: set.name, sealed: set.sealed, taskId: t.id,
          problem: set.sealed ? undefined : t.problem.slice(0, 160),
          runIds: [],
        })
      }
    }
    // 运行归属：attempts[].taskId 命中即挂（attempt 采样 sessionId 顺带收集）
    for (const run of listRuns()) {
      const attemptHits = run.attempts.filter((a) => a.taskId === taskId || matched.some((m) => m.taskId === a.taskId))
      if (!attemptHits.length) continue
      for (const m of matched) {
        if (run.attempts.some((a) => a.taskId === m.taskId)) m.runIds.push(run.id)
      }
      for (const a of attemptHits) {
        if (a.sessionId && !sessions.has(a.sessionId)) sessions.set(a.sessionId, { sessionId: a.sessionId, via: 'attempt' })
      }
    }
    return { face: { available: true, data: matched }, traceSessions: [...sessions.values()] }
  } catch (e) {
    return { face: { available: false, error: `评测库读取失败：${(e as Error).message}` }, traceSessions: [] }
  }
}

/** 全景汇聚（全 fail-soft；无任何写入面）。 */
export async function buildPanorama(taskId: string): Promise<WorkitemPanorama> {
  const { card, events } = await fetchKanban(taskId)

  let evidence: Face<EvidenceFace> = { available: false }
  try {
    const records = listEvidence(taskId)
    const verdict = latestVerdict(taskId)
    evidence = {
      available: true,
      data: {
        count: records.length,
        records: records.slice(0, 20).map((r) => ({ evidenceId: r.evidenceId, kind: r.kind, at: r.at, note: r.note, verdict: r.verdict })),
        latestVerdict: verdict ? { verdict: String(verdict.verdict), at: verdict.at, basis: verdict.basis } : null,
      },
    }
  } catch (e) {
    evidence = { available: false, error: `证据台账读取失败：${(e as Error).message}` }
  }

  const { face: evals, traceSessions } = fetchEvals(taskId)

  let reviews: Face<ReviewFace[]> = { available: false }
  try {
    const data = listCases()
      .filter((c) => c.taskId === taskId)
      .map((c) => ({ caseId: c.caseId, title: c.title, state: c.state, tier: c.risk.tier, updatedAt: c.updatedAt }))
    reviews = { available: true, data }
  } catch (e) {
    reviews = { available: false, error: `评审案例读取失败：${(e as Error).message}` }
  }

  let plans: Face<PlanFace[]> = { available: false }
  try {
    const data = listRequested()
      .filter((p) => p.taskId === taskId)
      .map((p) => ({ planId: p.planId, state: p.state, fromAgent: p.fromAgent, at: p.at }))
    plans = { available: true, data }
  } catch (e) {
    plans = { available: false, error: `计划读取失败：${(e as Error).message}` }
  }

  let graphRuns: Face<GraphRunFace[]> = { available: false }
  const store = getEventLogStore()
  if (!store) {
    graphRuns = { available: false, error: '图事件日志未装配（loop 子系统缺席）' }
  } else {
    try {
      const hits: GraphRunFace[] = []
      for (const { runId, graphId } of await store.listRuns()) {
        // loop.persisted 事件携 taskId（P3 Task 7 显式关联）；旧数据无该字段如实跳过
        const events = await store.query(runId, { kind: 'loop.persisted', limit: 200 })
        for (const ev of events) {
          if (ev.payload?.taskId !== taskId) continue
          hits.push({ runId, graphId, artifact: String(ev.payload?.artifact ?? ''), ts: ev.ts })
        }
      }
      graphRuns = { available: true, data: hits }
    } catch (e) {
      graphRuns = { available: false, error: `图事件日志查询失败：${(e as Error).message}` }
    }
  }

  return {
    taskId,
    generatedAt: Date.now(),
    task: card,
    kanbanEvents: events,
    evidence,
    evals,
    reviews,
    plans,
    graphRuns,
    traces: { available: true, data: traceSessions },
    coverage: {
      // trace 目录按 sessionId 组织、无 taskId 索引——只有 eval origin/attempt 桥接的
      // 已知关联可见；「无 trace」≠「无会话」，是索引边界。
      tracesIndexedByTask: false,
      evalTaskIdMapping: 'origin_taskid',
      note: 'trace 会话无 taskId 索引（仅评测 origin/采样桥接可见）；eval re- 任务与看板任务无既定映射（按 origin.taskId + id 双路匹配）',
    },
  }
}
