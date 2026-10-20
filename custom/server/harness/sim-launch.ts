// overlay/custom/server/harness/sim-launch.ts
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
import { spawn, type ChildProcess } from 'child_process'
import { closeSync, existsSync, openSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/
const HERE = typeof __dirname !== 'undefined'
  ? __dirname
  : resolve(process.cwd(), 'custom/server/harness')
const OVERLAY_ROOT = resolve(HERE, '../../..')
const WORKSPACE_ROOT = resolve(OVERLAY_ROOT, '..')
const SCRIPT_DIR = process.env.SIM_HARNESS_DIR?.trim() || resolve(WORKSPACE_ROOT, 'simharness')
const SCRIPT = resolve(SCRIPT_DIR, 'aipay-scenario.sh')
const SIM_ROOT = process.env.SIM_ROOT?.trim() || process.env.OBS_SIM_ROOT?.trim() || resolve(WORKSPACE_ROOT, 'ncwk-sim-mux')
const DRIVER_LOCK = resolve(SIM_ROOT, '.driver.lock.d')

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
    ctx.status = 403
    ctx.body = {
      ok: false,
      error: 'harness 启动未启用（后端需以 SIM_HARNESS_LAUNCH=1 启动）——默认关闭是安全边界',
    }
    return
  }
  if (writeDenied(ctx)) return
  if (child) {
    ctx.status = 409
    ctx.body = { ok: false, error: `已有 harness 推演在跑：${running?.runId ?? 'unknown'}` }
    return
  }
  const body = ctx.request.body as { runId?: unknown } | undefined
  const runId = String(body?.runId ?? '').trim()
  if (!RUN_ID_RE.test(runId)) {
    ctx.status = 400
    ctx.body = { ok: false, error: 'runId 必须为字母/数字/._-（1-80 字符）' }
    return
  }
  if (!existsSync(SCRIPT)) {
    ctx.status = 503
    ctx.body = { ok: false, error: `harness 脚本不存在：${SCRIPT}` }
    return
  }
  if (!existsSync(SIM_ROOT)) {
    ctx.status = 503
    ctx.body = { ok: false, error: `SIM_ROOT 不存在：${SIM_ROOT}` }
    return
  }
  if (existsSync(DRIVER_LOCK)) {
    ctx.status = 409
    ctx.body = { ok: false, error: `已有 harness 驱动锁：${DRIVER_LOCK}（拒绝双开）` }
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
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
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
    ctx.status = 403
    ctx.body = { ok: false, error: 'harness 启动未启用（SIM_HARNESS_LAUNCH=1）' }
    return
  }
  if (writeDenied(ctx)) return
  if (!child) {
    ctx.status = 409
    ctx.body = { ok: false, error: '当前没有本进程拉起的 harness 推演' }
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
