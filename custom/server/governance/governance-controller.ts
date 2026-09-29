/**
 * 治理中心 REST（/api/governance/*）——补功能主清单（2026-09-28 审计文档 §六）。
 *
 * GET  /api/governance/overview        六闸卡 + 治理工件清单（git 真仓实查）
 * GET  /api/governance/doc?kind=<k>    单件工件 markdown 全文（含 commit 锚点）
 *
 * 数据源（全部真实，不臆造）：
 *   - 治理工件：研发仓 git（GOVERNANCE_REPO，默认 aipaydev 推演仓）origin/main
 *     上的冻结/概设/排期/测试报告/验收/审计/复盘文档——commit 号与提交时间
 *     经 git log 实查，markdown 经 git show 实取。
 *   - G3 分支证据：origin/feat/DEV-* 引用实查（git for-each-ref）。
 *   - 评审待裁决：复用 review/review-store（listReviews verdict 未落者）。
 *
 * 仓根由 GOVERNANCE_REPO 注入；不传时回落 aipaydev 推演仓默认路径（本地
 * 演示形态）。仓不存在/文档缺失如实返回 exists:false，不编造内容。
 *
 * 挂载：patch 490 在 bootstrap/routes.ts（与 477/482/488 同款两行）。
 */
import Router from '@koa/router'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { listReviews } from '../review/review-store'
import { registerDomainAudit } from './domain-audit'
import { queryApprovalLog } from '../approvals/approval-log'
import { loadCapabilityLedger, loadMetricsDefs, deriveLedgerStats, loadActionContracts, loadStateModel } from './governance-ledger'
import { queryImpact } from './governance-impact'
import { collectAssigneeStats, collectSquadStats, deriveUsage, computeSloReport, costSummary, dispatchStats, collectQgateRuns } from './governance-analytics'
import { auditLog } from './governance-audit'
import { readDispatchLedger } from './dispatch-ledger'

const router = new Router({ prefix: '/api/governance' })

/** 治理工件登记表：kind → 仓内路径 + 界面标题 + 所属闸。单一事实源（client 只消费）。 */
export const GOVERNANCE_DOCS: ReadonlyArray<{ kind: string; path: string; title: string; gate: string; group: string; ref?: string }> = [
  // 六闸工件（治理门禁对象）
  { kind: 'freeze', path: 'docs/requirements/RFD-001.freeze.md', title: 'G1 需求冻结', gate: 'G1', group: 'gate' },
  { kind: 'design', path: 'docs/design/RFD-001-architecture-design.md', title: '概要设计（G2 评审对象）', gate: 'G2', group: 'gate' },
  { kind: 'schedule', path: 'docs/plan/RFD-001-schedule.md', title: '开发/测试排期', gate: 'G2', group: 'gate' },
  { kind: 'test', path: 'docs/test/RFD-001-test-report.md', title: 'G4 测试报告', gate: 'G4', group: 'gate' },
  { kind: 'release', path: 'RELEASE.md', title: 'G5 发布说明', gate: 'G5', group: 'gate' },
  { kind: 'uat', path: 'docs/acceptance/RFD-001-acceptance.md', title: 'UAT 业务验收', gate: 'G5', group: 'gate' },
  { kind: 'audit', path: 'docs/retro/default-audit-opinion.md', title: '合规审计意见书', gate: 'G6', group: 'gate' },
  { kind: 'retro', path: 'docs/retro/default-RFD-001-retrospective.md', title: 'G6 复盘报告', gate: 'G6', group: 'gate' },
  // 管理档案（编制/应用/组织——推演报告步骤 1/5/6 的产品承载）
  { kind: 'roster', path: 'docs/admin/roster.md', title: '账号清单（15 人编制）', gate: '', group: 'admin' },
  { kind: 'app-registry', path: 'docs/admin/app-registry.md', title: '应用资产登记表', gate: '', group: 'admin' },
  { kind: 'org', path: 'docs/admin/org.md', title: '组织与权限矩阵', gate: '', group: 'admin' },
  // 分析档案（系统分析产物——步骤 11/13 的产品承载）
  { kind: 'tasklist', path: 'docs/analysis/RFD-001-tasklist.md', title: 'SMART 任务清单（T-101~108）', gate: '', group: 'analysis' },
  { kind: 'an-paycore', path: 'docs/analysis/AN-PAYCORE-analysis.md', title: '系分 · AN-PAYCORE 支付核心', gate: '', group: 'analysis' },
  { kind: 'an-chwx', path: 'docs/analysis/AN-CHWX-analysis.md', title: '系分 · AN-CHWX 微信渠道', gate: '', group: 'analysis' },
  { kind: 'an-chali', path: 'docs/analysis/AN-CHALI-analysis.md', title: '系分 · AN-CHALI 支付宝渠道', gate: '', group: 'analysis' },
  { kind: 'an-mp', path: 'docs/analysis/AN-MP-analysis.md', title: '系分 · AN-MP 收银台前端', gate: '', group: 'analysis' },
  // 测试证据（G3 分支内工件——ref 指向开发分支）
  { kind: 'testlog-paycore', path: 'docs/evidence/DEV-PAYCORE-testlog.txt', title: 'G3 证据 · DEV-PAYCORE（vitest 52/52）', gate: 'G3', group: 'evidence', ref: 'origin/feat/DEV-PAYCORE' },
  { kind: 'testlog-chwx', path: 'docs/evidence/DEV-CHWX-testlog.txt', title: 'G3 证据 · DEV-CHWX（vitest 25/25）', gate: 'G3', group: 'evidence', ref: 'origin/feat/DEV-CHWX' },
  { kind: 'testlog-chali', path: 'docs/evidence/DEV-CHALI-testlog.txt', title: 'G3 证据 · DEV-CHALI（vitest 54/54）', gate: 'G3', group: 'evidence', ref: 'origin/feat/DEV-CHALI' },
  { kind: 'testlog-mp', path: 'docs/evidence/DEV-MP-testlog.txt', title: 'G3 证据 · DEV-MP（17 例+220 检查）', gate: 'G3', group: 'evidence', ref: 'origin/feat/DEV-MP' },
]

