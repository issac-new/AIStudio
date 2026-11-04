// custom/server/execution-records/controller.ts
// 执行记录查询域 REST（AgentTeams 吸收批二）。
//
// 端点（prefix /api/execution-records，全部只读）：
//   GET /                     双源归并列表：中央 JSONL 索引（readExecutionRecords）
//                             × delegate 任务工作区扫描（scanDelegateRecords），
//                             runId 去重中央优先；过滤 ?kind=&agent=&task=&outcome=
//                             （agent 匹配 agentId 或 cli；task 匹配 taskId）；
//                             ?limit=（缺省 50，clamp 1..200）?offset= 分页。
//   GET /delegate/:taskId     delegate 详情：workspace 解析 → delegate-result.json
//                             + delegate-log.txt 尾读 + 该任务最新 delegate 记录；
//                             ?board= 指定板（缺省跨板解析）。解析不到 → unavailable。
//   GET /coding/:sessionId    coding 详情：webui 库 sessions/run_usage/
//                             workspace_run_changes 三表摘要 + 中央索引里该会话
//                             最新记录；库缺/表缺/坏 → unavailable（fail-soft）。
//
// 权限：与 harness 端点同档（登录即可，无 admin 门）——挂载走 bootstrap routes.ts
// 全局 authMiddleware 链（735 补丁，同 731 projectworkflow 形态），本文件不自建
// 鉴权。响应形状一律走 lib/http ok/fail/unavailable。
import Router from '@koa/router'
import type { Context } from 'koa'
import { fail, ok, unavailable } from '../lib/http'
import { readExecutionRecords, type ExecutionRecord } from './record'
import { readDelegateDetail, scanDelegateRecords } from './delegate-scan'
import { readCodingDetail } from './coding-detail'

const router = new Router({ prefix: '/api/execution-records' })

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** 单值 query 取串（koa query 可能是数组——取首值不猜）。 */
function q(ctx: Context, key: string): string {
  const v = (ctx.query as Record<string, unknown>)[key]
  return typeof v === 'string' ? v.trim() : Array.isArray(v) && typeof v[0] === 'string' ? v[0].trim() : ''
}

function intQuery(ctx: Context, key: string): number | null {
  const raw = q(ctx, key)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** 归并：中央索引优先（同 runId 中央版本胜——它是权威写口），delegate 扫描补盲
 *  （中央不落的启动前拒绝/跨机记录）。输出 startedAt 倒序。 */
export function mergedExecutionRecords(): ExecutionRecord[] {
  const byRun = new Map<string, ExecutionRecord>()
  for (const rec of scanDelegateRecords()) byRun.set(rec.runId, rec)
  for (const rec of readExecutionRecords()) byRun.set(rec.runId, rec) // 中央后写=覆盖
  const all = [...byRun.values()]
  all.sort((a, b) => b.startedAt - a.startedAt)
  return all
}

/** GET /：归并 → 四维过滤 → 分页。 */
export async function listExecutionRecords(ctx: Context): Promise<void> {
  const kind = q(ctx, 'kind')
  const agent = q(ctx, 'agent')
  const task = q(ctx, 'task')
  const outcome = q(ctx, 'outcome')
  if (kind && kind !== 'coding-run' && kind !== 'delegate') {
    fail(ctx, 400, `未知 kind：${kind}（合法值 coding-run|delegate）`, { code: 'invalid_kind' })
    return
  }
  if (outcome && !['success', 'failed', 'timeout', 'blocked'].includes(outcome)) {
    fail(ctx, 400, `未知 outcome：${outcome}（合法值 success|failed|timeout|blocked）`, { code: 'invalid_outcome' })
    return
  }
  const limit = Math.min(Math.max(intQuery(ctx, 'limit') ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const offset = Math.max(intQuery(ctx, 'offset') ?? 0, 0)

  const filtered = mergedExecutionRecords().filter((r) => {
    if (kind && r.kind !== kind) return false
    if (agent && r.agentId !== agent && r.cli !== agent) return false
    if (task && r.taskId !== task) return false
    if (outcome && r.outcome !== outcome) return false
    return true
  })
  const records = filtered.slice(offset, offset + limit)
  ok(ctx, {
    records,
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + records.length < filtered.length,
  })
}

/** GET /delegate/:taskId：详情 + 最新记录；解析不到/未物化 → unavailable。 */
export async function getDelegateDetail(ctx: Context): Promise<void> {
  const taskId = String(ctx.params.taskId ?? '').trim()
  if (!taskId) { fail(ctx, 400, '缺少 taskId', { code: 'missing_task_id' }); return }
  const board = q(ctx, 'board') || undefined
  const detail = readDelegateDetail(taskId, board)
  if (!detail) {
    unavailable(ctx, `任务工作区解析不到：task=${taskId}${board ? ` board=${board}` : ''}`)
    return
  }
  if (!detail.materialized) {
    unavailable(ctx, `任务工作区未物化（未派发落地或已回收）：${detail.workspace}`)
    return
  }
  // 该任务最新 delegate 记录（跨板：记录自身带 board 字段）
  const record = scanDelegateRecords().find((r) => r.taskId === taskId) ?? null
  ok(ctx, {
    record,
    result: detail.result,
    logTail: detail.logTail,
    logBytes: detail.logBytes,
    workspace: detail.workspace,
    board: detail.board,
  })
}

/** GET /coding/:sessionId：webui 三表摘要 + 中央索引最新记录。 */
export async function getCodingDetail(ctx: Context): Promise<void> {
  const sessionId = String(ctx.params.sessionId ?? '').trim()
  if (!sessionId) { fail(ctx, 400, '缺少 sessionId', { code: 'missing_session_id' }); return }
  const detail = readCodingDetail(sessionId)
  // 显式 === false 判别（strict false 下 !available 不做字面量收窄）
  if (detail.available === false) {
    unavailable(ctx, detail.note)
    return
  }
  const record = readExecutionRecords().find((r) => r.sessionId === sessionId) ?? null
  ok(ctx, { record, session: detail.session, usage: detail.usage, changes: detail.changes })
}

router.get('/', listExecutionRecords)
router.get('/delegate/:taskId', getDelegateDetail)
router.get('/coding/:sessionId', getCodingDetail)

export { router as executionRecordsRoutes }
export default router
