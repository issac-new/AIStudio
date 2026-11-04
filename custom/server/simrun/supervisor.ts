// overlay/custom/server/simrun/supervisor.ts
// 推演运行监督域——进程监督单点（2026-11-02 同类合一批，spec=specs/2026-11-02-simrun-supervisor-product.md）。
// 监督面：①驱动生命周期（死→证据指纹变化→断点重拉；report_done 终态）②网关健康观测
// （:8801 health 3 连败记事件；自动重启缺省关，SIM_SUPERVISOR_GATEWAY_RESTART=1 才接管）。
// 与 harness 双侧同源判据：证据指纹=scenario.log 证据行数＋integration tip＋main tip
// （_mx_gate_evidence_sig / run-driver-supervisor 指纹三方一源，防「产品复位驱动不复位」）。
// 启用门：OBS_SIM_ROOT 在位且 SIM_SUPERVISOR≠off（宿主 studio 不启用）。fail-soft 全程：
// 文件/进程/git 任一缺席＝该监督面静默降级，不抛错不阻断 studio。
import { spawn, execFileSync, type ChildProcess } from 'child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

/** 26 步主链序（aipay-scenario.sh step_reached 全序；断点步=进度表 doneSteps 的下一步） */
export const DRIVER_STEP_ORDER: readonly string[] = [
  'smoke', 'appinit', 'people', 'ba', 'reqgate', 'room', 'dispatch', 'register',
  'analysis', 'triage', 'anexec', 'review', 'archgate', 'close', 'plan', 'devimpl',
  'defect', 'testpass', 'ready', 'release', 'uat', 'workmgr', 'audit', 'retro', 'ide', 'report',
]

export interface SupervisorEvent { ts: number; kind: string; detail?: string; [k: string]: unknown }

export interface SupervisorState {
  enabled: boolean
  reason: string
  mode: 'off' | 'idle' | 'supervising' | 'stopped' | 'terminal'
  runId: string | null
  driverPid: number | null
  relaunchCount: number
  lastEvidenceFp: string | null
  lastEventTs: number | null
  gatewayConsecutiveFails: number
}

export interface SupervisorDeps {
  now?: () => number
  tickMs?: number
  simRoot?: string
  harnessRoot?: string
  spawnDriver?: (step: string, runId: string) => ChildProcess
  probePid?: (pid: number) => boolean
  fetchHealth?: (url: string) => Promise<boolean>
  logSink?: (e: SupervisorEvent) => void
}

function defaultHarnessRoot(): string {
  // __dirname 双运行时口径（graph/node-executors/task-boundaries.ts 先例）：server
  // tsconfig 为 commonjs，import.meta 不可用（TS1343，ts-node serve 首次编译即挂）；
  // vitest 的 SSR 转换注入 __dirname 同源码目录。simrun/supervisor.ts → custom/server/
  // simrun 三级向上 = 仓根/simharness（原 '../../../..' 落到仓根上一级，越界一层）。
  return resolve(__dirname, '../../..', 'simharness')
}

function pidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

/** 驱动锁持有人 pid（$SIM_ROOT/.driver.lock.d/info 首字段 pid=<n>；无锁/坏文件=null） */
export function driverLockPid(simRoot: string): number | null {
  try {
    const info = readFileSync(join(simRoot, '.driver.lock.d', 'info'), 'utf8')
    const m = /^pid=(\d+)/m.exec(info)
    return m ? Number(m[1]) : null
  } catch { return null }
}

