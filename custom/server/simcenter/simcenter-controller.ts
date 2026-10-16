/**
 * 推演中心控制器族（三中心重构·波 1 服务端契约先行件，X1）——11 端点，前缀 /api/hermes/sim。
 *
 * 定位：推演中心六签的只读/聚合数据面。合并铁律=正身不复制——run-state 解析语义
 * 正身在 observability（631），派发器健康正身在 hermes-agent（634），休眠工作者探针
 * 正身在 hermes-agent（635），本族只做透传/只读/聚合/唯一一次实现的新语义（分支
 * 新鲜度三态）。契约正本=《2026-10-16-sim-center-detailed-design.md》数据契约汇总表。
 *
 * 端点清单（数据源｜铁律）：
 *   GET  /run-state?run=        observability 纯函数透传（同 state.env/TSV）｜正身 631
 *   GET  /journal?run=&tail=    runs/<run>/workflow-journal.ndjson 尾部 N 行｜只读
 *   GET  /topology              四服务 /health 探测（SIM_TOPOLOGY_ENDPOINTS 可覆盖）｜探测代理
 *   GET  /dispatcher-health     SIM_DISPATCHER_HEALTH_CLI 包一层（timeout 10s/1MB）｜正身 634
 *   GET  /sleeping-workers      SIM_SLEEPING_WORKERS_CLI 同上模式｜正身 635
 *   GET  /deliverables?run=     evidence/ 13 类交付物核对（§2.7 清单，宽松匹配）｜聚合
 *   GET  /branches?run=         git for-each-ref+rev-parse 比对+新鲜度三态｜branch_fresh 唯一实现
 *   GET  /anchor?id=            四类锚反查（$/commit/t_/!）｜聚合
 *   GET  /trace?run=            冻结单 AC+测试报告+验收书判词四列｜聚合，缺席如实 null
 *   POST /evidence/mark         本族唯一写端点：evidence/message-marks.jsonl append｜强校验+穿越防护
 *   GET  /issues?run=           issues.log（run 根或 evidence/ 两处）ISSUE/DISP 解析｜只读聚合
 *
 * 配置（env，单一配置源）：OBS_SIM_ROOT（与 631 同一 env；缺席=503 fail-closed——
 * 生产不开 env 即关，不读任意磁盘路径）；SIM_TOPOLOGY_ENDPOINTS/SIM_DISPATCHER_HEALTH_CLI/
 * SIM_SLEEPING_WORKERS_CLI/SIM_BRANCHES_REPO/SIM_BRANCH_GRACE_MS/SIM_ANCHOR_REPO/SIM_KANBAN_API
 * 为各端点专用门（缺席按各端点 fail-closed/fail-soft 语义处理）。
 * run 参数一律 /^[A-Za-z0-9_.-]{1,64}$/（该字符集仍放行 '..'——路径穿越由
 * safeRunDir 的 resolve+startsWith 二道闸拦）；外部子进程/fetch 全带超时与体积上限，
 * 错误摘要截断 ≤200 字符不外泄整段 stderr。
 * 挂载：B 类 patch 638（bootstrap/routes.ts，同 631/636 模式）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { gateKeys, ledgerSummary, parseStateEnv, stepKeys } from '../observability/observability-controller'

const execFileP = promisify(execFile)
const router = new Router({ prefix: '/api/hermes/sim' })

/** 子进程统一上限：10s 超时、1MB 输出体积。 */
const CLI_EXEC_OPTS = { timeout: 10_000, maxBuffer: 1_048_576, encoding: 'utf-8' } as const
/** 错误摘要上限（红线：不整段外泄 stderr）。 */
const ERR_CLIP = 200

function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

// ── 通用门与守卫（导出纯函数，测试面） ──

/** run 参数字符集校验（纯函数）：631 同款 /^[A-Za-z0-9_.-]{1,64}$/。 */
export function isValidRun(run: string): boolean {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(run)
}

