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
 *   POST /evidence/mark         证据标记写入：evidence/message-marks.jsonl append｜强校验+穿越防护
 *   GET  /issues?run=           issues.log（run 根或 evidence/ 两处）ISSUE/DISP 解析｜只读聚合
 *   GET  /quality?run=          mutation-score.json+dup-ratio.json 只读聚合｜E/F 件，缺席如实
 *   GET  /uat-verdicts?run=     UAT 判定台账按 AC 聚合（最新+历史+阻断）｜状态机读模型
 *   POST /uat-verdict           UAT 逐 AC 判定（conditional/reject 必填 note）｜append-only
 *   GET  /release-gate?run=     G5 发布门状态机读模型（state/history/allowedActions/can）｜派生
 *   GET  /release-gate/state    GET /release-gate 别名（显式 state 读面）
 *   POST /release-gate          G5 状态迁移 submit/approve/reject/release｜409 非法迁移+幂等
 *   GET  /observer/overview     日常侧推演观察（2026-10-21 挂账实施轮）：当前 SIM run 的
 *                               房间键 + 跨板任务只读聚合（复用 kanban-overview sqlite 快道，
 *                               kanbanDir 指向 SIM hermes）｜fail-soft：SIM 根缺席=available:false
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
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, sep } from 'node:path'
import { gateKeys, ledgerSummary, parseStateEnv, stepKeys } from '../observability/observability-controller'
import {
  RELEASE_ACTIONS, RELEASE_ALLOWED, actionOfRecord, applyReleaseAction,
  deriveReleaseState, releasePermissions, validateReleaseActionInput,
  type ReleaseAction, type ReleaseDecision, type ReleaseGateRecord,
} from './release-state'
import {
  UAT_VERDICT_LABEL, aggregateUatByAc, validateUatVerdictFields,
  type UatVerdictKey, type UatVerdictRecord,
} from './uat-state'
import { createKanbanOverview } from '../services/hermes/kanban-overview'

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

// ── 日常侧推演观察（2026-10-21 挂账实施轮）──────────────────────────────
// 与 simRootOrNull 的 fail-closed 不同：观察面是 fail-soft——宿主日常未配
// OBS_SIM_ROOT 时按固定候选位探测（env 显式优先，其后工作区约定位），全部缺席
// 返回 available:false，不报错、不读任意路径。

/** 观察面 SIM 根候选（纯函数，测试面）：显式 env 优先，其后按 overlay/upstream
 *  两种进程 cwd 形态向上找同级 ncwk-sim-mux，最后家目录约定位。 */
export function observerSimRootCandidates(env: NodeJS.ProcessEnv, cwd: string, home: string): string[] {
  const explicit = [env.SIM_OBSERVER_ROOT, env.OBS_SIM_ROOT, env.SIM_ROOT, env.AIPAY_SIM_ROOT]
    .map(v => (v ?? '').trim()).filter(Boolean) as string[]
  const heuristic = [
    resolve(cwd, '../ncwk-sim-mux'),
    resolve(cwd, '../../ncwk-sim-mux'),
    resolve(cwd, '../../../ncwk-sim-mux'),
    resolve(home, 'ncwk-sim-mux'),
  ]
  return [...new Set([...explicit, ...heuristic])]
}

/** 观察面 SIM 根解析：候选中第一个存在的目录；全缺席返回 null（fail-soft）。 */
export function observerSimRootOrNull(): string | null {
  for (const p of observerSimRootCandidates(process.env, process.cwd(), homedir())) {
    try { if (statSync(p).isDirectory()) return p } catch { /* 候选缺席继续 */ }
  }
  return null
}

/** state.env 中房间键提取（纯函数）：值形如 !local:server 的键值对。 */
export function simRoomKeysOf(state: Record<string, string>): Array<{ key: string; roomId: string }> {
  const out: Array<{ key: string; roomId: string }> = []
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === 'string' && /^![^:\s]+:\S+$/.test(value.trim())) {
      out.push({ key, roomId: value.trim() })
    }
  }
  return out
}