function repoRoot(): string {
  return process.env.GOVERNANCE_REPO || '/Volumes/nvme2230/lab/ncwk-sim-mux/central/aipaydev'
}

/** git 全异步（execFile + timeout）：koa handler 内禁同步子进程——execFileSync
 * 一旦在对象库锁上等待会阻塞整个 server 事件循环（2026-09-28 实锤：profiles
 * 等全部 API 跟着超时、前端挂载卡死空屏）。 */
function git(args: string[]): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    execFile('git', ['-C', repoRoot(), ...args], {
      encoding: 'utf8',
      timeout: 8000,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout) => { if (err) rejectP(err); else resolveP(stdout) })
  })
}

function repoReady(): boolean {
  const root = repoRoot()
  return existsSync(resolve(root, '.git'))
}

/** 单件工件元数据：commit/时间一次合并取（缺失如实 exists:false；行数由 /doc 惰性算，
 *  overview 不为行数拉全文——20 件工件 × 全文 show 会把聚合拖到秒级）。 */
async function docMeta(entry: typeof GOVERNANCE_DOCS[number]) {
  const empty = { ...entry, exists: false, commit: null as string | null, committedAt: null as string | null, lines: 0 }
  if (!repoReady()) return empty
  try {
    const ref = entry.ref || 'origin/main'
    const out = (await git(['log', '-1', '--format=%h %cI', ref, '--', entry.path])).trim()
    if (!out) return empty
    const [commit, ...rest] = out.split(' ')
    return { ...entry, exists: true, commit, committedAt: rest.join(' '), lines: 0 }
  } catch {
    return empty
  }
}

/** G3 编码门禁分支证据：origin/feat/DEV-* 引用实查。 */
async function devBranches(): Promise<Array<{ ref: string; commit: string; updatedAt: string }>> {
  if (!repoReady()) return []
  try {
    const out = await git(['for-each-ref', '--format=%(refname:short) %(objectname:short) %(committerdate:iso8601)', 'refs/remotes/origin/feat/DEV-*'])
    return out.trim().split('\n').filter(Boolean).map((line) => {
      const [ref, commit, ...rest] = line.split(' ')
      return { ref, commit, updatedAt: rest.join(' ') }
    })
  } catch {
    return []
  }
}

router.get('/overview', async (ctx) => {
  const docs = await Promise.all(GOVERNANCE_DOCS.map(docMeta))
  let pendingReviews = 0
  try {
    pendingReviews = listReviews().filter((r) => !r.verdict).length
  } catch { /* 评审域不可用时如实为 0 */ }
  ctx.body = {
    ok: true,
    repo: repoRoot(),
    repoReady: repoReady(),
    docs,
    devBranches: await devBranches(),
    pendingReviews,
  }
})

router.get('/doc', async (ctx) => {
  const kind = String(ctx.query.kind ?? '')
  const entry = GOVERNANCE_DOCS.find((d) => d.kind === kind)
  if (!entry) {
    ctx.status = 404
    ctx.body = { ok: false, error: `unknown kind: ${kind}` }
    return
  }
  const meta = await docMeta(entry)
  if (!meta.exists) {
    ctx.status = 404
    ctx.body = { ok: false, error: `doc not in repo: ${entry.path}` }
    return
  }
  ctx.body = {
    ok: true,
    kind: entry.kind,
    title: entry.title,
    gate: entry.gate,
    commit: meta.commit,
    committedAt: meta.committedAt,
    markdown: await git(['show', `${entry.ref || 'origin/main'}:${entry.path}`]),
  }
})