/** 路径穿越二道闸（纯函数）：字符集放行的 '..'/'.' 在 resolve 后逃出 runs/ 基座
 * 即拒（startsWith(base+sep) 且不等于基座）。返回安全 run 目录或 null。 */
export function safeRunDir(root: string, run: string): string | null {
  if (!isValidRun(run)) return null
  const base = resolve(root, 'runs')
  const dir = resolve(base, run)
  if (dir === base || !dir.startsWith(base + sep)) return null
  return dir
}

/** SIM 根（fail-closed 门）：OBS_SIM_ROOT 缺席或不存在→null（调用方回 503）。 */
export function simRootOrNull(): string | null {
  const root = process.env.OBS_SIM_ROOT
  return root && existsSync(root) ? root : null
}

/** 503 fail-closed 统一回包（631 同款断言面：响应体带提示）。 */
function gateClosed(ctx: Context): void {
  ctx.status = 503
  ctx.body = { error: 'simcenter 未配置（OBS_SIM_ROOT 缺席=fail-closed）' }
}

/** fetch 带超时（AbortController；超时/网络错误按 fail-soft 抛出由调用方收口）。 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ac.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── 1. run-state：observability（631）透传，正身不复制 ──
router.get('/run-state', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const stateFile = resolve(runDir, 'state.env')
  if (!existsSync(stateFile)) { ctx.status = 404; ctx.body = { error: `run ${run} 的 state.env 不存在` }; return }
  // 解析语义正身=observability 纯函数（631），此处仅组包，输出同构。
  const state = parseStateEnv(readFileSync(stateFile, 'utf-8'))
  const ledgerFile = resolve(runDir, 'evidence', 'compensation-ledger.tsv')
  const ledger = existsSync(ledgerFile)
    ? ledgerSummary(readFileSync(ledgerFile, 'utf-8'))
    : { total: 0, open: 0, byType: {} }
  ctx.body = {
    run,
    posture: state.posture || 'standard',
    gates: gateKeys(state),
    steps: stepKeys(state),
    ledger,
    source: { stateFile, ledgerFile, ledgerPresent: existsSync(ledgerFile) },
  }
})

// ── 2. journal：workflow-journal.ndjson 尾部只读 ──

/** journal 尾部解析（纯函数）：取末尾 tail 个非空行，坏 JSON 行跳过并计数。 */
export function parseJournalTail(content: string, tail: number): { lines: Array<Record<string, unknown>>; skipped: number } {
  const raw = content.split('\n').filter(l => l.trim() !== '')
  const slice = raw.slice(-Math.max(1, Math.min(tail, 1000)))
  const lines: Array<Record<string, unknown>> = []
  let skipped = 0
  for (const ln of slice) {
    try { lines.push(JSON.parse(ln) as Record<string, unknown>) } catch { skipped++ }
  }
  return { lines, skipped }
}

router.get('/journal', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const tailRaw = String(ctx.query.tail ?? '50')
  const tail = Number(tailRaw)
  if (!Number.isInteger(tail) || tail < 1 || tail > 1000) { ctx.status = 400; ctx.body = { error: 'tail 非法（1-1000 整数）' }; return }
  const file = resolve(runDir, 'workflow-journal.ndjson')
  if (!existsSync(file)) { ctx.status = 404; ctx.body = { error: `run ${run} 的 workflow-journal.ndjson 不存在` }; return }
  const { lines, skipped } = parseJournalTail(readFileSync(file, 'utf-8'), tail)
  ctx.body = { run, tail, count: lines.length, skippedBadLines: skipped, lines, source: file }
})

// ── 3. topology：四服务 /health 探测代理（前端跨域收口） ──

/** 四服务默认端点（设计签 3：gateway:8801/studio:8802/synapse:8008/hindsight:8888）。 */
export const DEFAULT_TOPOLOGY_ENDPOINTS: Record<string, string> = {
  gateway: 'http://127.0.0.1:8801',
  studio: 'http://127.0.0.1:8802',
  synapse: 'http://127.0.0.1:8008',
  hindsight: 'http://127.0.0.1:8888',
}