/** 当前 run 解析（纯读）：优先 var/current-state.env 软链真身（runs/<id>/state.env），
 *  缺席回落 runs/* 按 state.env mtime 最新。均缺席返回 runId:null。 */
export function currentRunOf(root: string): { runId: string | null; stateFile: string | null } {
  try {
    const link = resolve(root, 'var', 'current-state.env')
    if (existsSync(link)) {
      const real = realpathSync(link)
      const m = /runs[/\\]([^/\\]+)[/\\]state\.env$/.exec(real)
      if (m) return { runId: m[1], stateFile: real }
    }
  } catch { /* 软链解析失败走回落 */ }
  try {
    const runsDir = resolve(root, 'runs')
    if (!existsSync(runsDir)) return { runId: null, stateFile: null }
    let best: { runId: string; stateFile: string; mtime: number } | null = null
    for (const name of readdirSync(runsDir)) {
      if (!isValidRun(name)) continue
      const stateFile = resolve(runsDir, name, 'state.env')
      try {
        const mtime = statSync(stateFile).mtimeMs
        if (!best || mtime > best.mtime) best = { runId: name, stateFile, mtime }
      } catch { /* 单 run 缺 state.env 跳过 */ }
    }
    return best ? { runId: best.runId, stateFile: best.stateFile } : { runId: null, stateFile: null }
  } catch {
    return { runId: null, stateFile: null }
  }
}

/** 觨演侧看板只读聚合实例：sqlite 快道直读 SIM hermes（不 spawn CLI、不装 watcher）。
 *  回落 deps 全部空实现——快道读不了时如实空板，不碰宿主 CLI。 */
let _simKanbanOverview: ReturnType<typeof createKanbanOverview> | null = null
let _simKanbanRoot = ''
function simKanbanOverview(root: string): ReturnType<typeof createKanbanOverview> {
  if (!_simKanbanOverview || _simKanbanRoot !== root) {
    _simKanbanRoot = root
    _simKanbanOverview = createKanbanOverview({
      listBoards: async () => [],
      listTasks: async () => [],
      watchEvents: (() => { throw new Error('sim observer 只读，不装看板 watcher') }) as never,
      killWatch: () => {},
      kanbanDir: () => resolve(root, 'hermes'),
    })
  }
  return _simKanbanOverview
}

// ── 12. observer/overview：日常侧推演观察聚合 ──
router.get('/observer/overview', async (ctx: Context) => {
  const root = observerSimRootOrNull()
  if (!root) {
    ctx.body = { available: false, reason: '未找到推演根：SIM_OBSERVER_ROOT/OBS_SIM_ROOT 未配置且默认位置不存在' }
    return
  }
  try {
    const run = currentRunOf(root)
    const state = run.stateFile && existsSync(run.stateFile)
      ? parseStateEnv(readFileSync(run.stateFile, 'utf8'))
      : {}
    const rooms = simRoomKeysOf(state)
    const startedAtRaw = Number(state.run_started_at ?? 0)
    const overview = await simKanbanOverview(root).getOverview()
    ctx.body = {
      available: true,
      runId: run.runId,
      posture: state.posture || 'standard',
      startedAt: startedAtRaw > 0 ? (startedAtRaw < 1e12 ? startedAtRaw * 1000 : startedAtRaw) : null,
      rooms,
      boards: overview.boards,
      tasks: overview.tasks,
      fetchedAt: Date.now(),
    }
  } catch (err) {
    ctx.body = { available: false, reason: clip(err instanceof Error ? err.message : String(err), ERR_CLIP) }
  }
})

/** 503 fail-closed 统一回包（631 同款断言面：响应体带提示）。 */
function gateClosed(ctx: Context): void {
  ctx.status = 503
  ctx.body = { error: 'simcenter 未配置（OBS_SIM_ROOT 缺席=fail-closed）' }
}