/** 工件全文读取（domain-audit 检查器复用；缺失返回 null）。 */
async function docText(path: string, ref = 'origin/main'): Promise<string | null> {
  if (!repoReady()) return null
  try {
    return await git(['show', `${ref}:${path}`])
  } catch {
    return null
  }
}

registerDomainAudit({
  repoRoot,
  git,
  repoReady,
  docText,
  approvalHistoryCount: () => { try { return queryApprovalLog(500).length } catch { return 0 } },
  router,
})

// ---- 4A 治理层只读投影（spec 2026-09-29 §3.4；单一事实源 runtime/governance/*.yaml）----

router.get('/ledger', async (ctx) => {
  const res = loadCapabilityLedger()
  if (!res.exists) {
    ctx.status = 404
    ctx.body = { ok: false, exists: false, error: 'capability-ledger.yaml 未找到（runtime/governance/）' }
    return
  }
  ctx.body = {
    ok: true,
    exists: true,
    path: res.path,
    problems: res.problems,
    doc: res.doc,
    stats: res.doc ? deriveLedgerStats(res.doc) : null,
  }
})

router.get('/metrics-defs', async (ctx) => {
  const res = loadMetricsDefs()
  if (!res.exists) {
    ctx.status = 404
    ctx.body = { ok: false, exists: false, error: 'metrics.yaml 未找到（runtime/governance/）' }
    return
  }
  ctx.body = { ok: true, exists: true, path: res.path, problems: res.problems, doc: res.doc }
})

// ---- 4A 治理层运行态投影（第二期 ②③④⑥；只读实取，诚实降级不编造）----

router.get('/usage', async (ctx) => {
  const res = loadCapabilityLedger()
  if (!res.exists || !res.doc) {
    ctx.status = 404
    ctx.body = { ok: false, error: 'capability-ledger.yaml 未找到' }
    return
  }
  const [assigneeStats, squadStats] = [await collectAssigneeStats(), collectSquadStats()]
  const dispatchEntries = readDispatchLedger()
  const report = deriveUsage(res.doc, assigneeStats, squadStats, { dispatchEntries })
  ctx.body = {
    ok: true,
    ...report,
    // 第三期：dispatch.successRate 本地实况（引擎派发台账）+ gate.passRate 实况（qgate runs 扫描）
    dispatchStats: dispatchStats(dispatchEntries),
    gateStats: collectQgateRuns(),
  }
})

router.get('/slo', async (ctx) => {
  const ledgerRes = loadCapabilityLedger()
  if (!ledgerRes.exists || !ledgerRes.doc) {
    ctx.status = 404
    ctx.body = { ok: false, error: 'capability-ledger.yaml 未找到' }
    return
  }
  const metricsRes = loadMetricsDefs()
  const assigneeStats = await collectAssigneeStats()
  const report = computeSloReport(ledgerRes.doc, metricsRes.doc ?? null, assigneeStats)
  ctx.body = { ok: true, budgetMode: process.env.GOVERNANCE_SLO_BUDGET || 'warn', ...report }
})

router.get('/cost-summary', async (ctx) => {
  const days = Math.min(Math.max(Number(ctx.query.days) || 30, 1), 365)
  const ledgerRes = loadCapabilityLedger()
  const summary = await costSummary(days, undefined, ledgerRes.doc)
  ctx.body = { ok: true, ...summary }
})

router.get('/audit-log', async (ctx) => {
  const sources = String(ctx.query.sources ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const q = String(ctx.query.q ?? '')
  const limit = Number(ctx.query.limit) || 200
  const result = await auditLog({ sources, q, limit })
  ctx.body = result
})

router.get('/contracts', async (ctx) => {
  const res = loadActionContracts()
  if (!res.exists) {
    ctx.status = 404
    ctx.body = { ok: false, exists: false, error: 'action-contracts.yaml 未找到（runtime/governance/）' }
    return
  }
  ctx.body = { ok: true, exists: true, path: res.path, problems: res.problems, doc: res.doc }
})

// ---- 4A 治理层第五期：状态-事件本体投影 + 反向影响查询 ----

router.get('/state-model', async (ctx) => {
  const res = loadStateModel()
  if (!res.exists) {
    ctx.status = 404
    ctx.body = { ok: false, exists: false, error: 'state-model.yaml 未找到（runtime/governance/）' }
    return
  }
  ctx.body = { ok: true, exists: true, path: res.path, problems: res.problems, doc: res.doc }
})

router.get('/impact', async (ctx) => {
  const target = String(ctx.query.target ?? '').trim()
  if (!target) {
    ctx.status = 400
    ctx.body = { ok: false, error: 'target 必填（形如 unit.<id> / contract.<id> / metric.<id> / verdicts / sloTargets / state-model）' }
    return
  }
  ctx.body = { ok: true, ...queryImpact(target) }
})

export const governanceRoutes = router