/** SIM_TOPOLOGY_ENDPOINTS 解析（纯函数）：逗号分隔 name=url，仅覆盖四个已知名；
 * 畸形条目（名未知/非 http(s)/含空白）跳过不报错。 */
export function parseTopologyEndpoints(env: string | undefined): Record<string, string> {
  const out = { ...DEFAULT_TOPOLOGY_ENDPOINTS }
  if (!env) return out
  for (const part of env.split(',')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const name = part.slice(0, eq).trim()
    const url = part.slice(eq + 1).trim()
    if (!(name in out)) continue
    if (!/^https?:\/\/\S+$/.test(url)) continue
    out[name] = url.replace(/\/+$/, '')
  }
  return out
}

router.get('/topology', async (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const endpoints = parseTopologyEndpoints(process.env.SIM_TOPOLOGY_ENDPOINTS)
  const services: Record<string, Record<string, unknown>> = {}
  await Promise.all(Object.entries(endpoints).map(async ([name, base]) => {
    const t0 = Date.now()
    try {
      const res = await fetchWithTimeout(`${base}/health`, 1500)
      services[name] = res.ok
        ? { ok: true, status: res.status, latency_ms: Date.now() - t0 }
        : { ok: false, status: res.status, latency_ms: Date.now() - t0, error: `HTTP ${res.status}` }
    } catch (exc) {
      // 逐服务 fail-soft：不可达=ok:false+错误摘要，不拖垮整表。
      services[name] = { ok: false, latency_ms: Date.now() - t0, error: clip((exc as Error).message, ERR_CLIP) }
    }
  }))
  ctx.body = { services, checkedAt: new Date().toISOString() }
})

// ── 4/5. dispatcher-health 与 sleeping-workers：hermes-agent CLI 包一层 ──

/** 健康类 CLI 执行（634/635 正身在 hermes-agent）：成功 stdout 优先按 JSON 解析，
 * 失败 ok:false+stderr 摘要（≤200 字，不外泄整段）。 */
async function runHealthCli(cliPath: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const { stdout } = await execFileP(cliPath, [], CLI_EXEC_OPTS)
    const text = stdout.trim()
    try {
      return { ok: true, data: JSON.parse(text) as unknown }
    } catch {
      return { ok: true, data: { raw: clip(text, 2000) } }
    }
  } catch (exc) {
    const err = exc as { stderr?: string; message?: string }
    return { ok: false, error: clip(String(err.stderr || err.message || 'cli failed'), ERR_CLIP) }
  }
}

/** 634/635 两端点的同构门：族门 OBS_SIM_ROOT + 专用 CLI env，均缺席 503 fail-closed。 */
async function healthCliEndpoint(ctx: Context, envKey: string, label: string): Promise<void> {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const cli = process.env[envKey]
  if (!cli) {
    ctx.status = 503
    ctx.body = { error: `${label} 未配置（${envKey} 缺席=fail-closed；正身在 hermes-agent）` }
    return
  }
  ctx.body = await runHealthCli(cli)
}

router.get('/dispatcher-health', async (ctx: Context) => {
  await healthCliEndpoint(ctx, 'SIM_DISPATCHER_HEALTH_CLI', 'dispatcher-health')
})

router.get('/sleeping-workers', async (ctx: Context) => {
  await healthCliEndpoint(ctx, 'SIM_SLEEPING_WORKERS_CLI', 'sleeping-workers')
})

// ── 6. deliverables：13 类交付物核对（§2.7 清单，宽松匹配） ──

/** 13 类交付物文件名宽松匹配规则（唯一实现）。清单=方案正本 §2.7 交付物体系
 * （冻结单→资产表→组织矩阵→任务清单→系分稿→概设→排期→测试报告→发布件→
 * 验收书→台账→审计书→复盘）；evidence/ 实际落盘名不受模板路径约束，故按
 * 中英文关键词宽松匹配，命中即 present。 */