/** fetch 带超时（AbortController；超时/网络错误按 fail-soft 抛出由调用方统一处理）。 */
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
  let file = resolve(runDir, 'workflow-journal.ndjson')
  if (!existsSync(file)) {
    // 每轮副本缺席时回落到 SIM 根全局日志（网关 journal 是全局流，不是每轮独立文件）；
    // run 目录本身不存在仍 404，路径穿越仍由 safeRunDir 拦。
    const globalFile = resolve(root, 'logs', 'workflow-journal.ndjson')
    if (existsSync(runDir) && existsSync(globalFile)) file = globalFile
    else { ctx.status = 404; ctx.body = { error: `run ${run} 的 workflow-journal.ndjson 不存在` }; return }
  }
  const { lines, skipped } = parseJournalTail(readFileSync(file, 'utf-8'), tail)
  ctx.body = { run, tail, count: lines.length, skippedBadLines: skipped, lines, source: file }
})

// ── 3. topology：四服务 /health 探测代理（前端跨域集中代理） ──

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

// ── 能力面：可选探测命令是否配置（前端据此决定是否发起请求，避免必然 503 的噪音） ──
router.get('/capabilities', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  ctx.body = {
    topology: true,
    frames: true,
    dispatcherHealth: Boolean(process.env.SIM_DISPATCHER_HEALTH_CLI),
    sleepingWorkers: Boolean(process.env.SIM_SLEEPING_WORKERS_CLI),
  }
})

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
  // 人工 UAT 判定台账（2026-10-19 P2）：最新人工判定覆盖验收书提取值——人判晚于文档。
  const uatLedger = readUatLedger(root, run)
  const merged = uatLedger ? mergeUatVerdicts(rows, uatLedger.records) : rows
  ctx.body = {
    run,
    rows: merged,
    meta: { ...meta, uatLedger: uatLedger !== null },
    source: { evidenceDir: evidDir },
  }
})

// ── 9b. UAT 判定台账：run 绑定的人工判定持久化（spec 2026-10-21-g5-uat-state-machine §2） ──
// 类型/标签/聚合纯函数正身在 uat-state.ts；此处保留历史导出面（TracePanel 等消费者不迁移）。

export { UAT_VERDICT_LABEL }
export type { UatVerdictKey, UatVerdictRecord }

/** UAT 判定入参强校验（纯函数）：run 校验 + uat-state 字段校验（conditional 需 note+ack；reject 需 note）。 */
export function validateUatVerdict(body: unknown):
  { ok: true; run: string; ac: string; verdict: UatVerdictKey; note?: string; acknowledged?: boolean } | { ok: false; error: string } {
  const b = body as { run?: unknown } | undefined
  const run = typeof b?.run === 'string' ? b.run : ''
  if (!isValidRun(run)) return { ok: false, error: 'run 参数非法' }
  const fields = validateUatVerdictFields(body)
  if (!fields.ok) return fields
  return { ok: true, run, ac: fields.ac, verdict: fields.verdict, ...(fields.note ? { note: fields.note } : {}), ...(fields.acknowledged ? { acknowledged: true } : {}) }
}

/** 台账落位（穿越防护同 evidence/mark）：runs/<run>/evidence/uat-verdicts.jsonl。 */
export function safeUatLedgerFile(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const evidDir = resolve(runDir, 'evidence')
  const file = resolve(evidDir, 'uat-verdicts.jsonl')
  return file.startsWith(evidDir + sep) ? file : null
}

/** 读台账（缺file→null）；坏行跳过（append-only jsonl 容错读）。 */
export function readUatLedger(root: string, run: string): { file: string; records: UatVerdictRecord[] } | null {
  const file = safeUatLedgerFile(root, run)
  if (!file || !existsSync(file)) return null
  const records: UatVerdictRecord[] = []
  for (const ln of (readCapped(file) ?? '').split('\n')) {
    if (!ln.trim()) continue
    try {
      const r = JSON.parse(ln) as UatVerdictRecord
      if (r && typeof r.ac === 'string' && (r.verdict === 'pass' || r.verdict === 'conditional' || r.verdict === 'reject')) {
        records.push(r)
      }
    } catch { /* 坏行丢弃 */ }
  }
  return { file, records }
}

