// overlay/custom/server/simcenter/sim-launch.ts
// 融合批四（D7）：启动器归属回推演运行域（harness=治理读模型域，启动推演是推演运行面
// 职责）；路由前缀 /api/harness/sim-launch/* 冻结不变（消费面零改动）。
// 受控 harness 推演启动器（2026-10-20 方案 2）：
//   GET  /api/harness/sim-launch/status
//   POST /api/harness/sim-launch/start   { runId }
//   POST /api/harness/sim-launch/stop
//
// 安全边界（缺一不可）：
// - 默认关闭：后端须显式 SIM_HARNESS_LAUNCH=1 才可用（fail-closed）；
// - 仅 super_admin（有认证主体时；单用户无鉴权部署按既有治理面约定放行）；
// - 只允许固定脚本 simharness/aipay-scenario.sh，不接受任意命令；
// - runId 严格白名单；同一时刻只允许一个由本进程拉起的子进程；
// - 已有 harness 驱动锁（SIM_ROOT/.driver.lock.d）= 拒绝双开；
// - 只杀自己拉起的 PID，不碰外部驱动。
import Router from '@koa/router'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { closeSync, existsSync, openSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'
import { fail } from '../lib/http'

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const HERE = typeof __dirname !== 'undefined'
  ? __dirname
  : resolve(process.cwd(), 'custom/server/harness')
const OVERLAY_ROOT = resolve(HERE, '../../..')
const WORKSPACE_ROOT = resolve(OVERLAY_ROOT, '..')
// 单仓整合（2026-10-24）：simharness 在仓根内；旧 overlay/ncwk 分仓布局才在仓外。
const SCRIPT_DIR = process.env.SIM_HARNESS_DIR?.trim()
  || (existsSync(resolve(OVERLAY_ROOT, 'simharness', 'aipay-scenario.sh'))
    ? resolve(OVERLAY_ROOT, 'simharness')
    : resolve(WORKSPACE_ROOT, 'simharness'))
const SCRIPT = resolve(SCRIPT_DIR, 'aipay-scenario.sh')
const SIM_ROOT = process.env.SIM_ROOT?.trim() || process.env.OBS_SIM_ROOT?.trim() || resolve(WORKSPACE_ROOT, 'ncwk-sim-mux')
const DRIVER_LOCK = resolve(SIM_ROOT, '.driver.lock.d')
// P2 Task 1：驱动/owner 判活走 guard CLI（四因子）；sim-launch 不自持锁——
// 有活 owner 时委托（监督者负责拉起），无 owner 的 standalone 仍经统一锁面拒双开。
const GUARD_CLI = resolve(OVERLAY_ROOT, 'scripts/platform/runtime/guard-cli.mjs')

interface GuardLockStatus {
  ok: boolean
  owner: { kind: string | null; pid: number | null; alive: boolean } | null
  driver: { pid: number | null; alive: boolean } | null
}

/** 读锁状态；CLI 失败=unknown（fail-closed：状态不明时拒绝启动，不放行双开） */
function guardLockStatus(): GuardLockStatus | 'unavailable' {
  try {
    const r = spawnSync(process.execPath, [GUARD_CLI, 'lock-status', '--sim-root', SIM_ROOT], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000,
    })
    const parsed = JSON.parse(r.stdout || 'null')
    if (!parsed || parsed.ok !== true) return 'unavailable'
    return parsed as GuardLockStatus
  } catch {
    return 'unavailable'
  }
}

interface RunningInfo {
  runId: string
  pid: number | null
  startedAt: string
  logFile: string
}
let child: ChildProcess | null = null
let running: RunningInfo | null = null
let lastExit: { runId: string; code: number | null; signal: string | null; endedAt: string } | null = null

function enabled(): boolean {
  return process.env.SIM_HARNESS_LAUNCH === '1'
}

function writeDenied(ctx: { state?: unknown; status?: number; body?: unknown }): boolean {
  const user = (ctx.state as { user?: { role?: string } } | undefined)?.user
  if (user && user.role !== 'super_admin') {
    ctx.status = 403
    ctx.body = { ok: false, error: 'harness 启动须 super_admin 权限' }
    return true
  }
  return false
}

function logTail(file: string, maxBytes = 12_000): string {
  try {
    if (!existsSync(file)) return ''
    const size = statSync(file).size
    const start = Math.max(0, size - maxBytes)
    const buf = readFileSync(file)
    return buf.subarray(start).toString('utf8')
  } catch {
    return ''
  }
}