export interface DeliverablePattern { key: string; label: string; pattern: RegExp }
export const DELIVERABLE_PATTERNS: DeliverablePattern[] = [
  { key: 'freeze', label: '冻结单', pattern: /冻结|freeze/i },
  { key: 'app-registry', label: '资产表', pattern: /资产表|app-?registry/i },
  { key: 'org-matrix', label: '组织矩阵', pattern: /组织矩阵|组织权限|org-?matrix|org\.md/i },
  { key: 'tasks', label: '任务清单', pattern: /任务清单|task-?list/i },
  { key: 'analysis', label: '系分稿', pattern: /系分|analysis|\/an-|^an-/i },
  { key: 'design', label: '概设', pattern: /概设|概要设计|design/i },
  { key: 'schedule', label: '排期', pattern: /排期|sched/i },
  { key: 'test-report', label: '测试报告', pattern: /测试报告|test-?report/i },
  { key: 'release', label: '发布件', pattern: /发布(计划|说明|件)?|release/i },
  { key: 'acceptance', label: '验收书', pattern: /验收|acceptance/i },
  { key: 'work-report', label: '台账', pattern: /工作台账|台账|work-?report/i },
  { key: 'audit', label: '审计书', pattern: /审计|audit/i },
  { key: 'retrospective', label: '复盘', pattern: /复盘|retro/i },
  // 第 14 件：完备性检查（2026-10-16 勘误 13→14，方案 §1.3 文档链 L230）
  { key: 'completeness', label: '完备性检查', pattern: /完备性|completeness/i },
]

/** 交付物匹配（纯函数）：对 evidence/ 文件名列表逐一匹配 14 类，每类出
 * name/label/status(present|absent)/file 锚（多命中取字典序首个，确定性）。 */
export function matchDeliverables(files: string[]): Array<{ name: string; label: string; status: 'present' | 'absent'; file: string | null }> {
  const sorted = [...files].sort()
  return DELIVERABLE_PATTERNS.map(({ key, label, pattern }) => {
    const hit = sorted.find(f => pattern.test(f)) ?? null
    return { name: key, label, status: hit ? ('present' as const) : ('absent' as const), file: hit }
  })
}

router.get('/deliverables', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const evidDir = resolve(runDir, 'evidence')
  let files: string[] = []
  if (existsSync(evidDir)) {
    files = readdirSync(evidDir, { withFileTypes: true })
      .filter(d => d.isFile())
      .map(d => d.name)
      .slice(0, 2000) // 目录体积上限，防超大全量列举
  }
  ctx.body = { run, deliverables: matchDeliverables(files), scanned: files.length }
})

// ── 7. branches：feat 分支清单+新鲜度三态（branch_fresh 语义唯一实现） ──

/** 宽限窗解析（纯函数）：SIM_BRANCH_GRACE_MS 正整数生效，缺席/非法回落 1h。 */
export function parseGraceMs(env: string | undefined): number {
  const n = Number(env)
  return Number.isInteger(n) && n > 0 ? n : 3_600_000
}

/**
 * 分支新鲜度三态（唯一实现，纯函数，测试面）：
 * - old：最近活动（本地提交与远端推送取较新）已出宽限窗→旧残留；
 * - stale（宽限窗内）：窗内仍有活动，但本地领先远端（有未推提交或从未推送）→警示态；
 * - fresh：窗内活跃且本地不领先远端（已同步或远端更新）。
 */
export type BranchFreshness = 'fresh' | 'stale' | 'old'
export function classifyBranchFresh(
  localTs: number, pushTs: number | null, nowMs: number, graceMs: number,
): BranchFreshness {
  const lastActivity = Math.max(localTs, pushTs ?? 0)
  if (nowMs - lastActivity > graceMs) return 'old'
  if (pushTs === null || localTs > pushTs) return 'stale'
  return 'fresh'
}