/** 人工判定合并（纯函数）：同一 AC 取 ts 最新的人工记录，label 覆盖 uatVerdict。 */
export function mergeUatVerdicts(
  rows: Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }>,
  records: UatVerdictRecord[],
): Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }> {
  const latest = new Map<string, UatVerdictRecord>()
  for (const r of records) {
    const prev = latest.get(r.ac)
    if (!prev || Date.parse(r.ts) >= Date.parse(prev.ts)) latest.set(r.ac, r)
  }
  const byAc = new Map(rows.map(r => [r.ac, r]))
  // 台账行不回填为 AC 行——三源全缺席时 trace 整表空属正常（如实呈现）；
  // 台账数据由 /uat-verdicts 独立端点供给 UAT 页签（spec 2026-10-19-studio-p2 §2.1）。
  const out = rows.map(row => {
    const hit = latest.get(row.ac)
    return hit ? { ...row, uatVerdict: UAT_VERDICT_LABEL[hit.verdict] } : row
  })
  // 台账内 ac 不在三源行集合的，附加为"台账补行"（criterion=null）——
  // 保证人工判定面不丢条目，同时不冒充三源提取。
  const extra: Array<{ ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }> = []
  for (const [ac, rec] of latest) {
    if (byAc.has(ac)) continue
    extra.push({ ac, criterion: null, caseResult: null, uatVerdict: UAT_VERDICT_LABEL[rec.verdict] })
  }
  extra.sort((a, b) => Number(a.ac.replace(/^AC-/i, '')) - Number(b.ac.replace(/^AC-/i, '')))
  return [...out, ...extra]
}

function actorOf(ctx: Context): string {
  const user = (ctx.state as { user?: { username?: string } } | undefined)?.user
  return typeof user?.username === 'string' && user.username ? user.username : 'unknown'
}

/** 调用方身份（角色闸）：上游 requireUserJwt 写 ctx.state.user；未启用鉴权=undefined（单用户部署放行）。 */
function callerOf(ctx: Context): { actor: string; role?: string; authenticated: boolean } {
  const user = (ctx.state as { user?: { username?: string; role?: string } } | undefined)?.user
  return {
    actor: typeof user?.username === 'string' && user.username ? user.username : 'unknown',
    role: typeof user?.role === 'string' ? user.role : undefined,
    authenticated: Boolean(user),
  }
}

router.get('/uat-verdicts', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const ledger = readUatLedger(root, run)
  const records = ledger?.records ?? []
  const { byAc, summary } = aggregateUatByAc(records)
  ctx.body = {
    run,
    records,
    byAc,
    summary,
    blocked: summary.blocked > 0,
    blockedAcs: byAc.filter(a => a.blocked).map(a => a.ac),
    source: ledger?.file ?? null,
  }
})

router.post('/uat-verdict', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const v = validateUatVerdict(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const runDir = safeRunDir(root, v.run)
  if (!runDir || !existsSync(runDir)) { ctx.status = 400; ctx.body = { error: 'run 参数非法或不存在' }; return }
  const file = safeUatLedgerFile(root, v.run)
  if (!file) { ctx.status = 400; ctx.body = { error: '目标路径越界' }; return }
  mkdirSync(resolve(runDir, 'evidence'), { recursive: true })
  const rec: UatVerdictRecord = {
    ts: new Date().toISOString(),
    actor: actorOf(ctx),
    run: v.run,
    ac: v.ac,
    verdict: v.verdict,
    ...(v.note ? { note: v.note } : {}),
    ...(v.acknowledged ? { acknowledged: true } : {}),
  }
  appendFileSync(file, `${JSON.stringify(rec)}\n`, 'utf-8')
  ctx.body = { ok: true, record: rec, anchor: `evidence/uat-verdicts.jsonl#${v.ac}` }
})

// ── 9c. G5 发布门状态机：append-only 事件流 + 派生状态（spec 2026-10-21-g5-uat-state-machine §1） ──
// 类型/迁移矩阵/派生/权限正身在 release-state.ts；此处保留旧导出面与存储路径。

