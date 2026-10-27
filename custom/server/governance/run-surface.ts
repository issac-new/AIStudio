/**
 * run 级治理面 REST（融合批三）——挂 /api/governance/run/*（governance-controller
 * 装配）。判定与聚合单一正本：指标=run-metrics.ts、工作台账=本文件（work_report_gen
 * 口径移植）、审计检查=本文件（audit_check 口径移植，中央仓经 governance git 通道）。
 * simharness 侧对应函数降级为渲染壳（数字/判定取本 DTO）。
 *
 * 端点：
 *   GET  /run/:run/metrics?rfd=      治理指标 DTO（三态/证据率/密度/告警族/CSV 行/基线/趋势）
 *   POST /run/:run/work-report       工作台账 DTO（按人×状态/WIP/stale/零交付——编制映射由导演传）
 *   GET  /run/:run/audit-check?rfd=  合规审计检查（门禁留痕/台账格式/交付物对账）
 */
import type Router from '@koa/router'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isValidRun, safeRunDir, simRootOrNull } from '../simcenter/observer-root'
import { computeRunMetrics, loadRunMetricsInput } from './run-metrics'

export interface RunSurfaceDeps {
  repoReady: () => boolean
  docText: (path: string, ref?: string) => Promise<string | null>
}

function queryDb(dbPath: string, fn: (db: any) => unknown): unknown {
  let db: any = null
  try {
    const { DatabaseSync } = require('node:sqlite')
    db = new DatabaseSync(dbPath, { readOnly: true })
    return fn(db)
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

// ── 工作台账（work_report_gen 口径移植：WIP>2 / 72h stale / 零交付 commit= 锚）──

export interface WorkReportAccountRow {
  user: string
  todo: number
  running: number
  review: number
  done: number
  other: number
  stale: number
  wipOver: boolean
  zeroDeliver: number
  missingBoards: string[]
}

export interface WorkReportDto {
  rows: WorkReportAccountRow[]
  wipWarn: boolean
  zeroDeliverTotal: number
}

function boardStats(dbPath: string): { statuses: Record<string, number>; stale: number; zeroDeliver: number } | null {
  if (!existsSync(dbPath)) return null
  const rows = queryDb(dbPath, (db) => db.prepare('select status, count(*) n from tasks group by status').all()) as Array<{ status: string; n: number }> | null
  if (!rows) return null
  const statuses: Record<string, number> = {}
  for (const r of rows) statuses[String(r.status || 'unknown')] = Number(r.n || 0)
  const stale = Number(queryDb(dbPath, (db) => db.prepare(
    "select count(*) n from tasks where status not in ('done','archived') and ifnull(created_at,0) < strftime('%s','now') - 259200",
  ).get()?.n ?? 0))
  const zeroDeliver = Number(queryDb(dbPath, (db) => db.prepare(
    "select count(*) n from tasks where status='done' and ifnull(body,'') not like '%commit=%'",
  ).get()?.n ?? 0))
  return { statuses, stale, zeroDeliver }
}

export function computeWorkReport(
  kanbanBoardsDir: string,
  accounts: Array<{ user: string; boards: string[] }>,
): WorkReportDto {
  const rows: WorkReportAccountRow[] = []
  let wipWarn = false
  let zeroDeliverTotal = 0
  for (const { user, boards } of accounts) {
    const row: WorkReportAccountRow = {
      user, todo: 0, running: 0, review: 0, done: 0, other: 0, stale: 0, wipOver: false, zeroDeliver: 0, missingBoards: [],
    }
    for (const slug of boards) {
      const st = boardStats(join(kanbanBoardsDir, slug, 'kanban.db'))
      if (!st) { row.missingBoards.push(slug); continue }
      row.todo += st.statuses.todo ?? 0
      row.running += st.statuses.running ?? 0
      row.review += st.statuses.review ?? 0
      row.done += st.statuses.done ?? 0
      for (const [k, v] of Object.entries(st.statuses)) {
        if (!['todo', 'running', 'review', 'done'].includes(k)) row.other += v
      }
      row.stale += st.stale
      row.zeroDeliver += st.zeroDeliver
    }
    if (row.running > 2) { row.wipOver = true; wipWarn = true }
    zeroDeliverTotal += row.zeroDeliver
    rows.push(row)
  }
  return { rows, wipWarn, zeroDeliverTotal }
}

// ── 审计检查（audit_check 口径移植：门禁留痕/台账格式/取证目录/交付物对账）──

export interface AuditCheckResult {
  verdict: 'pass' | 'defects'
  findings: string[]
}

export async function runAuditCheck(deps: RunSurfaceDeps, args: {
  issuesLog: string
  evidenceDirExists: boolean
  freezeInRepo: boolean
  releaseDone: boolean
  rfd: string
}): Promise<AuditCheckResult> {
  const findings: string[] = []
  // 门禁留痕：state 硬闸键已落的必须有对应仓内凭证（freeze 由调用侧判定传入）
  if (!args.freezeInRepo) findings.push('G1 已落键但 freeze 文件不在 origin/main')
  // 问题单台账格式完整（ISSUE|类型|主体|描述 四段；无台账≠缺陷——修假阳性）
  for (const ln of args.issuesLog.split('\n')) {
    if (ln.startsWith('ISSUE|') && ln.split('|').length < 4) { findings.push('issues.log 存在字段缺失条目'); break }
  }
  if (!args.evidenceDirExists) findings.push('取证目录缺失')
  // 交付物对账（run8 复盘根治：在册交付物缺件必须进台账；release 已在册才查）
  if (args.releaseDone && args.rfd) {
    if (!(await deps.docText('docs/delivery/merchant-onboarding-v1.0.0-cashier.md'))) {
      findings.push('REL-DELIVER 交付物缺件：docs/delivery/merchant-onboarding-v1.0.0-cashier.md 不在 origin/main')
    }
    if (!(await deps.docText(`docs/delivery/${args.rfd}-completeness-check.md`))) {
      findings.push(`完备性检查缺件：docs/delivery/${args.rfd}-completeness-check.md 不在 origin/main`)
    }
  }
  return { verdict: findings.length === 0 ? 'pass' : 'defects', findings }
}

// ── REST ──

export function registerRunSurfaceRoutes(router: Router, deps: RunSurfaceDeps): void {
  router.get('/run/:run/metrics', (ctx) => {
    const run = String(ctx.params.run ?? '')
    const rfd = String(ctx.query.rfd ?? '')
    if (!isValidRun(run)) { ctx.status = 400; ctx.body = { ok: false, error: 'run 参数非法' }; return }
    const root = simRootOrNull()
    if (!root) { ctx.status = 503; ctx.body = { ok: false, error: 'SIM_ROOT 未配置（fail-closed）' }; return }
    const input = loadRunMetricsInput(root, run, rfd)
    if (!input) { ctx.status = 404; ctx.body = { ok: false, error: `run ${run} 不存在` }; return }
    ctx.body = { ok: true, ...computeRunMetrics(input) }
  })

  router.post('/run/:run/work-report', (ctx) => {
    const run = String(ctx.params.run ?? '')
    if (!isValidRun(run)) { ctx.status = 400; ctx.body = { ok: false, error: 'run 参数非法' }; return }
    const root = simRootOrNull()
    if (!root) { ctx.status = 503; ctx.body = { ok: false, error: 'SIM_ROOT 未配置（fail-closed）' }; return }
    const b = ctx.request.body as { accounts?: unknown } | undefined
    if (!Array.isArray(b?.accounts) || b.accounts.length === 0) {
      ctx.status = 400
      ctx.body = { ok: false, error: 'accounts 必填（[{user, boards:[slug...]}]，编制映射由导演侧传入）' }
      return
    }
    const accounts = (b!.accounts as Array<Record<string, unknown>>).map((a) => ({
      user: String(a.user ?? ''),
      boards: Array.isArray(a.boards) ? (a.boards as unknown[]).map(String) : [],
    })).filter((a) => a.user && a.boards.length > 0)
    if (accounts.length === 0) { ctx.status = 400; ctx.body = { ok: false, error: 'accounts 条目须含 user 与非空 boards' }; return }
    ctx.body = { ok: true, ...computeWorkReport(resolve(root, 'hermes', 'kanban', 'boards'), accounts) }
  })

  router.get('/run/:run/audit-check', async (ctx) => {
    const run = String(ctx.params.run ?? '')
    const rfd = String(ctx.query.rfd ?? '')
    if (!isValidRun(run)) { ctx.status = 400; ctx.body = { ok: false, error: 'run 参数非法' }; return }
    const root = simRootOrNull()
    if (!root) { ctx.status = 503; ctx.body = { ok: false, error: 'SIM_ROOT 未配置（fail-closed）' }; return }
    const runDir = safeRunDir(root, run)
    if (!runDir || !existsSync(runDir)) { ctx.status = 404; ctx.body = { ok: false, error: `run ${run} 不存在` }; return }
    const issuesPath = [resolve(runDir, 'evidence', 'issues.log'), resolve(runDir, 'issues.log')].find(existsSync)
    const issuesLog = issuesPath ? readFileSync(issuesPath, 'utf8') : ''
    const stateText = existsSync(resolve(runDir, 'state.env')) ? readFileSync(resolve(runDir, 'state.env'), 'utf8') : ''
    const releaseDone = /^release_done=/m.test(stateText)
    const freezeInRepo = deps.repoReady()
      ? !!(await deps.docText(rfd ? `docs/requirements/${rfd}.freeze.md` : 'docs/requirements/RFD-001.freeze.md'))
      : false
    ctx.body = {
      ok: true,
      ...await runAuditCheck(deps, {
        issuesLog,
        evidenceDirExists: existsSync(resolve(runDir, 'evidence')),
        freezeInRepo,
        releaseDone,
        rfd,
      }),
    }
  })
}