/** for-each-ref 输出解析（纯函数）：`name\tunix秒` 行，坏行跳过。 */
export function parseForEachRef(stdout: string): Array<{ name: string; ts: number }> {
  const out: Array<{ name: string; ts: number }> = []
  for (const ln of stdout.split('\n')) {
    const f = ln.trim().split('\t')
    if (f.length >= 2 && f[0] && /^\d+$/.test(f[1] ?? '')) out.push({ name: f[0], ts: Number(f[1]) })
  }
  return out
}

router.get('/branches', async (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  if (!safeRunDir(root, run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const repo = process.env.SIM_BRANCHES_REPO
  if (!repo || !existsSync(repo)) {
    ctx.status = 503
    ctx.body = { error: 'branches 未配置（SIM_BRANCHES_REPO 缺席=fail-closed）' }
    return
  }
  const graceMs = parseGraceMs(process.env.SIM_BRANCH_GRACE_MS)
  try {
    const { stdout } = await execFileP(
      'git', ['-C', repo, 'for-each-ref', 'refs/heads/feat/', '--format=%(refname:short)%09%(committerdate:unix)'], CLI_EXEC_OPTS)
    const locals = parseForEachRef(stdout).slice(0, 200)
    const nowMs = Date.now()
    const branches = await Promise.all(locals.map(async ({ name, ts }) => {
      const localTs = ts * 1000
      let pushTs: number | null = null
      try {
        // rev-parse origin 同名比对（本地 ref 只读，无网络动作）；缺失=从未推送。
        await execFileP('git', ['-C', repo, 'rev-parse', '--verify', '--quiet', `origin/${name}`], CLI_EXEC_OPTS)
        const { stdout: pt } = await execFileP('git', ['-C', repo, 'log', '-1', '--format=%ct', `origin/${name}`], CLI_EXEC_OPTS)
        pushTs = Number(pt.trim()) * 1000
      } catch { pushTs = null }
      return {
        name,
        localTs,
        pushed: pushTs !== null,
        pushTs,
        freshness: classifyBranchFresh(localTs, pushTs, nowMs, graceMs),
      }
    }))
    ctx.body = { run, graceMs, count: branches.length, branches }
  } catch (exc) {
    ctx.status = 500
    ctx.body = { error: clip((exc as Error).message, ERR_CLIP) }
  }
})

// ── 8. anchor：单框四类锚识别反查 ──

export type AnchorKind = 'event' | 'commit' | 'card' | 'room' | null

/** 锚类型识别（纯函数）：$事件号 / 7-40 位小写十六进制 commit / t_ 卡号 / ! 房间号；
 * 无法识别→null（→400）。 */
export function classifyAnchorId(id: string): AnchorKind {
  if (/^\$[A-Za-z0-9._=-]{1,254}$/.test(id)) return 'event'
  if (/^![A-Za-z0-9._=:-]{1,196}$/.test(id)) return 'room'
  if (/^t_[A-Za-z0-9_-]{1,64}$/.test(id)) return 'card'
  if (/^[0-9a-f]{7,40}$/.test(id)) return 'commit'
  return null
}

/** state.env 房间号扫描（纯函数）：在已解析 state 里找值含房间号的键。 */
export function scanRoomInState(state: Record<string, string>, roomId: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(state)) {
    if (typeof v === 'string' && v.includes(roomId)) out.push({ key: k, value: v })
  }
  return out
}

router.get('/anchor', async (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const id = String(ctx.query.id ?? '')
  const kind = classifyAnchorId(id)
  if (!kind) { ctx.status = 400; ctx.body = { error: '无法识别的锚类型（支持 $事件号/十六进制 commit/t_ 卡号/! 房间号）' }; return }
  try {
    if (kind === 'event') {
      // synapse 事件查询：端点复用 topology 的 synapse 配置（单一配置源）。
      const synapse = parseTopologyEndpoints(process.env.SIM_TOPOLOGY_ENDPOINTS).synapse
      const res = await fetchWithTimeout(`${synapse}/_synapse/admin/v1/event/${encodeURIComponent(id)}`, 2000)
      if (!res.ok) { ctx.status = 404; ctx.body = { type: 'event', error: `synapse 查询失败 HTTP ${res.status}` }; return }
      ctx.body = { type: 'event', data: await res.json() as unknown }
      return
    }
    if (kind === 'commit') {
      const repo = process.env.SIM_ANCHOR_REPO
      if (!repo || !existsSync(repo)) {
        ctx.status = 503
        ctx.body = { error: 'commit 锚未配置（SIM_ANCHOR_REPO 缺席=fail-closed）' }
        return
      }
      // id 已被严格限制为十六进制，无注入面；git show --stat 出摘要。
      const { stdout } = await execFileP('git', ['-C', repo, 'show', '--stat', '--format=%H%n%an%n%ad%n%s', id], CLI_EXEC_OPTS)
      ctx.body = { type: 'commit', data: { stat: clip(stdout, 4000) } }
      return
    }
    if (kind === 'card') {
      const base = (process.env.SIM_KANBAN_API || 'http://127.0.0.1:8802').replace(/\/+$/, '')
      const res = await fetchWithTimeout(`${base}/api/hermes/kanban/${encodeURIComponent(id)}`, 2000)
      if (!res.ok) { ctx.status = 404; ctx.body = { type: 'card', error: `看板查询失败 HTTP ${res.status}` }; return }
      ctx.body = { type: 'card', data: await res.json() as unknown }
      return
    }
    // room：扫描各 run 的 state.env，值含该房间号的键值即命中。
    const runsDir = resolve(root, 'runs')
    const matches: Array<{ run: string; key: string; value: string }> = []
    if (existsSync(runsDir)) {
      const runs = readdirSync(runsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && isValidRun(d.name))
        .map(d => d.name)
        .sort()
        .slice(0, 200)
      for (const r of runs) {
        const stateFile = resolve(runsDir, r, 'state.env')
        if (!existsSync(stateFile)) continue
        for (const hit of scanRoomInState(parseStateEnv(readFileSync(stateFile, 'utf-8')), id)) {
          matches.push({ run: r, key: hit.key, value: hit.value })
        }
      }
    }
    if (matches.length === 0) { ctx.status = 404; ctx.body = { type: 'room', error: 'state.env 中未发现该房间号' }; return }
    ctx.body = { type: 'room', matches }
  } catch (exc) {
    // 识别但查不到（含探测失败）→404 带类型，错误摘要截断。
    ctx.status = 404
    ctx.body = { type: kind, error: clip((exc as Error).message, ERR_CLIP) }
  }
})

// ── 9. trace：冻结单 AC × 测试报告 × 验收书判词四列聚合 ──

/** 冻结单 AC 行提取（纯函数）：AC-N + 判据原文；重复编号取首行（同 parseStateEnv 语义）。 */
export function extractAcList(text: string): Array<{ ac: string; criterion: string }> {
  const out: Array<{ ac: string; criterion: string }> = []
  const seen = new Set<string>()
  for (const ln of text.split('\n')) {
    const m = /(?:^|\s)AC[-\s]?(\d+)\s*[：:、.]?\s*(\S.*)$/i.exec(ln)
    if (m && !seen.has(m[1])) { seen.add(m[1]); out.push({ ac: `AC-${m[1]}`, criterion: m[2].trim() }) }
  }
  return out
}

/** 测试报告结果行提取（纯函数）：AC-N 行上的结果词（通过/失败/阻塞及英文态）。 */
export function extractCaseResults(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ln of text.split('\n')) {
    const m = /(?:^|\s)AC[-\s]?(\d+)/i.exec(ln)
    if (!m) continue
    const r = /(阻塞|blocked|失败|failed|fail|通过|passed|pass)/i.exec(ln)
    if (r) out[`AC-${m[1]}`] = r[1]
  }
  return out
}