function statusBody() {
  return {
    ok: true,
    enabled: enabled(),
    running: Boolean(child),
    process: running,
    lastExit,
    script: SCRIPT,
    simRoot: SIM_ROOT,
    driverLock: existsSync(DRIVER_LOCK),
    logTail: running ? logTail(running.logFile) : '',
  }
}

export const simLaunchRoutes = new Router()

simLaunchRoutes.get('/status', (ctx) => {
  ctx.body = statusBody()
})

simLaunchRoutes.post('/start', (ctx) => {
  if (!enabled()) {
    fail(ctx, 403, 'harness 启动未启用（后端需以 SIM_HARNESS_LAUNCH=1 启动）——默认关闭是安全边界')
    return
  }
  if (writeDenied(ctx)) return
  if (child) {
    fail(ctx, 409, `已有 harness 推演在跑：${running?.runId ?? 'unknown'}`)
    return
  }
  const body = ctx.request.body as { runId?: unknown } | undefined
  const runId = String(body?.runId ?? '').trim()
  if (!RUN_ID_RE.test(runId)) {
    fail(ctx, 400, 'runId 必须为字母/数字/._-（1-80 字符）')
    return
  }
  if (!existsSync(SCRIPT)) {
    fail(ctx, 503, `harness 脚本不存在：${SCRIPT}`)
    return
  }
  if (!existsSync(SIM_ROOT)) {
    fail(ctx, 503, `SIM_ROOT 不存在：${SIM_ROOT}`)
    return
  }
  // P2 Task 1：先看 owner（有活监督者=拉起权已委托，本端点不另起）；再看驱动锁
  // （四因子判活——陈锁不再误拦，活锁照旧拒双开）。CLI 不可用=状态不明拒绝启动。
  const lock = guardLockStatus()
  if (lock === 'unavailable') {
    fail(ctx, 503, 'guard CLI 不可用（锁状态不明，fail-closed 拒绝启动）')
    return
  }
  if (lock.owner?.alive) {
    fail(ctx, 409, `推演拉起权已由 owner 持有（kind=${lock.owner.kind} pid=${lock.owner.pid}）——已委托该监督者，本端点不另起驱动`)
    return
  }
  if (lock.driver?.alive) {
    fail(ctx, 409, `已有 harness 驱动在跑（driver pid=${lock.driver.pid}，四因子判活）——拒绝双开`)
    return
  }
  const logFile = resolve(SIM_ROOT, 'logs', `${runId}-driver.log`)
  let fd: number | null = null
  try {
    fd = openSync(logFile, 'a')
    child = spawn('bash', [SCRIPT], {
      cwd: SCRIPT_DIR,
      env: {
        ...process.env,
        SIM_ROOT,
        RUN_ID: runId,
        LC_ALL: 'C',
        LANG: 'C',
        OV: OVERLAY_ROOT,
        MX_OVERLAY_ROOT: OVERLAY_ROOT,
      },
      stdio: ['ignore', fd, fd],
      detached: false,
    })
  } catch (e) {
    fail(ctx, 500, e instanceof Error ? e.message : String(e))
    return
  } finally {
    if (fd !== null) { try { closeSync(fd) } catch { /* 已关闭 */ } }
  }
  const startedAt = new Date().toISOString()
  running = { runId, pid: child.pid ?? null, startedAt, logFile }
  child.on('exit', (code, signal) => {
    lastExit = { runId, code, signal: signal ?? null, endedAt: new Date().toISOString() }
    child = null
    running = null
  })
  child.on('error', () => {
    child = null
    running = null
  })
  ctx.body = { ...statusBody() }
})

simLaunchRoutes.post('/stop', (ctx) => {
  if (!enabled()) {
    fail(ctx, 403, 'harness 启动未启用（SIM_HARNESS_LAUNCH=1）')
    return
  }
  if (writeDenied(ctx)) return
  if (!child) {
    fail(ctx, 409, '当前没有本进程拉起的 harness 推演')
    return
  }
  const pid = child.pid ?? null
  const runId = running?.runId ?? ''
  child.kill('SIGTERM')
  setTimeout(() => {
    if (child && pid) {
      try { process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ }
    }
  }, 10_000).unref?.()
  ctx.body = { ok: true, stopping: true, pid, runId }
})