export type { ReleaseAction, ReleaseDecision, ReleaseGateRecord }

/**
 * 旧二态决策校验（纯函数，兼容旧调用方/测试）：打回必须给理由；批准 note 可选。
 * @deprecated 新端点用 validateReleaseActionInput（批准需证据锚）。
 */
export function validateReleaseGate(body: unknown):
  { ok: true; run: string; decision: ReleaseDecision; note?: string } | { ok: false; error: string } {
  const b = body as { run?: unknown; decision?: unknown; note?: unknown } | undefined
  const run = typeof b?.run === 'string' ? b.run : ''
  if (!isValidRun(run)) return { ok: false, error: 'run 参数非法' }
  if (b?.decision !== 'approve' && b?.decision !== 'reject') {
    return { ok: false, error: 'decision 须为 approve|reject' }
  }
  const note = typeof b?.note === 'string' ? b.note.trim() : ''
  if (note.length > 300) return { ok: false, error: 'note 超长（≤300 字符）' }
  if (b.decision === 'reject' && !note) return { ok: false, error: '打回必须给理由（note 必填）' }
  return { ok: true, run, decision: b.decision, note: note || undefined }
}

export function safeReleaseGateFile(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const evidDir = resolve(runDir, 'evidence')
  const file = resolve(evidDir, 'release-gate.jsonl')
  return file.startsWith(evidDir + sep) ? file : null
}

/** 读台账：旧记录（decision）与新记录（action）都收；未知动作坏行丢弃。 */
export function readReleaseGate(root: string, run: string): { file: string; records: ReleaseGateRecord[] } | null {
  const file = safeReleaseGateFile(root, run)
  if (!file || !existsSync(file)) return null
  const records: ReleaseGateRecord[] = []
  for (const ln of (readCapped(file) ?? '').split('\n')) {
    if (!ln.trim()) continue
    try {
      const r = JSON.parse(ln) as ReleaseGateRecord
      if (r && actionOfRecord(r) !== null) records.push(r)
    } catch { /* 坏行丢弃 */ }
  }
  return { file, records }
}

/** 当前判定（纯函数，旧读面兼容）：最新一条 approve/reject 记录；无则 null。 */
export function latestReleaseDecision(records: ReleaseGateRecord[]): ReleaseGateRecord | null {
  let latest: ReleaseGateRecord | null = null
  for (const r of records) {
    const action = actionOfRecord(r)
    if (action !== 'approve' && action !== 'reject') continue
    if (!latest || Date.parse(r.ts) >= Date.parse(latest.ts)) latest = r
  }
  return latest
}

function releaseGateStateHandler(ctx: Context): void {
  const root = simRootOrNull()
  if (!root) { gateClosed(ctx); return }
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const ledger = readReleaseGate(root, run)
  const records = ledger?.records ?? []
  const derived = deriveReleaseState(records)
  const caller = callerOf(ctx)
  const can = releasePermissions(caller.role, caller.authenticated)
  const decision = derived.latestDecision ? actionOfRecord(derived.latestDecision) : null
  ctx.body = {
    run,
    state: derived.state,
    decision: decision === 'approve' || decision === 'reject' ? decision : null,
    current: derived.latest,
    records,
    history: derived.history,
    allowedActions: RELEASE_ALLOWED[derived.state].filter(action => can[action]),
    stateAllowedActions: RELEASE_ALLOWED[derived.state],
    can,
    source: ledger?.file ?? null,
  }
}

router.get('/release-gate', releaseGateStateHandler)
// 显式 state 读面别名：语义相同，便于客户端/外部脚本按状态机命名读取。
router.get('/release-gate/state', releaseGateStateHandler)