/** 验收书判词行提取（纯函数）：AC-N 行上的 UAT 三态判词（不通过/有条件通过/通过）。 */
export function extractVerdicts(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ln of text.split('\n')) {
    const m = /(?:^|\s)AC[-\s]?(\d+)/i.exec(ln)
    if (!m) continue
    const r = /(不通过|有条件通过|通过|conditional(?:\s+pass)?|reject|fail|pass)/i.exec(ln)
    if (r) out[`AC-${m[1]}`] = r[1]
  }
  return out
}

/** 四列结构组装（纯函数）：源缺席该列 null 并在 meta 标缺席——如实呈现，不硬凑。 */
export function assembleTrace(
  frozen: string | null, report: string | null, acceptance: string | null,
): { rows: Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }>; meta: Record<string, boolean> } {
  const acs = frozen ? extractAcList(frozen) : []
  const cases = report ? extractCaseResults(report) : {}
  const verdicts = acceptance ? extractVerdicts(acceptance) : {}
  const keys = new Set<string>([...acs.map(a => a.ac), ...Object.keys(cases), ...Object.keys(verdicts)])
  const rows = [...keys]
    .sort((a, b) => Number(a.replace(/^AC-/i, '')) - Number(b.replace(/^AC-/i, '')))
    .map(ac => ({
      ac,
      criterion: acs.find(a => a.ac === ac)?.criterion ?? null,
      caseResult: cases[ac] ?? null,
      uatVerdict: verdicts[ac] ?? null,
    }))
  return {
    rows,
    meta: { frozenPresent: frozen !== null, testReportPresent: report !== null, acceptancePresent: acceptance !== null },
  }
}

