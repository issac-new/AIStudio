// overlay/custom/server/services/hermes/kanban-task-fast.ts
// 任务详情 sqlite 直读快道（2026-10-31 IDE 回归未了项清偿）。
//
// 背景：getTask 走 hermes CLI 子进程（`kanban show --json`），单次 spawn
// 4-6s；页面首载并发几十个 CLI 读在 exec 队列（并发 6）排队，队列超时
// → 500 → 看板抽屉「加载任务失败」（IDE 回归走查 4 次 2 次实锤）。
// overview 已有 sqlite 直读先例（kanban-overview.ts，同一存储同一 rows）。
//
// 本模块按上游 CLI 的拼装逻辑 1:1 复刻 `kanban show --json` 输出形状：
//   task（_TASK_DICT_FIELDS 28 字段，skills 恒数组/raci dict|null/epoch int|null）
//   latest_summary（task_runs 最新非空 summary）
//   parents/children（task_links 按 id 排序）
//   comments（author/body/created_at，created_at ASC）
//   events（kind/payload(JSON 解析)/created_at/run_id，created_at ASC, id ASC）
//   runs（show 字段子集，started_at ASC, id ASC）
// 映射源锚点（钉版 0.22.5）：
//   hermes_cli/kanban.py show → _print_json(...)（:515-522）
//   hermes_cli/kanban_output.py _TASK_DICT_FIELDS（:16-25）+ _task_to_dict（:85）
//   hermes_cli/kanban_db.py Task.from_row（:804）/ Event.from_row（:929）/
//   Run.from_row（:867）/ latest_summary（:4431）/ _linked_ids（:1802）/
//   list_comments（:1876）/ list_events（:2007）/ list_runs（:4395）
//
// 契约：任何异常（库缺失/表缺失/node:sqlite 不可用）返回 null，调用方回落
// CLI 老路径——fail-soft，不猜数。只读打开、用完即关（与 task-workspace-cache
// 同款）。板号缺省（undefined）不查（CLI 的跨板搜索无法廉价复刻，交回 CLI）。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { hermesHome } from '../../lib/paths'
import { validateResultEnvelope, type ResultEnvelope } from '../../result-contract/result-contract'

// 双运行时取 node:sqlite：服务端 ts-node（CJS）与 vitest（ESM）都走 createRequire
// 解内置模块（路径实参对内置模块无意义，任意占位即可）；解不出=快道关闭。
const nodeRequire: NodeRequire | null = (() => {
  try { return createRequire('/index.js') } catch { return null }
})()

export interface KanbanTaskFastDetail {
  task: Record<string, unknown>
  latest_summary: string | null
  parents: string[]
  children: string[]
  comments: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  runs: Array<Record<string, unknown>>
  /**
   * W2 结果协议读侧投影（2026-11-04）：从 latest run metadata/completion_receipt/
   * artifacts 派生的 ResultEnvelope + 校验结论；源不足以成形（无 summary）时为
   * null（fail-soft，不猜）。派生为纯函数 deriveResultContract（独立可测）。
   */
  resultContract?: { envelope: ResultEnvelope; validation: { ok: boolean; problems: Array<{ path: string; rule: string; detail: string }> } } | null
}

// _TASK_DICT_FIELDS（kanban_output.py:16-25）——顺序即 CLI 输出顺序
const TASK_DICT_FIELDS = [
  'id', 'title', 'body', 'assignee', 'status', 'priority', 'tenant',
  'workspace_kind', 'workspace_path', 'branch_name', 'project_id',
  'created_by', 'created_at', 'started_at', 'completed_at', 'result',
  'skills', 'max_runtime_seconds', 'max_retries', 'model_override', 'provider_override',
  'reasoning_effort',
  'raci',
  'session_id', 'workflow_template_id', 'current_step_key', 'completion_contract', 'last_failure_error',
] as const

// _SHOW_RUN_FIELDS（kanban_output.py:26-31）——show 视图投影
const SHOW_RUN_FIELDS = ['id', 'profile', 'step_key', 'status', 'outcome', 'summary', 'error', 'metadata', 'worker_pid', 'started_at', 'ended_at'] as const

type Db = {
  prepare: (sql: string) => { get: (...p: unknown[]) => unknown; all: (...p: unknown[]) => unknown[] }
  close: () => void
}

/** node:sqlite 按需加载（createRequire 双运行时同源）；不可用返回 null。 */
function openReadOnly(dbPath: string): Db | null {
  try {
    if (!nodeRequire) return null
    const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string, o: { readOnly: boolean }) => Db }
    return new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return null
  }
}

