// overlay/custom/server/clusterinspector/inspector.ts
// 巡检编排：周期采集→检测→定级→处置（notify 必发 govbus system 域；safe-act 策略开关
// 默认关；destructive 永远人工门=只发 high 事件）。冷却去重防巡检自身变成事件风暴
// （run11 反应风暴教训）。timer=RunSpawner 同款 setInterval().unref()，env
// CLUSTER_INSPECTOR=off 关闭；台账=scheduled-loads-registry。
// govbus 走"动态 require + fail-soft"（跨域桥接纪律，同 approvals/evidence 先例）。

import type { ClusterSnapshot } from './collectors'
import { collectGateway, collectProfiles, collectSessions } from './collectors'
import { detectAll, type Anomaly } from './detectors'

export type RunOutcome = {
  ts: number
  durationMs: number
  anomalies: Anomaly[]
  emitted: number
  suppressedByCooldown: number
  error?: string
}

export interface InspectorDeps {
  hermesHome?: string
  gatewayBase?: string
  /** kanban 诊断注入（控制器接 kanban-service；缺省=该面 not wired） */
  getKanbanDiagnostics?: () => Promise<Array<Record<string, unknown>>>
  /** govbus 发事件注入（缺省动态 require fail-soft） */
  emitGovEvent?: (e: { domain: 'system'; severity: 'info' | 'warn' | 'high'; type: string; source: string; summary: string; payload?: Record<string, unknown> }) => void
  now?: () => number
}

const COOLDOWN_MS = 15 * 60_000

export class ClusterInspector {
  private readonly deps: InspectorDeps
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastSnapshot: ClusterSnapshot | null = null
  private lastOutcome: RunOutcome | null = null
  private readonly history: RunOutcome[] = []
  private readonly cooldown = new Map<string, number>()

  constructor(deps: InspectorDeps = {}) {
    this.deps = deps
  }

  get snapshot(): ClusterSnapshot | null { return this.lastSnapshot }
  get lastRun(): RunOutcome | null { return this.lastOutcome }
  get runs(): RunOutcome[] { return [...this.history] }

  private emit(anomaly: Anomaly): void {
    if (this.deps.emitGovEvent) {
      this.deps.emitGovEvent({ domain: 'system', severity: anomaly.severity, type: `cluster.${anomaly.detector}`, source: 'cluster-inspector', summary: anomaly.summary, payload: { subject: anomaly.subject, ...anomaly.detail } })
      return
    }
    try {
      // 动态 require + fail-soft（跨域桥接纪律；测试/独立运行时无 govbus 不炸）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { appendGovEvent } = require('../govbus/event-log')
      appendGovEvent({ domain: 'system', severity: anomaly.severity, type: `cluster.${anomaly.detector}`, source: 'cluster-inspector', summary: anomaly.summary, payload: { subject: anomaly.subject, ...anomaly.detail } })
    } catch {
      // govbus 不可用：事件丢弃（巡检本体不受影响）
    }
  }

  async runOnce(): Promise<RunOutcome> {
    const t0 = Date.now()
    if (this.running) {
      return { ts: t0, durationMs: 0, anomalies: [], emitted: 0, suppressedByCooldown: 0, error: 'previous run still in flight' }
    }
    this.running = true
    let outcome: RunOutcome
    try {
      let kanbanRows: Array<Record<string, unknown>> = []
      let kanbanOk = true
      let kanbanErr: string | undefined
      if (this.deps.getKanbanDiagnostics) {
        try {
          kanbanRows = await this.deps.getKanbanDiagnostics()
        } catch (e) {
          kanbanOk = false
          kanbanErr = (e as Error).message
        }
      } else {
        kanbanOk = false
        kanbanErr = 'not wired'
      }
      const snap: ClusterSnapshot = {
        ts: t0,
        gateway: await collectGateway(this.deps),
        sessions: collectSessions(this.deps),
        profiles: collectProfiles(this.deps),
        kanban: { ok: kanbanOk, error: kanbanErr, rows: kanbanRows },
      }
      this.lastSnapshot = snap
      const anomalies = detectAll(snap)
      const now = this.deps.now?.() ?? Date.now()
      let emitted = 0
      let suppressed = 0
      for (const a of anomalies) {
        const key = `${a.detector}::${a.subject}`
        const seen = this.cooldown.get(key) ?? 0
        if (now - seen < COOLDOWN_MS) {
          suppressed += 1
          continue
        }
        this.cooldown.set(key, now)
        this.emit(a)
        emitted += 1
      }
      outcome = { ts: snap.ts, durationMs: Date.now() - t0, anomalies, emitted, suppressedByCooldown: suppressed }
    } catch (e) {
      outcome = { ts: t0, durationMs: Date.now() - t0, anomalies: [], emitted: 0, suppressedByCooldown: 0, error: (e as Error).message }
    } finally {
      this.running = false
    }
    this.lastOutcome = outcome
    this.history.push(outcome)
    if (this.history.length > 50) this.history.shift()
    return outcome
  }

  /** 周期巡检环（RunSpawner 先例：.unref() 不拖进程退出；重入保护在 runOnce） */
  start(intervalMs = 60_000): void {
    if (this.timer) return
    this.timer = setInterval(() => { void this.runOnce() }, intervalMs)
    this.timer.unref()
    void this.runOnce()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}

/** 进程级单例：装配点（patch 582 routes import 时）调用 ensureInspector()；env 可关 */
let singleton: ClusterInspector | null = null

export function ensureInspector(deps: InspectorDeps = {}): ClusterInspector {
  if (!singleton) singleton = new ClusterInspector(deps)
  return singleton
}

export function startInspectorIfEnabled(deps: InspectorDeps = {}): ClusterInspector | null {
  if (process.env.CLUSTER_INSPECTOR === 'off') return null
  const insp = ensureInspector(deps)
  insp.start(Number(process.env.CLUSTER_INSPECTOR_INTERVAL_MS ?? 60_000))
  return insp
}
