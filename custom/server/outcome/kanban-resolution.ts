// custom/server/outcome/kanban-resolution.ts
// 看板↔outcome 反查读层与派发结果门（spec 2026-11-19-ai-native-operating-model-design.md
// §3.3.2「column.dispatch 由 taskId 在服务端反查 outcome、合同版本和身份，生成批一
// 最小决策快照」＋§4.4；AI 原生组织运行模型批一 Task 10）。
//
// 职责三件：
//   1) 读层：outcomeOfTask（tasks.outcome_id→getContract 绑定快道＋findByRootTask
//      台账兜底）、tasksByOutcome（同 outcome 全部关联任务）、rootTaskSummary——
//      只读连接（kanban-task-fast 同款 readOnly 打开），跨板枚举走 kanban-layout
//      单一事实源（kanban-bind 同口径 skipUnderscored，业务枚举跳 `_` 归档目录）。
//   2) 控制器注入面真实现：tasksTerminalOf / verifyRootTask（Task 7 预留注入点的正身，
//      取代 outcome-controller 缺省的 fail-closed 桩）。
//   3) 派发门 resolveDispatchOutcome：cancelled/settled 拒（REST 422
//      outcome_not_active）；active/draft/observing 生成最小快照并幂等补绑定
//      （关键源失败 422 outcome_context_unavailable，spec §4.4「关键源失败禁止派单」）。
//
// 边界纪律：
// - 读侧 fail-soft：库不可开/表缺失/坏行→null/[]＋console.warn 原因可查（不猜数）；
// - 门侧 fail-closed：终态合同拒派、快照关键源（合同/任务/身份/政策）缺失或落账
//   失败拒派——快照是派单授权语境正身，落不了账即语境不可用；
// - 绑定兜底（防御「合同激活后未绑定」窗口）：outcomeOfTask 绑定快道落空（未绑定/
//   绑定指向失联合同）时按 rootTaskId 扫台账反查，命中即守卫生效并由派发门幂等
//   补绑定（bindOutcomeToTask 三态契约：同值幂等零写入）——守卫不因绑定缺口失明。
import { createRequire } from 'node:module'
import { hermesHome } from '../lib/paths'
import { allBoardDbsOf } from '../services/hermes/kanban-layout'
import { bindOutcomeToTask } from './kanban-bind'
import { findByRootTask, getContract, appendSnapshot } from './outcome-store'
import { DEFAULT_DECISION_POLICY_VERSION, buildFullSnapshot } from './snapshot'
import type { SnapshotPersonRow, SnapshotTaskSummary } from './snapshot'
import { listPeople } from '../agentidentity/people'
import type { OutcomeContract } from './types'
// 批二 T5 全量面读源（全部既有域，不复制聚合器）：
import { listEvidence, latestVerdict } from '../evidence/evidence-store'
import { listCases } from '../reviewgov/store'
import { listRequested } from '../plan/plan-mode'
import { listPremises } from '../premiselog/store'
import { listDecisions } from '../decisiongraph/semantica-client'
import { listCandidates, recordInjection } from '../expcandidates/exp-store'
import { selectableExperiences } from '../expcandidates/exp-inject'

// 双运行时取 node:sqlite：服务端 ts-node（CJS）与 vitest（ESM）都走 createRequire
// 解内置模块（kanban-bind/kanban-task-fast 同款）；解不出=读通道关闭（fail-soft）。
const nodeRequire: NodeRequire | null = (() => {
  try { return createRequire('/index.js') } catch { return null }
})()

type Stmt = { get: (...p: unknown[]) => unknown; all: (...p: unknown[]) => unknown[] }
type Db = { prepare: (sql: string) => Stmt; close: () => void }

/** 只读连接（kanban-task-fast 同款）：guardrail 武装板的写闸对只读面无感。 */
function openReadonly(dbPath: string): Db | null {
  if (!nodeRequire) return null
  try {
    const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string, o: { readOnly: boolean }) => Db }
    return new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return null
  }
}

const describeErr = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

export interface KanbanResolutionOptions {
  /** 覆写 hermes home（测试注入；缺省 lib/paths hermesHome，含 HERMES_HOME env）。 */
  home?: string
  /** 批二 T5 经验召回作用域（派单列；EXPERIENCE_INJECT=1 时供 selectableExperiences 过滤）。 */
  experienceScope?: { column?: string }
}