function jsonOr(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null
  try { return JSON.parse(value) } catch { return null }
}

function epochOr(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

/** _lossy_text 同义（kanban_db.py:40）：bytes→str（U+FFFD 替换）、其余类型透传
 *  ——整数保持整数（worker_pid 等 INTEGER 列 CLI 原样输出，String() 会错型）。 */
function lossyText(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Uint8Array) return new TextDecoder('utf-8', { fatal: false }).decode(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 板库路径解析（与 kanban-overview fast 布局兼容）：分板库优先，default 板
 *  兼容旧根级布局（<home>/kanban/kanban.db）。返回存在的路径或 null。 */export function boardDbPath(board: string, home = hermesHome()): string | null {
  const slug = board.trim()
  if (!slug) return null
  const candidates = slug === 'default'
    ? [join(home, 'kanban', 'boards', 'default', 'kanban.db'), join(home, 'kanban', 'kanban.db')]
    : [join(home, 'kanban', 'boards', slug, 'kanban.db')]
  return candidates.find(p => existsSync(p)) ?? null
}

/**
 * W2 结果协议读侧投影（纯函数）：从任务详情派生 ResultEnvelope。
 * 源映射——summary←latest_summary|task.result；claims/evidence←最新 run 的
 * completion_receipt（criteria[].evidence {kind,path,sha256}→可定位引用）；
 * artifactRefs←metadata.artifacts；generatorVersion←profile+workflow_template_id。
 * 源不足以成形（无 summary 或无 run）返回 null——不猜数。
 */
export function deriveResultContract(detail: {
  task: Record<string, unknown>
  latest_summary: string | null
  runs: Array<Record<string, unknown>>
}): { envelope: ResultEnvelope; validation: ReturnType<typeof validateResultEnvelope> } | null {
  const summary = detail.latest_summary ?? (typeof detail.task.result === 'string' && detail.task.result.trim() ? detail.task.result : null)
  if (!summary) return null
  const latestRun = [...detail.runs].reverse().find(r => isPlainObject(r.metadata)) ?? null
  const meta = isPlainObject(latestRun?.metadata) ? (latestRun!.metadata as Record<string, unknown>) : null
  const receipt = meta && isPlainObject(meta.completion_receipt) ? (meta.completion_receipt as Record<string, unknown>) : null

  const claims = receipt && Array.isArray(receipt.criteria)
    ? (receipt.criteria as Array<Record<string, unknown>>).map((c, i) => ({
        id: String(c.id ?? `criterion-${i}`),
        statement: String(c.note ?? c.status ?? `criterion ${i}`),
        evidence: (Array.isArray(c.evidence) ? (c.evidence as Array<Record<string, unknown>>) : [])
          .filter(e => typeof e.path === 'string' && e.path)
          .map(e => ({
            sourceId: String(e.path),
            locator: { kind: 'path' as const, value: String(e.path) },
            role: 'supports' as const,
          })),
      }))
    : undefined

  const evidence = receipt && Array.isArray(receipt.artifacts)
    ? (receipt.artifacts as Array<Record<string, unknown>>)
        .filter(a => typeof a.path === 'string' && a.path)
        .map(a => ({
          sourceId: String(a.path),
          locator: { kind: 'path' as const, value: String(a.path) },
          role: 'context' as const,
        }))
    : undefined

  const artifactRefs = meta && Array.isArray(meta.artifacts)
    ? (meta.artifacts as unknown[]).filter((a): a is string => typeof a === 'string' && a.length > 0)
        .map(a => ({ kind: 'file' as const, ref: a }))
    : undefined

  const lastEnded = latestRun && typeof latestRun.ended_at === 'number' ? latestRun.ended_at : null
  const profile = latestRun && typeof latestRun.profile === 'string' ? latestRun.profile : ''
  const workflow = typeof detail.task.workflow_template_id === 'string' && detail.task.workflow_template_id ? detail.task.workflow_template_id : 'kanban'

  const envelope: ResultEnvelope = {
    resultVersion: 1,
    generatedAt: new Date(lastEnded ?? Date.now()).toISOString(),
    generatorVersion: [workflow, profile].filter(Boolean).join('@') || 'kanban',
    summary: String(summary).slice(0, 500),
    ...(claims?.length ? { claims } : {}),
    ...(evidence?.length ? { evidence } : {}),
    ...(artifactRefs?.length ? { artifactRefs } : {}),
  }
  return { envelope, validation: validateResultEnvelope(envelope) }
}

/**
 * 任务详情直读。命中返回与 `hermes kanban show --json` 同形状的对象；
 * 未命中/任何异常返回 null（调用方回落 CLI）。board 为 undefined 时不查。
 */
export function readTaskDetailFast(taskId: string, board?: string, home?: string): KanbanTaskFastDetail | null {
  const id = taskId?.trim()
  if (!id || !board?.trim()) return null
  const root = home ?? hermesHome() ?? join(homedir(), '.hermes')
  const dbPath = boardDbPath(board, root)
  if (!dbPath) return null
  let db: Db | null = null
  try {
    db = openReadOnly(dbPath)
    if (!db) return null
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return null

    // task：28 字段按序；skills/raci JSON 列语义（Task.from_row:806-809）
    const task: Record<string, unknown> = {}
    for (const col of TASK_DICT_FIELDS) {
      if (col === 'skills') {
        const parsed = jsonOr(row.skills)
        task.skills = Array.isArray(parsed) ? parsed.filter(s => s !== null && s !== undefined && s !== '') : []
        continue
      }
      if (col === 'raci') {
        const parsed = jsonOr(row.raci)
        task.raci = isPlainObject(parsed) ? parsed : null
        continue
      }
      const raw = row[col]
      if (col === 'created_at' || col === 'started_at' || col === 'completed_at') {
        task[col] = epochOr(raw)
      } else {
        task[col] = lossyText(raw)
      }
    }

    // latest_summary（kanban_db.py:4431）
    const summaryRow = db.prepare(
      "SELECT summary FROM task_runs WHERE task_id = ? AND summary IS NOT NULL AND summary != '' "
      + 'ORDER BY COALESCE(ended_at, started_at) DESC, id DESC LIMIT 1',
    ).get(id) as { summary?: string } | undefined

    // parents/children（_linked_ids:1802，ORDER BY 目标列）
    const parents = (db.prepare('SELECT parent_id FROM task_links WHERE child_id = ? ORDER BY parent_id').all(id) as Array<{ parent_id: string }>).map(r => r.parent_id)
    const children = (db.prepare('SELECT child_id FROM task_links WHERE parent_id = ? ORDER BY child_id').all(id) as Array<{ child_id: string }>).map(r => r.child_id)

    // comments（list_comments:1876：created_at ASC；CLI JSON 只带三字段）
    const comments = (db.prepare('SELECT author, body, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at ASC').all(id) as Array<Record<string, unknown>>)
      .map(c => ({ author: lossyText(c.author), body: lossyText(c.body), created_at: epochOr(c.created_at) }))

    // events（list_events:2007：created_at ASC, id ASC；payload JSON 解析 Event.from_row:934）
    const events = (db.prepare('SELECT kind, payload, created_at, run_id FROM task_events WHERE task_id = ? ORDER BY created_at ASC, id ASC').all(id) as Array<Record<string, unknown>>)
      .map(e => {
        const payload = jsonOr(e.payload)
        const runId = epochOr(e.run_id)
        return {
          kind: lossyText(e.kind),
          payload: isPlainObject(payload) ? payload : null,
          created_at: epochOr(e.created_at) ?? 0,
          run_id: runId,
        }
      })

    // runs（list_runs:4395：started_at ASC, id ASC；metadata JSON Run.from_row:877）
    const runs = (db.prepare('SELECT * FROM task_runs WHERE task_id = ? ORDER BY started_at ASC, id ASC').all(id) as Array<Record<string, unknown>>)
      .map(r => {
        const out: Record<string, unknown> = {}
        for (const col of SHOW_RUN_FIELDS) {
          if (col === 'id') { out.id = epochOr(r.id) ?? 0; continue }
          if (col === 'metadata') {
            const parsed = jsonOr(r.metadata)
            out.metadata = isPlainObject(parsed) ? parsed : null
            continue
          }
          if (col === 'started_at' || col === 'ended_at') { out[col] = epochOr(r[col]); continue }
          out[col] = lossyText(r[col])
        }
        return out
      })

    const assembled = {
      task,
      latest_summary: summaryRow?.summary ?? null,
      parents,
      children,
      comments,
      events,
      runs,
    }
    // W2：结果协议投影（fail-soft——派生异常不影响快道主形状）
    let resultContract: KanbanTaskFastDetail['resultContract'] = null
    try {
      resultContract = deriveResultContract(assembled)
    } catch { resultContract = null }
    return { ...assembled, resultContract }
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}