/** 读交付物文件（≤1MB 截断，防超大文件整读）：缺席→null。 */
function readCapped(file: string | null): string | null {
  if (!file || !existsSync(file)) return null
  const size = statSync(file).size
  const fd = readFileSync(file, { encoding: 'utf-8' })
  return size > 1_048_576 ? `${fd.slice(0, 1_048_576)}\n…(file truncated at 1MB)` : fd
}

router.get('/trace', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const evidDir = resolve(runDir, 'evidence')
  const files = existsSync(evidDir)
    ? readdirSync(evidDir, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name).slice(0, 2000)
    : []
  const matched = new Map(matchDeliverables(files).map(d => [d.name, d.file]))
  const readByName = (key: string): string | null => {
    const f = matched.get(key)
    return f ? readCapped(resolve(evidDir, f)) : null
  }
  const { rows, meta } = assembleTrace(readByName('freeze'), readByName('test-report'), readByName('acceptance'))
  ctx.body = { run, rows, meta, source: { evidenceDir: evidDir } }
})

// ── 10. evidence/mark：本族唯一写端点（强校验+路径穿越防护） ──

export const MARK_ROOM_RE = /^![A-Za-z0-9._=-]{1,64}$/
export const MARK_EVENT_RE = /^\$[A-Za-z0-9]{1,24}$/

/** mark 入参强校验（纯函数）：run 字符集/room/event_id 正则/summary 非空≤200。 */
export function validateEvidenceMark(body: unknown):
  { ok: true; run: string; room: string; event_id: string; summary: string } | { ok: false; error: string } {
  const b = body as { run?: unknown; room?: unknown; event_id?: unknown; summary?: unknown } | undefined
  const run = typeof b?.run === 'string' ? b.run : ''
  if (!isValidRun(run)) return { ok: false, error: 'run 参数非法' }
  const room = typeof b?.room === 'string' ? b.room : ''
  if (!MARK_ROOM_RE.test(room)) return { ok: false, error: 'room 非法（^! + [A-Za-z0-9._=-]{1,64}）' }
  const event_id = typeof b?.event_id === 'string' ? b.event_id : ''
  if (!MARK_EVENT_RE.test(event_id)) return { ok: false, error: 'event_id 非法（^$ + [A-Za-z0-9]{1,24}）' }
  const summary = typeof b?.summary === 'string' ? b.summary : ''
  if (!summary.trim()) return { ok: false, error: 'summary 必填' }
  if (summary.length > 200) return { ok: false, error: 'summary 超长（≤200 字符）' }
  return { ok: true, run, room, event_id, summary }
}