const homeOf = (opts: KanbanResolutionOptions): string => opts.home ?? hermesHome()

/** 读出面把 '' 归一为 null（kanban-bind 同口径：空串语义=未挂靠）。 */
function normalize(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

// ---------- 读层 ----------

/** 跨板只读查 tasks.outcome_id：任务行命中返回其绑定（'' 归一 null）；
 *  任务不在该板继续试下一板；库/读失败 warn 后继续（fail-soft）。 */
function readOutcomeBinding(taskId: string, home: string): string | null {
  for (const { slug, dbPath } of allBoardDbsOf(home, { skipUnderscored: true })) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) return null // node:sqlite 不可用：读通道整体关闭
      const row = db.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(taskId) as
        | { outcome_id?: unknown }
        | undefined
      if (row) return normalize(row.outcome_id)
    } catch (err) {
      // 批四 T2（走查 F3）：缺 outcome_id 列加 [schema_missing] 定向标记（读投影无错误通道，
      // 保持 fail-soft；bindOutcomeFamily 面返回专用码）
      const _sm = /no such column:\s*outcome_id/i.test(describeErr(err))
      console.warn(`[kanban-resolution] 读板 ${slug} 失败${_sm ? '（schema_missing：tasks 表缺 outcome_id 列）' : '（fail-soft 试下一板）'}：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return null
}

/**
 * 按 taskId 反查生效合同：绑定快道（tasks.outcome_id→getContract）优先；
 * 落空（未绑定/绑定指向失联合同）时按 rootTaskId 扫台账兜底——「合同激活后
 * 未绑定」窗口内守卫不失明（派发门命中后会幂等补绑定）。无合同返回 null。
 */
export function outcomeOfTask(taskId: string, opts: KanbanResolutionOptions = {}): OutcomeContract | null {
  if (!nonEmpty(taskId)) return null
  const id = taskId.trim()
  const bound = readOutcomeBinding(id, homeOf(opts))
  if (bound) {
    const c = getContract(bound)
    if (c) return c
    console.warn(`[kanban-resolution] 任务 ${id} 绑定 ${bound} 但合同不可读（坏档已隔离/失联），转台账兜底`)
  }
  const byRoot = findByRootTask(id)
  if (byRoot) {
    if (byRoot.outcomeId !== bound) {
      console.warn(
        `[kanban-resolution] 任务 ${id} 绑定面（${bound ?? '空'}）与台账根合同 ${byRoot.outcomeId} 不一致——按台账守卫生效，派发门将幂等补绑定`,
      )
    }
    return byRoot
  }
  return null
}

/** 同 outcome 的全部关联看板任务（跨板聚合、id 排序确定性）；未知 outcome/无库 → []。 */
export interface TaskOutcomeRef {
  id: string
  status: string
}

export function tasksByOutcome(outcomeId: string, opts: KanbanResolutionOptions = {}): TaskOutcomeRef[] {
  if (!nonEmpty(outcomeId)) return []
  const rows: TaskOutcomeRef[] = []
  for (const { slug, dbPath } of allBoardDbsOf(homeOf(opts), { skipUnderscored: true })) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) break // node:sqlite 不可用：读通道整体关闭
      const found = db.prepare('SELECT id, status FROM tasks WHERE outcome_id = ?').all(outcomeId) as Array<{
        id?: unknown
        status?: unknown
      }>
      for (const r of found) {
        if (nonEmpty(r.id)) {
          rows.push({ id: r.id, status: typeof r.status === 'string' ? r.status : '' })
        }
      }
    } catch (err) {
      // 批四 T2（走查 F3）：缺 outcome_id 列加 [schema_missing] 定向标记（读投影无错误通道，
      // 保持 fail-soft；bindOutcomeFamily 面返回专用码）
      const _sm = /no such column:\s*outcome_id/i.test(describeErr(err))
      console.warn(`[kanban-resolution] 读板 ${slug} 失败${_sm ? '（schema_missing：tasks 表缺 outcome_id 列）' : '（fail-soft 试下一板）'}：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** 根任务摘要（snapshot resolve.task 契约面）：id/title/status 只读投影；查无 null。 */
export function rootTaskSummary(taskId: string, opts: KanbanResolutionOptions = {}): SnapshotTaskSummary | null {
  if (!nonEmpty(taskId)) return null
  const id = taskId.trim()
  for (const { slug, dbPath } of allBoardDbsOf(homeOf(opts), { skipUnderscored: true })) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) return null
      const row = db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(id) as
        | { id?: unknown; title?: unknown; status?: unknown }
        | undefined
      if (row) {
        return {
          id: String(row.id ?? id),
          title: typeof row.title === 'string' ? row.title : '',
          status: typeof row.status === 'string' ? row.status : '',
        }
      }
    } catch (err) {
      // 批四 T2（走查 F3）：缺 outcome_id 列加 [schema_missing] 定向标记（读投影无错误通道，
      // 保持 fail-soft；bindOutcomeFamily 面返回专用码）
      const _sm = /no such column:\s*outcome_id/i.test(describeErr(err))
      console.warn(`[kanban-resolution] 读板 ${slug} 失败${_sm ? '（schema_missing：tasks 表缺 outcome_id 列）' : '（fail-soft 试下一板）'}：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return null
}

// ---------- 控制器注入面正身（Task 7 注入点接真实现） ----------

/** 任务终态词表：done/archived 为 kernel DEFAULT_STATUSES 终列，cancelled 承接
 *  任务简报逐字（子卡被取消形态）；集合外状态（running/blocked/review/…）一律
 *  非终态。 */
const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(['done', 'archived', 'cancelled'])

/**
 * observing 迁移守卫正身（spec §3.2）：根任务及全部同 outcome 子任务全部终态才 true。
 * 空集 fail-closed false——零关联任务=绑定面不可证明（激活应至少绑定根卡），
 * 不借空集放行 observing（transitionGuards 缺省 fail-closed 同哲学）。
 */
export function tasksTerminalOf(outcomeId: string, opts: KanbanResolutionOptions = {}): boolean {
  const tasks = tasksByOutcome(outcomeId, opts)
  if (tasks.length === 0) return false
  return tasks.every((t) => TERMINAL_TASK_STATUSES.has(t.status))
}

/**
 * 根任务归属证明（spec §4.6）：存在→{ok:true}；板库可枚举但查无→{ok:false}
 * （可证明不属于当前部署，控制器永不放行）；无任何板库→null（不可证明，
 * 控制器默认 422 ownership_unavailable、env 显式放行试点）。
 */
export function verifyRootTask(rootTaskId: string, opts: KanbanResolutionOptions = {}): { ok: boolean } | null {
  if (!nonEmpty(rootTaskId)) return { ok: false }
  const boards = allBoardDbsOf(homeOf(opts), { skipUnderscored: true })
  if (boards.length === 0) return null
  return rootTaskSummary(rootTaskId, opts) !== null ? { ok: true } : { ok: false }
}

/** 身份册快照行（snapshot resolve.people 契约）：裁掉 emails 等非快照面。
 *  名册损坏上抛由 buildMinimalSnapshot 的解析吞包转 ok:false（身份关键源失败）。 */
export function snapshotPeopleRows(ids: string[]): SnapshotPersonRow[] {
  const want = new Set(ids)
  return listPeople().filter((p) => want.has(p.id)).map((p) => ({ id: p.id, name: p.name, active: p.active }))
}

// ---------- 激活即绑定（审查修复轮二 I2 裁决） ----------

/** 激活绑定结果码：root_task_missing 根卡不在任何板库；outcome_conflict 家族内
 *  存在异值绑定（改挂须显式迁移，spec §3.3.1）；db_unavailable 无板库/读通道
 *  关闭；write_failed 写阶段失败（预检后磁盘/竞态，幂等重试自愈）。 */
export type ActivationBindCode = 'root_task_missing' | 'outcome_conflict' | 'db_unavailable' | 'write_failed' | 'schema_missing'

export interface ActivationBindResult {
  ok: boolean
  code?: ActivationBindCode
  problems?: string[]
  /** 本次新写入绑定的任务 id（空→值）。 */
  bound?: string[]
  /** 已同值绑定（含写阶段竞态同值幂等命中）的任务 id。 */
  unchanged?: string[]
}

/**
 * 激活即绑定（I2 裁决）：把 outcomeId 绑到根任务并一次性向下传播既有全部子卡
 * （task_links 图遍历，多级含孙卡；幽灵链接＝链接在而卡行缺席→跳过，不是「既有子卡」）。
 *
 * 两段式（迁移与绑定同成败、失败不留半绑态）：
 *   1) 预检（零写入）：逐卡读 tasks.outcome_id——同值=幂等面、空=待写、
 *      异值=立即 outcome_conflict 返回（此时库面零改动，激活侧无须回滚）；
 *   2) 写阶段：bindOutcomeToTask 三态契约逐卡写（空→值＋outcome_bound 审计事件）；
 *      预检后仍可能因磁盘/竞态失败——各写幂等，重试自愈。
 *
 * 排序纪律（对裁决「迁移成功后绑定」的工程化收窄）：本函数被控制器安排在
 * status_changed 事件落账**之前**调用——若绑定置于事件之后，绑定失败留下悬账事件，
 * eventId 重放撕裂自愈会不经绑定直接补完迁移（部分绑定→假 observing 绕过）；
 * 绑定在前时，残余（绑定已写、事件写失败）是「绑定指向 draft 合同」的良性瞬态，
 * 同值幂等重试自愈、不假放行任何面。
 */
export function bindOutcomeFamily(
  outcomeId: string,
  rootTaskId: string,
  opts: KanbanResolutionOptions = {},
): ActivationBindResult {
  if (!nonEmpty(outcomeId) || !nonEmpty(rootTaskId)) {
    return { ok: false, code: 'root_task_missing', problems: ['outcomeId/rootTaskId 必填'] }
  }
  const root = rootTaskId.trim()
  const boards = allBoardDbsOf(homeOf(opts), { skipUnderscored: true })
  if (boards.length === 0) {
    return { ok: false, code: 'db_unavailable', problems: ['hermes home 下无看板库（激活绑定无从落位）'] }
  }
  for (const { slug, dbPath } of boards) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) return { ok: false, code: 'db_unavailable', problems: ['node:sqlite 不可用或库无法打开'] }
      const rootRow = db.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(root) as
        | { outcome_id?: unknown }
        | undefined
      if (!rootRow) continue // 该板无根卡：fail-soft 试下一板

      // 图遍历（BFS，同板作用域——kernel decompose 子卡与父卡同板同事务落库）
      const ids: string[] = [root]
      const seen = new Set(ids)
      for (let i = 0; i < ids.length; i++) {
        let children: Array<{ child_id?: unknown }>
        try {
          children = db.prepare('SELECT child_id FROM task_links WHERE parent_id = ?').all(ids[i]) as Array<{ child_id?: unknown }>
        } catch (err) {
          return {
            ok: false,
            code: 'db_unavailable',
            problems: [`板 ${slug} task_links 不可读（无法证明传播面完备，fail-closed）：${describeErr(err)}`],
          }
        }
        for (const c of children) {
          const cid = c?.child_id
          if (typeof cid === 'string' && cid && !seen.has(cid)) {
            seen.add(cid)
            ids.push(cid)
          }
        }
      }

      // 预检（零写入）：异值在写前全量拦截
      const toBind: string[] = []
      const unchanged: string[] = []
      const conflicts: string[] = []
      for (const id of ids) {
        const row = db.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(id) as
          | { outcome_id?: unknown }
          | undefined
        if (!row) {
          console.warn(`[kanban-resolution] 传播面跳过幽灵链接（卡行缺席）：${id}`)
          continue
        }
        const cur = normalize(row.outcome_id)
        if (cur === outcomeId) unchanged.push(id)
        else if (cur === null) toBind.push(id)
        else conflicts.push(`任务 ${id} 已挂靠 ${cur}；改挂须显式迁移事件（spec §3.3.1），激活中止且库面零改动`)
      }
      if (conflicts.length) return { ok: false, code: 'outcome_conflict', problems: conflicts }

      // 写阶段：三态契约逐卡写（同值幂等、空→值、异值拒——预检后仅竞态可触发）
      const bound: string[] = []
      for (const id of toBind) {
        const r = bindOutcomeToTask(id, outcomeId, opts.home ? { home: opts.home } : {})
        if (!r.ok) {
          const code: ActivationBindCode =
            r.code === 'outcome_rebind_forbidden' ? 'outcome_conflict'
              : r.code === 'db_unavailable' ? 'db_unavailable'
                : 'write_failed'
          return {
            ok: false,
            code,
            problems: [`任务 ${id} 绑定写失败（${r.code ?? 'write_failed'}）：${r.error ?? ''}（已写卡幂等，重试自愈）`],
          }
        }
        if (r.unchanged) unchanged.push(id) // 预检后竞态同值：按幂等面计
        else bound.push(id)
      }
      return { ok: true, bound, unchanged }
    } catch (err) {
      // 批四 T2（走查 F3）：缺列是全库结构性错误（805 迁移面未覆盖），试下一板无意义且
      // 最终误报「根任务不存在」——专用码定向指引。
      if (/no such column:\s*outcome_id/i.test(describeErr(err))) {
        return {
          ok: false,
          code: 'schema_missing',
          problems: [`板 ${slug} tasks 表缺 outcome_id 列（805 迁移面未覆盖该库；建库/迁移走 python CLI 或补列后重试）`],
        }
      }
      console.warn(`[kanban-resolution] 读板 ${slug} 失败（fail-soft 试下一板）：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return { ok: false, code: 'root_task_missing', problems: [`根任务 ${root} 在各看板库中不存在`] }
}

// ---------- 派发门（column.dispatch 接线面） ----------

/** 门错误码（REST 422）：outcome_not_active=终态合同拒派；
 *  outcome_context_unavailable=快照关键源失败/落账失败拒派。 */
export type OutcomeDispatchErrorCode = 'outcome_not_active' | 'outcome_context_unavailable'

/** 结果解析门载体（DispatchReadinessError 同形态：REST 侧按 name+code 映射 422）。 */
export class OutcomeDispatchError extends Error {
  constructor(
    public readonly code: OutcomeDispatchErrorCode,
    message: string,
    public readonly problems: string[] = [],
  ) {
    super(message)
    this.name = 'OutcomeDispatchError'
  }
}

/** 派发结果三元组（ColumnDispatchResult.outcome 透出面）。 */
export interface DispatchOutcomeContext {
  outcomeId: string
  contractVersion: number
  snapshotId: string
}

/** 快照落账 actor（服务端通道标识；pending-controller actorOf 同命名空间惯例）。 */
export const DISPATCH_OUTCOME_ACTOR = 'studio:column-dispatch'

/**
 * 派发结果门（任务简报逐字）：taskId 反查 outcome——
 *   无合同 → null（dispatch 原行为）；
 *   cancelled/settled → 抛 OutcomeDispatchError('outcome_not_active')；
 *   active/draft/observing → 生成最小快照（Task 6；people 经 agentidentity 名册、
 *     任务摘要经同库只读、政策版本=决策矩阵内容摘要常量）＋appendSnapshot 落账
 *     ＋bindOutcomeToTask 幂等补绑定（防御激活后未绑定窗口），返回三元组。
 * 快照构建关键源失败或落账失败 → 抛 OutcomeDispatchError('outcome_context_unavailable')；
 * 补绑定失败 fail-soft warn 不阻断派发——守卫经 findByRootTask 兜底不失明，
 * 绑定可由下次派发/激活侧重试修复。
 */
export async function resolveDispatchOutcome(
  taskId: string,
  opts: KanbanResolutionOptions = {},
): Promise<DispatchOutcomeContext | null> {
  const contract = outcomeOfTask(taskId, opts)
  if (!contract) return null
  if (contract.status === 'cancelled' || contract.status === 'settled') {
    throw new OutcomeDispatchError(
      'outcome_not_active',
      `任务 ${taskId} 挂靠的结果合同 ${contract.outcomeId} 已${contract.status === 'cancelled' ? '取消' : '结算'}（终态），不得派单`,
      [`outcome ${contract.outcomeId} status=${contract.status}（终态合同禁派，spec §3.3.2）`],
    )
  }
  const summary = rootTaskSummary(taskId, opts)
  // 批二 T5：经验召回总闸（EXPERIENCE_INJECT）——关=0 时快照无经验块（双闸纪律：
  // 注入总闸管召回，learningOptIn 只管写入侧候选生成）。经验选择复用 exp-inject
  // 的 selectableExperiences＋scope-match（approved 且作用域匹配才入选，不复制）。
  const experienceGateOn = process.env.EXPERIENCE_INJECT === '1'
  const built = await buildFullSnapshot({
    contract,
    decisionPolicyVersion: DEFAULT_DECISION_POLICY_VERSION,
    resolve: {
      task: () => (summary ? { ok: true, task: summary } : { ok: false }),
      people: (ids: string[]) => ({ ok: true, people: snapshotPeopleRows(ids) }),
      // 全景面（同步只读三面：证据/评审/计划——批二最小面，评测/图运行/泳道后续批接入）
      panorama: () => {
        const evidence = listEvidence(taskId)
        const verdict = latestVerdict(taskId)
        return {
          ok: true,
          faces: [
            { face: 'evidence', count: evidence.length, note: verdict ? `latest=${verdict.verdict}` : undefined },
            { face: 'reviews', count: listCases().filter((c) => c.taskId === taskId).length },
            { face: 'plans', count: listRequested().filter((p) => p.taskId === taskId).length },
          ],
        }
      },
      // 近期决策（semantica 桥异步；桥不可达→块降级 excluded，非关键）
      decisions: async () => {
        const r = await listDecisions(10)
        return {
          ok: true,
          decisions: r.decisions.map((d) => ({
            id: String(d.id), category: d.category ?? null, outcome: d.outcome ?? null,
            at: Number((d as unknown as { at?: unknown }).at) || 0,
          })),
        }
      },
      // 在册前提（active/open 态；statement 物化前过脱敏防线）
      premises: () => ({
        ok: true,
        premises: listPremises()
          .filter((p) => p.status === 'hold' || p.status === 'pending')
          .slice(0, 20)
          .map((p) => ({ id: p.id, statement: p.statement })),
      }),
      ...(experienceGateOn ? {
        experiences: () => {
          const selected = selectableExperiences(listCandidates(), {
            ...(opts.experienceScope?.column ? { column: opts.experienceScope.column } : {}),
          })
          return {
            ok: true,
            experiences: selected.map((c) => ({ id: c.id, statement: c.statement, updatedAt: c.updatedAt })),
          }
        },
      } : {}),
    },
  })
  if (!built.ok) {
    throw new OutcomeDispatchError(
      'outcome_context_unavailable',
      `任务 ${taskId} 的派单上下文关键源失败（合同 ${contract.outcomeId}），禁止派单`,
      built.problems,
    )
  }
  const appended = appendSnapshot(built.snapshot, DISPATCH_OUTCOME_ACTOR)
  if (!appended.ok || !appended.snapshot) {
    throw new OutcomeDispatchError(
      'outcome_context_unavailable',
      `任务 ${taskId} 的派单快照落账失败（合同 ${contract.outcomeId}）：${appended.code ?? 'write_failed'}`,
      [`appendSnapshot code=${appended.code ?? 'write_failed'}（快照是派单授权语境正身，落不了账=语境不可用）`],
    )
  }
  const bound = bindOutcomeToTask(taskId.trim(), contract.outcomeId, opts.home ? { home: opts.home } : {})
  if (!bound.ok) {
    console.warn(
      `[kanban-resolution] 补绑定失败（不阻断派发，守卫经台账兜底不失明）：${bound.code ?? ''} ${bound.error ?? ''}`,
    )
  }
  // 批二 T5 召回留痕：快照含经验块时把「哪些候选进了哪个快照」落 injectionLog
  // （留痕可反查：snapshot.approvedExperienceVersions ⊇ 被注入候选指纹；fail-soft）。
  const injectedIds = appended.snapshot.approvedExperienceVersions.map((f) => f.split('@')[0])
  if (injectedIds.length) {
    try {
      recordInjection(injectedIds, `dispatch:${appended.snapshot.snapshotId.slice(0, 12)}`, appended.snapshot.snapshotId)
    } catch (err) {
      console.warn(`[kanban-resolution] 召回留痕落账失败（不阻断派发）：${(err as Error).message}`)
    }
  }
  return {
    outcomeId: contract.outcomeId,
    contractVersion: contract.version,
    snapshotId: appended.snapshot.snapshotId,
  }
}
