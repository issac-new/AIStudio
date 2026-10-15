/**
 * 组织回路控制器（PR-5+PR-6，V8.29 治理轮）——闸修复状态机 + 受控合并流水线。
 *
 * PR-5 闸死锁处置通道：闸 FAIL→派修→复审→PASS 的状态机进产品（持久 JSON 台账，
 * <home>/runtime/orgloop-gate-repairs.json）。run20 G2 悬置 75 分钟+人工回滚 7 组
 * 闸键的根治面：闸 FAIL 的唯一出口=登记修复单并跟踪到复审 PASS，状态可查、悬置
 * 可见——拆闸式解锁从此有产品内正路。
 *   POST /api/hermes/orgloop/gate-repair { gate, fail_evidence, missing[] }
 *   POST /api/hermes/orgloop/gate-repair/:id/transition { to: repair_dispatched|re_review|pass|waived, note }
 *   GET  /api/hermes/orgloop/gate-repairs?status=open
 *
 * PR-6 合并流水线端点：受控合并执行面（POST /api/hermes/orgloop/merge-run）——
 * 参数=分支集/目标/策略；执行=git merge --no-ff 带 precheck（目标存在+禁强推）
 * 与日志留痕；fail-closed：ORGLOOP_REPO_ROOT 未配置即 503（生产不开 env 即关）。
 * V8.30 职责归位后驱动/导演不再代做合并——本端点是兜底通道的产品化正身。
 *
 * 挂载：B 类 patch 636（bootstrap/routes.ts，同 631 模式）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const router = new Router({ prefix: '/api/hermes/orgloop' })

// ── PR-5：闸修复状态机 ──
const STATES = ['fail_registered', 'repair_dispatched', 're_review', 'pass', 'waived'] as const
type GateState = typeof STATES[number]
interface GateRepair { id: string; gate: string; state: GateState; ts: string; fail_evidence: string; missing: string[]; history: Array<{ ts: string; from: string; to: string; note: string }> }

function storeFile(): string {
  const home = process.env.HERMES_WEB_UI_HOME || process.env.HOME || '.'
  const dir = resolve(home, 'runtime')
  return resolve(dir, 'orgloop-gate-repairs.json')
}
function loadAll(): GateRepair[] {
  const f = storeFile()
  if (!existsSync(f)) return []
  try { return JSON.parse(readFileSync(f, 'utf-8')) as GateRepair[] } catch { return [] }
}
function persist(all: GateRepair[]): void {
  const f = storeFile()
  mkdirSync(resolve(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(all, null, 1), 'utf-8')
}

/** 状态迁移合法性（纯函数，测试面）：fail_registered→repair_dispatched→re_review→pass；
 * 任意态→waived（用户豁免）；pass/waived 为终态。 */
export function canTransition(from: GateState, to: GateState): boolean {
  if (from === 'pass' || from === 'waived') return false
  if (to === 'waived') return true
  const order: GateState[] = ['fail_registered', 'repair_dispatched', 're_review', 'pass']
  return order.indexOf(to) === order.indexOf(from) + 1
}

router.post('/gate-repair', (ctx: Context) => {
  const b = ctx.request.body as { gate?: unknown; fail_evidence?: unknown; missing?: unknown } | undefined
  const gate = typeof b?.gate === 'string' && /^(G[1-6]|UAT)$/i.test(b.gate) ? b.gate.toUpperCase() : ''
  if (!gate) { ctx.status = 400; ctx.body = { error: 'gate ∈ G1-G6|UAT' }; return }
  const rec: GateRepair = {
    id: `gr-${Date.now().toString(36)}`, gate, state: 'fail_registered', ts: new Date().toISOString(),
    fail_evidence: typeof b?.fail_evidence === 'string' ? b.fail_evidence.slice(0, 500) : '',
    missing: Array.isArray(b?.missing) ? (b!.missing as unknown[]).filter(m => typeof m === 'string').slice(0, 50) as string[] : [],
    history: [],
  }
  const all = loadAll(); all.push(rec); persist(all)
  ctx.body = rec
})

router.post('/gate-repair/:id/transition', (ctx: Context) => {
  const id = String(ctx.params.id)
  const b = ctx.request.body as { to?: unknown; note?: unknown } | undefined
  const to = String(b?.to ?? '') as GateState
  if (!(STATES as readonly string[]).includes(to)) { ctx.status = 400; ctx.body = { error: `to ∈ ${STATES.join('|')}` }; return }
  const all = loadAll()
  const rec = all.find(r => r.id === id)
  if (!rec) { ctx.status = 404; ctx.body = { error: 'repair record not found' }; return }
  if (!canTransition(rec.state, to)) { ctx.status = 409; ctx.body = { error: `illegal transition ${rec.state}→${to}` }; return }
  rec.history.push({ ts: new Date().toISOString(), from: rec.state, to, note: String(b?.note ?? '').slice(0, 300) })
  rec.state = to
  persist(all)
  ctx.body = rec
})

router.get('/gate-repairs', (ctx: Context) => {
  const status = String(ctx.query.status ?? 'all')
  const all = loadAll()
  ctx.body = { count: all.length,
    records: status === 'all' ? all : all.filter(r => r.state === status),
    open: all.filter(r => r.state !== 'pass' && r.state !== 'waived').length }
})

// ── PR-6：受控合并流水线 ──
function repoRoot(): string | null {
  const r = process.env.ORGLOOP_REPO_ROOT
  return r && existsSync(r) ? r : null
}

router.post('/merge-run', (ctx: Context) => {
  const root = repoRoot()
  if (!root) { ctx.status = 503; ctx.body = { error: 'orgloop merge 未配置（ORGLOOP_REPO_ROOT 缺席=fail-closed）' }; return }
  const b = ctx.request.body as { branches?: unknown; target?: unknown } | undefined
  const branches = Array.isArray(b?.branches) ? (b!.branches as unknown[]).filter(x => /^[A-Za-z0-9._\/-]{1,120}$/.test(String(x))).map(String) : []
  const target = typeof b?.target === 'string' && /^[A-Za-z0-9._\/-]{1,120}$/.test(b.target) ? b.target : ''
  if (branches.length === 0 || !target) { ctx.status = 400; ctx.body = { error: 'branches[] 与 target 必填（受控字符集）' }; return }
  const git = (args: string[]): string => execFileSync('git', ['-C', root, ...args], { encoding: 'utf-8', timeout: 120_000 })
  const log: string[] = []
  try {
    git(['fetch', 'origin'])
    // precheck：目标在远端在位（不造新基线）；禁强推由推送方式保证（普通 push）
    git(['rev-parse', '--verify', `origin/${target}`])
    git(['checkout', '-q', '-B', target, `origin/${target}`])
    const merged: string[] = [], skipped: string[] = []
    for (const br of branches) {
      if (git(['rev-parse', '--verify', `origin/${br}`]).trim()) {
        git(['merge', '--no-ff', `origin/${br}`, '-m', `merge: ${br} into ${target} (orgloop pipeline PR-6)`])
        merged.push(br); log.push(`merged ${br}`)
      } else { skipped.push(br); log.push(`skip ${br} (absent on origin)`) }
    }
    git(['push', '-q', 'origin', target])
    ctx.body = { ok: true, target, merged, skipped, log }
  } catch (exc) {
    try { git(['merge', '--abort']) } catch { /* nothing to abort */ }
    ctx.status = 500
    ctx.body = { ok: false, target, log, error: (exc as Error).message.slice(0, 300) }
  }
})

export { router as orgloopRouter }