router.post('/release-gate', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const body = ctx.request.body as { run?: unknown } | undefined
  const run = typeof body?.run === 'string' ? body.run : ''
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const v = validateReleaseActionInput(body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const action = v.value.action
  const caller = callerOf(ctx)
  const can = releasePermissions(caller.role, caller.authenticated)
  if (!can[action]) {
    ctx.status = 403
    ctx.body = { ok: false, code: 'forbidden', error: '发布审批动作仅 super_admin 或 release 角色可执行' }
    return
  }
  const runDir = safeRunDir(root, run)
  if (!runDir || !existsSync(runDir)) { ctx.status = 400; ctx.body = { error: 'run 参数非法或不存在' }; return }
  const file = safeReleaseGateFile(root, run)
  if (!file) { ctx.status = 400; ctx.body = { error: '目标路径越界' }; return }
  const ledger = readReleaseGate(root, run)
  const records = ledger?.records ?? []
  const derived = deriveReleaseState(records)
  const next = applyReleaseAction(derived.state, action)
  if (next === null) {
    ctx.status = 409
    ctx.body = {
      ok: false,
      code: 'invalid_transition',
      error: `当前状态 ${derived.state} 不允许动作 ${action}`,
      state: derived.state,
      action,
    }
    return
  }
  // 同态重复（重复提交/批准/驳回/发布）：不追加重复事件，回当前状态。
  if (next === derived.state) {
    ctx.body = { ok: true, idempotent: true, state: next, action, record: null, current: derived.latest }
    return
  }
  mkdirSync(resolve(runDir, 'evidence'), { recursive: true })
  const rec: ReleaseGateRecord = {
    ts: new Date().toISOString(),
    actor: caller.actor,
    run,
    action,
    ...(v.value.note ? { note: v.value.note } : {}),
    ...(v.value.anchor ? { anchor: v.value.anchor } : {}),
    ...(action === 'approve' || action === 'reject' ? { decision: action } : {}),
  }
  appendFileSync(file, `${JSON.stringify(rec)}\n`, 'utf-8')
  const after = deriveReleaseState([...records, rec])
  ctx.body = { ok: true, idempotent: false, state: after.state, action, record: rec, anchor: 'evidence/release-gate.jsonl' }
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

// ── 10. settings：推演引擎参数读写对（B8，设计正本 E28 四区）──
// 例外声明：simcenter 族以只读聚合为纲，本对是唯一的服务端状态写面（引擎参数
// 四键，非数据面聚合）；持久化 <home>/runtime/sim-settings.json，受控键集外
// 一律 400。消费方=推演设置页（/app/sim/settings）与 harness 开轮参数读取。

export interface SimSettings {
  posture_default?: 'strict' | 'standard' | 'demo'
  observation_window_seconds?: number
  clearance_policy?: 'block' | 'warn'
  approval_escalate_minutes?: number
}

export const SIM_SETTINGS_DEFAULTS: Required<SimSettings> = {
  posture_default: 'standard',
  observation_window_seconds: 1200,
  clearance_policy: 'block',
  approval_escalate_minutes: 30,
}

/** 设置校验（纯函数，测试面）：只认四键，部分更新合法；值域越界=400 语义。 */
export function validateSimSettings(body: unknown): { ok: true; patch: SimSettings } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: '请求体须为对象' }
  const patch: SimSettings = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    switch (k) {
      case 'posture_default':
        if (v !== 'strict' && v !== 'standard' && v !== 'demo') return { ok: false, error: 'posture_default ∈ strict|standard|demo' }
        patch.posture_default = v
        break
      case 'observation_window_seconds':
        if (!Number.isInteger(v) || (v as number) < 30 || (v as number) > 3600) return { ok: false, error: 'observation_window_seconds ∈ 30-3600 整数秒' }
        patch.observation_window_seconds = v as number
        break
      case 'clearance_policy':
        if (v !== 'block' && v !== 'warn') return { ok: false, error: 'clearance_policy ∈ block|warn（block=未清拒开新轮，机械执法缺省）' }
        patch.clearance_policy = v
        break
      case 'approval_escalate_minutes':
        if (!Number.isInteger(v) || (v as number) < 5 || (v as number) > 1440) return { ok: false, error: 'approval_escalate_minutes ∈ 5-1440 整数分钟' }
        patch.approval_escalate_minutes = v as number
        break
      default:
        return { ok: false, error: `未知键 ${k}（只认 posture_default/observation_window_seconds/clearance_policy/approval_escalate_minutes）` }
    }
  }
  return { ok: true, patch }
}

