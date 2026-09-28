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

const router = new Router({ prefix: '/api/governance' })

/** 治理工件登记表：kind → 仓内路径 + 界面标题 + 所属闸。单一事实源（client 只消费）。 */
export const GOVERNANCE_DOCS: ReadonlyArray<{ kind: string; path: string; title: string; gate: string }> = [
  { kind: 'freeze', path: 'docs/requirements/RFD-001.freeze.md', title: 'G1 需求冻结', gate: 'G1' },
  { kind: 'design', path: 'docs/design/RFD-001-architecture-design.md', title: '概要设计（G2 评审对象）', gate: 'G2' },
  { kind: 'schedule', path: 'docs/plan/RFD-001-schedule.md', title: '开发/测试排期', gate: 'G2' },
  { kind: 'test', path: 'docs/test/RFD-001-test-report.md', title: 'G4 测试报告', gate: 'G4' },
  { kind: 'release', path: 'RELEASE.md', title: 'G5 发布说明', gate: 'G5' },
  { kind: 'uat', path: 'docs/acceptance/RFD-001-acceptance.md', title: 'UAT 业务验收', gate: 'G5' },
  { kind: 'audit', path: 'docs/retro/default-audit-opinion.md', title: '合规审计意见书', gate: 'G6' },
  { kind: 'retro', path: 'docs/retro/default-RFD-001-retrospective.md', title: 'G6 复盘报告', gate: 'G6' },
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

/** 单件工件元数据：commit/时间/行数（缺失如实 exists:false）。 */
async function docMeta(entry: typeof GOVERNANCE_DOCS[number]) {
  if (!repoReady()) return { ...entry, exists: false, commit: null as string | null, committedAt: null as string | null, lines: 0 }
  try {
    const commit = (await git(['log', '-1', '--format=%h', 'origin/main', '--', entry.path])).trim()
    if (!commit) return { ...entry, exists: false, commit: null, committedAt: null, lines: 0 }
    const committedAt = (await git(['log', '-1', '--format=%cI', 'origin/main', '--', entry.path])).trim()
    const content = await git(['show', `origin/main:${entry.path}`])
    return { ...entry, exists: true, commit, committedAt, lines: content.split('\n').length }
  } catch {
    return { ...entry, exists: false, commit: null, committedAt: null, lines: 0 }
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
    markdown: await git(['show', `origin/main:${entry.path}`]),
  }
})

export const governanceRoutes = router