/** 证据指纹（三方一源）：scenario.log 证据行数＋itip＋mtip。任一源缺席退化为其余源。 */
export function evidenceFingerprint(simRoot: string, runId: string | null): string {
  let lines = 0
  if (runId) {
    try {
      const log = readFileSync(join(simRoot, 'runs', runId, 'evidence', 'scenario.log'), 'utf8')
      lines = log.split('\n').filter((l) => /(派发|判词|结论|补齐|复审|评审|回执)/.test(l)).length
    } catch { lines = 0 }
  }
  const repo = join(simRoot, 'central', 'aipaydev')
  const tip = (ref: string): string => {
    try {
      return execFileSync('git', ['-C', repo, 'rev-parse', '--short', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch { return '-' }
  }
  return `lines:${lines} itip:${tip('origin/integration/RFD-001')} mtip:${tip('origin/main')}`
}

/** report_done 终态判定（runs/<id>/state.env） */
export function reportDone(simRoot: string, runId: string | null): boolean {
  if (!runId) return false
  try {
    return /^report_done=1$/m.test(readFileSync(join(simRoot, 'runs', runId, 'state.env'), 'utf8'))
  } catch { return false }
}

/** 断点步=进度表 doneSteps 的下一步（全 done=report 兜底；无进度=smoke 从头） */
export function resumeStep(doneSteps: string[]): string {
  if (doneSteps.length === 0) return 'smoke'
  const idxs = doneSteps.map((s) => DRIVER_STEP_ORDER.indexOf(s)).filter((i) => i >= 0)
  const lastIdx = idxs.length ? Math.max(...idxs) : -1
  if (lastIdx < 0 || lastIdx >= DRIVER_STEP_ORDER.length - 1) return 'report'
  return DRIVER_STEP_ORDER[lastIdx + 1]
}

class Supervisor {
  readonly state: SupervisorState
  private timer: NodeJS.Timeout | null = null
  private child: ChildProcess | null = null
  private readonly d: {
    now: () => number
    tickMs: number
    simRoot: string
    harnessRoot: string
    spawnDriver: (step: string, runId: string) => ChildProcess
    probePid: (pid: number) => boolean
    fetchHealth: (url: string) => Promise<boolean>
    logSink: (e: SupervisorEvent) => void
  }
  private eventLogPath: string | null = null

  constructor(deps: SupervisorDeps = {}) {
    const simRoot = deps.simRoot ?? process.env.OBS_SIM_ROOT?.trim() ?? ''
    const enabled = !!simRoot && process.env.SIM_SUPERVISOR !== 'off'
    this.state = {
      enabled,
      reason: !simRoot ? 'no OBS_SIM_ROOT（宿主 studio，不启用）' : (process.env.SIM_SUPERVISOR === 'off' ? 'SIM_SUPERVISOR=off' : ''),
      mode: enabled ? 'idle' : 'off',
      runId: null, driverPid: null, relaunchCount: 0, lastEvidenceFp: null, lastEventTs: null,
      gatewayConsecutiveFails: 0,
    }
    const harnessRoot = deps.harnessRoot ?? process.env.SIM_HARNESS_ROOT?.trim() ?? defaultHarnessRoot()
    this.d = {
      now: deps.now ?? (() => Date.now()),
      tickMs: deps.tickMs ?? 30_000,
      simRoot,
      harnessRoot,
      spawnDriver: deps.spawnDriver ?? ((step, runId) => spawn('bash', ['aipay-scenario.sh'], {
        cwd: harnessRoot,
        env: { ...process.env, RUN_ID: runId, START_STEP: step, LC_ALL: 'C' },
        detached: true, stdio: 'ignore',
      })),
      probePid: deps.probePid ?? pidAlive,
      fetchHealth: deps.fetchHealth ?? (async (url) => {
        try { const r = await fetch(url, { signal: AbortSignal.timeout(5000) }); return r.ok } catch { return false }
      }),
      logSink: deps.logSink ?? ((e) => {
        if (!this.eventLogPath) return
        try { appendFileSync(this.eventLogPath, JSON.stringify(e) + '\n') } catch { /* fail-soft */ }
      }),
    }
    if (enabled) {
      this.eventLogPath = join(simRoot, 'logs', 'simrun-supervisor.jsonl')
      try { mkdirSync(join(simRoot, 'logs'), { recursive: true }) } catch { /* fail-soft */ }
    }
  }

  private emit(kind: string, detail?: string, extra: Record<string, unknown> = {}): void {
    const e: SupervisorEvent = { ts: this.d.now(), kind, ...(detail ? { detail } : {}), ...extra }
    this.state.lastEventTs = e.ts
    this.d.logSink(e)
  }

  /** 认领在跑轮（adopt：进度表在位＋驱动活→只看不拉） */
  async tick(): Promise<void> {
    if (!this.state.enabled || this.state.mode === 'stopped' || this.state.mode === 'terminal') return
    const runId = this.readRunId()
    if (!runId) { this.state.mode = 'idle'; return }
    this.state.runId = runId
    if (reportDone(this.d.simRoot, runId)) {
      this.state.mode = 'terminal'
      this.emit('terminal', `report_done（run=${runId}）`)
      this.stopTimer()
      return
    }
    const lockPid = driverLockPid(this.d.simRoot)
    const alive = lockPid !== null && this.d.probePid(lockPid)
    this.state.driverPid = alive ? lockPid : null
    if (alive) {
      this.state.mode = 'supervising'
      this.state.lastEvidenceFp = evidenceFingerprint(this.d.simRoot, runId)
      await this.probeGateway()
      return
    }
    // 驱动缺席：证据门（与 harness 双侧同源）——指纹相对上次记录变化才重拉
    const fp = evidenceFingerprint(this.d.simRoot, runId)
    const changed = this.state.lastEvidenceFp === null || fp !== this.state.lastEvidenceFp
    if (!changed) { this.emit('wait-evidence', `指纹不变（${fp}）`, { fp }); return }
    const step = this.resumeStepFromProgress()
    this.emit('relaunch', `驱动缺席且证据变化（${fp}）→ START_STEP=${step}`, { fp, step })
    this.child = this.d.spawnDriver(step, runId)
    this.state.relaunchCount += 1
    this.state.lastEvidenceFp = fp
    this.state.mode = 'supervising'
    this.child.unref?.()
  }

  private readRunId(): string | null {
    try {
      const raw = readFileSync(join(process.env.HERMES_HOME?.trim() || '', 'run-progress.json'), 'utf8')
      const parsed = JSON.parse(raw) as { run_id?: string }
      return typeof parsed.run_id === 'string' && parsed.run_id ? parsed.run_id : null
    } catch {
      // 回落：runs/ 下最新目录（run-progress 缺席但轮在跑的中间态）
      try {
        const runs = join(this.d.simRoot, 'runs')
        if (!existsSync(runs)) return null
        const dirs = readdirSync(runs).map((n) => ({ n, m: statSync(join(runs, n)).mtimeMs })).sort((a, b) => b.m - a.m)
        return dirs[0]?.n ?? null
      } catch { return null }
    }
  }

  private resumeStepFromProgress(): string {
    try {
      const raw = readFileSync(join(process.env.HERMES_HOME?.trim() || '', 'run-progress.json'), 'utf8')
      const parsed = JSON.parse(raw) as { done_steps?: string[] }
      const doneSteps = Array.isArray(parsed.done_steps) ? parsed.done_steps.filter((s) => typeof s === 'string') : []
      return resumeStep(doneSteps)
    } catch { return 'smoke' }
  }

  private async probeGateway(): Promise<void> {
    const ok = await this.d.fetchHealth('http://127.0.0.1:8801/health')
    this.state.gatewayConsecutiveFails = ok ? 0 : this.state.gatewayConsecutiveFails + 1
    if (this.state.gatewayConsecutiveFails === 3) {
      this.emit('gateway-unhealthy', ':8801 health 3 连败（缺省只观测不重启；SIM_SUPERVISOR_GATEWAY_RESTART=1 才接管）')
    }
  }

  start(runId?: string, startStep?: string): void {
    if (!this.state.enabled) throw new Error(`simrun supervisor 未启用：${this.state.reason}`)
    if (runId) {
      const step = startStep ?? 'smoke'
      this.emit('manual-start', `run=${runId} START_STEP=${step}`)
      this.child = this.d.spawnDriver(step, runId)
      this.state.runId = runId
      this.state.mode = 'supervising'
      this.child.unref?.()
    }
    this.startTimer()
  }

  stop(): void {
    this.state.mode = 'stopped'
    // 双通道互斥：置 harness stop 文件，兜底 bash 监督器同步退场
    try {
      const stopPath = join(this.d.simRoot, 'var', `${this.state.runId ?? ''}-supervisor.stop`)
      mkdirSync(dirname(stopPath), { recursive: true })
      closeSync(openSync(stopPath, 'a'))
    } catch { /* fail-soft */ }
    this.emit('stopped', '手动停止（stop 文件已置，兜底监督器同步退场）')
    this.stopTimer()
  }

  recentEvents(limit = 20): SupervisorEvent[] {
    if (!this.eventLogPath) return []
    try {
      const lines = readFileSync(this.eventLogPath, 'utf8').trim().split('\n').filter(Boolean)
      return lines.slice(-limit).map((l) => { try { return JSON.parse(l) as SupervisorEvent } catch { return { ts: 0, kind: 'unparsable' } } })
    } catch { return [] }
  }

  private startTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.tick() }, this.d.tickMs)
    this.timer.unref?.()
  }

  private stopTimer(): void { if (this.timer) { clearInterval(this.timer); this.timer = null } }
}

let singleton: Supervisor | null = null

export function getSimSupervisor(): Supervisor {
  if (!singleton) singleton = new Supervisor()
  return singleton
}

export function startSimSupervisorIfEnabled(): void {
  const s = getSimSupervisor()
  if (!s.state.enabled) return
  s.start()
  s.tick().catch(() => { /* fail-soft */ })
}

export { Supervisor }