function simSettingsFile(): string {
  const home = process.env.HERMES_WEB_UI_HOME || process.env.HOME || '.'
  return resolve(home, 'runtime', 'sim-settings.json')
}

function loadSimSettings(): SimSettings {
  try { return JSON.parse(readFileSync(simSettingsFile(), 'utf-8')) as SimSettings } catch { return {} }
}

router.get('/settings', (ctx: Context) => {
  ctx.body = { values: { ...SIM_SETTINGS_DEFAULTS, ...loadSimSettings() }, defaults: SIM_SETTINGS_DEFAULTS }
})

router.put('/settings', (ctx: Context) => {
  const v = validateSimSettings(ctx.request.body)
  if (!v.ok) { ctx.status = 400; ctx.body = { error: v.error }; return }
  const merged = { ...loadSimSettings(), ...v.patch }
  const f = simSettingsFile()
  mkdirSync(resolve(f, '..'), { recursive: true })
  writeFileSync(f, JSON.stringify(merged, null, 1), 'utf-8')
  ctx.body = { values: { ...SIM_SETTINGS_DEFAULTS, ...merged } }
})

// ── 12. quality：AI 产出质量证据只读聚合（三篇调研轮 E/F 件，方案正本 V8.35 §5.8.2 判据执行产物）──
// 读 run 的 mutation-score.json 与 dup-ratio.json（simharness mx-mutation-score.mjs /
// mx-dup-ratio.mjs --out 产物；两处候选=run 根与 evidence/，照 issues 模式）。
// 缺席/坏形状=present:false 如实呈现不硬凑（N1）；verdict 透传工具原判（单一事实源）。

export type QualityMetricKind = 'mx-mutation-score' | 'mx-dup-ratio'

export interface QualityMetricView {
  present: boolean
  reason?: 'file-absent' | 'parse-error' | 'shape-error'
  candidates?: string[]
  source?: string
  tool?: string
  status?: string
  verdict?: string
  score?: number | null
  ratio?: number | null
  threshold?: number
  total?: number
  killed?: number
  survived?: number
  timeout?: number
  incrementLines?: number
  duplicateLines?: number
  blocks?: number
  ts?: string
}

/** 证据 JSON → 指标视图（纯函数，测试面）：tool/status/verdict 三锚校验，
 *  缺席=null→file-absent；数值字段缺席透传 undefined 不猜。 */
export function parseQualityMetric(text: string | null, expectTool: QualityMetricKind): QualityMetricView {
  if (text === null) return { present: false, reason: 'file-absent' }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { present: false, reason: 'parse-error' } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { present: false, reason: 'shape-error' }
  const r = raw as Record<string, unknown>
  if (r.tool !== expectTool || typeof r.status !== 'string' || typeof r.verdict !== 'string') {
    return { present: false, reason: 'shape-error' }
  }
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const numOrNull = (v: unknown): number | null | undefined => (v === null ? null : num(v))
  const base: QualityMetricView = {
    present: true,
    tool: expectTool,
    status: r.status,
    verdict: r.verdict,
    ts: typeof r.ts === 'string' ? r.ts : undefined,
  }
  if (expectTool === 'mx-mutation-score') {
    return { ...base, score: numOrNull(r.score), threshold: num(r.threshold), total: num(r.total), killed: num(r.killed), survived: num(r.survived), timeout: num(r.timeout) }
  }
  return { ...base, ratio: numOrNull(r.ratio), threshold: num(r.threshold), incrementLines: num(r.incrementLines), duplicateLines: num(r.duplicateLines), blocks: Array.isArray(r.blocks) ? r.blocks.length : undefined }
}