/** 穿越防护（纯函数）：mark 文件 resolve 后必须仍在该 run 的 evidence/ 内。 */
export function safeEvidenceFile(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const evidDir = resolve(runDir, 'evidence')
  const file = resolve(evidDir, 'message-marks.jsonl')
  return file.startsWith(evidDir + sep) ? file : null
}

router.post('/evidence/mark', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const v = validateEvidenceMark(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const runDir = safeRunDir(root, v.run)
  if (!runDir || !existsSync(runDir)) { ctx.status = 400; ctx.body = { error: 'run 参数非法或不存在' }; return }
  const file = safeEvidenceFile(root, v.run)
  if (!file) { ctx.status = 400; ctx.body = { error: '目标路径越界' }; return }
  const evidDir = resolve(runDir, 'evidence')
  mkdirSync(evidDir, { recursive: true })
  const ts = new Date().toISOString()
  appendFileSync(file, `${JSON.stringify({ ts, source: 'server', run: v.run, room: v.room, event_id: v.event_id, summary: v.summary })}\n`, 'utf-8')
  ctx.body = { ok: true, ts, anchor: `evidence/message-marks.jsonl#${v.event_id}` }
})

// ── 11. issues：issues.log 只读聚合（ISSUE/DISP 解析+处置率） ──

export interface IssueLine { kind: 'issue' | 'disp'; code: string; subject: string; text: string }

/**
 * issues.log 解析（纯函数，测试面）。行格式=simharness mx-lib/aipay-scenario 实测：
 * `ISSUE|<code>|<subject>|<detail>` 与 `DISP|<code>|<subject>|<处置结论>`。
 * 处置率=已处置 ISSUE / ISSUE 全量（DISP 行是对 ISSUE 的处置记录，不重复入分母；
 * 设计正本=治理中心签 2「分母=台账全量」口径，两计数均输出供对账）。
 */
export function parseIssuesLog(text: string): {
  lines: IssueLine[]
  stats: { totalLines: number; totalIssue: number; totalDisp: number; disposed: number; open: number; rate: number | null }
} {
  const raw = text.split('\n').filter(l => l.trim() !== '')
  const issues: IssueLine[] = []
  const disps: IssueLine[] = []
  for (const ln of raw) {
    const m = /^(ISSUE|DISP)\|([^|]*)\|([^|]*)\|(.*)$/.exec(ln.trim())
    if (!m) continue
    const rec: IssueLine = { kind: m[1] === 'ISSUE' ? 'issue' : 'disp', code: m[2].trim(), subject: m[3].trim(), text: m[4].trim() }
    if (rec.kind === 'issue') issues.push(rec)
    else disps.push(rec)
  }
  const disposedCodes = new Set(disps.map(d => d.code))
  const disposed = issues.filter(i => disposedCodes.has(i.code)).length
  return {
    lines: [...issues, ...disps],
    stats: {
      totalLines: raw.length,
      totalIssue: issues.length,
      totalDisp: disps.length,
      disposed,
      open: issues.length - disposed,
      rate: issues.length === 0 ? null : disposed / issues.length,
    },
  }
}

router.get('/issues', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  // 两处都试：run 根 issues.log 与 evidence/issues.log（mx-lib 两代落位兼容）。
  const candidates = [resolve(runDir, 'issues.log'), resolve(runDir, 'evidence', 'issues.log')]
  const file = candidates.find(f => existsSync(f))
  if (!file) { ctx.status = 404; ctx.body = { error: `run ${run} 的 issues.log 不存在（run 根与 evidence/ 均缺席）` }; return }
  const { lines, stats } = parseIssuesLog(readCapped(file) ?? '')
  ctx.body = { run, count: lines.length, lines, stats, source: file }
})

export { router as simcenterRouter }