router.get('/quality', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const runDir = safeRunDir(root, run)
  if (!runDir) { ctx.status = 400; ctx.body = { error: 'run 参数非法（路径越界）' }; return }
  const readMetric = (file: string): { text: string | null; found: string | null; candidates: string[] } => {
    const candidates = [resolve(runDir, 'evidence', file), resolve(runDir, file)]
    const found = candidates.find(f => existsSync(f)) ?? null
    return { text: found ? readCapped(found) : null, found, candidates }
  }
  const mut = readMetric('mutation-score.json')
  const dup = readMetric('dup-ratio.json')
  const mutation: QualityMetricView = { ...parseQualityMetric(mut.text, 'mx-mutation-score'), ...(mut.found ? { source: mut.found } : { candidates: mut.candidates }) }
  const duplication: QualityMetricView = { ...parseQualityMetric(dup.text, 'mx-dup-ratio'), ...(dup.found ? { source: dup.found } : { candidates: dup.candidates }) }
  ctx.body = { run, mutation, duplication }
})

// ── 12/13. 帧图廊：evidence/screenshots 只读枚举与取图（2026-10-19 产品走查批：
//    证据库页签的「帧目录端点未接」补齐。名字一律相对路径，取图走 resolve+startsWith 双闸） ──

const FRAME_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export interface FrameFile {
  /** 相对 evidence/screenshots 的路径（前端取图参数） */
  name: string
  /** 步骤键（文件名前缀，如 uat_done） */
  step: string
  /** before/after（按文件名后缀） */
  phase: 'before' | 'after' | 'unknown'
  size: number
  mtime: number
}

/** 递归枚举截图目录（纯函数；坏目录跳过，不因单个坏文件拖垮整表）。 */
export function listFrameFiles(baseDir: string, rel = ''): FrameFile[] {
  const out: FrameFile[] = []
  const dir = rel ? resolve(baseDir, rel) : baseDir
  let entries: string[] = []
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const abs = resolve(dir, name)
    const relPath = rel ? `${rel}/${name}` : name
    let st
    try { st = statSync(abs) } catch { continue }
    if (st.isDirectory()) {
      out.push(...listFrameFiles(baseDir, relPath))
      continue
    }
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
    if (!FRAME_EXT.has(ext)) continue
    const stem = name.slice(0, name.lastIndexOf('.'))
    const phase = /-after$/i.test(stem) ? 'after' : /-before$/i.test(stem) ? 'before' : 'unknown'
    out.push({
      name: relPath,
      step: stem.replace(/-(?:before|after)$/i, '').replace(/-op\d+$/i, ''),
      phase,
      size: st.size,
      mtime: st.mtimeMs,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 帧根目录（run/evidence/screenshots）；不存在=null（调用方回空列表/404）。 */
function framesBase(root: string, run: string): string | null {
  const runDir = safeRunDir(root, run)
  if (!runDir) return null
  const base = resolve(runDir, 'evidence', 'screenshots')
  if (!base.startsWith(resolve(runDir, 'evidence') + sep)) return null
  return existsSync(base) ? base : null
}

router.get('/frames', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const base = framesBase(root, run)
  if (!base) { ctx.body = { run, frames: [], note: '本次运行没有截图目录' }; return }
  ctx.body = { run, frames: listFrameFiles(base) }
})

router.get('/frame', (ctx: Context) => {
  const root = simRootOrNull()
  if (!root) return gateClosed(ctx)
  const run = String(ctx.query.run ?? '')
  const name = String(ctx.query.name ?? '')
  if (!isValidRun(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const base = framesBase(root, run)
  if (!base) { ctx.status = 404; ctx.body = { error: '本次运行没有截图目录' }; return }
  const abs = resolve(base, name)
  if (!name || !abs.startsWith(base + sep)) { ctx.status = 400; ctx.body = { error: 'name 参数非法（路径越界）' }; return }
  if (!existsSync(abs)) { ctx.status = 404; ctx.body = { error: '帧不存在' }; return }
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
  if (!FRAME_EXT.has(ext)) { ctx.status = 415; ctx.body = { error: '不支持的图片类型' }; return }
  ctx.type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
  ctx.body = readFileSync(abs)
})

export { router as simcenterRouter }
