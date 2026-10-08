// overlay/custom/server/clusterinspector/inspector.ts
// 巡检编排：周期采集→检测→定级→处置（notify 必发 govbus system 域；safe-act 策略开关
// 默认关；destructive 永远人工门=只发 high 事件）。冷却去重防巡检自身变成事件风暴
// （run11 反应风暴教训）。timer=RunSpawner 同款 setInterval().unref()，env
// CLUSTER_INSPECTOR=off 关闭；台账=scheduled-loads-registry。
// govbus 走"动态 require + fail-soft"（跨域桥接纪律，同 approvals/evidence 先例）。

import type { ClusterSnapshot } from './collectors'
import { collectGateway, collectProfiles, collectSessions } from './collectors'
import { detectAll, type Anomaly } from './detectors'
type TimedAnomaly = Anomaly & { ts?: number }

export type RunOutcome = {
  ts: number
  durationMs: number
  anomalies: Anomaly[]
  emitted: number
  suppressedByCooldown: number
  actions?: string[]
  error?: string
}

export interface InspectorDeps {
  hermesHome?: string
  gatewayBase?: string
  /** kanban 诊断注入（控制器接 kanban-service；缺省=该面 not wired） */
  getKanbanDiagnostics?: () => Promise<Array<Record<string, unknown>>>
  /** safe-act 注入：matrix 催办（缺省经 readGatewayMatrixEnv 凭据链裸发；测试可stub） */
  nudge?: (profile: string, summary: string) => Promise<string | undefined>
  /** destructive 注入：审批放行后的网关重启（缺省动态 require autostart.restartGatewayForProfile；测试可stub） */
  restartGateway?: (profile: string) => Promise<unknown>
  /** 审批队列目录注入（destructive 请求/裁决文件面；缺省 ~/.hermes/approvals） */
  approvalsDir?: string
  /** safe-act 注入：僵尸任务回收（缺省 CLI 桥 hermes kanban reclaim；测试可stub） */
  reclaimTask?: (taskId: string) => Promise<string | undefined>
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

  /** ②matrix 催办（CLUSTER_INSPECTOR_NUDGE=on + ROOM 配置时）：会话卡死 → @agent 群消息唤醒 */
  private async nudgeStalled(anomalies: Anomaly[]): Promise<string[]> {
    const acted: string[] = []
    if (process.env.CLUSTER_INSPECTOR_NUDGE !== 'on' || !process.env.CLUSTER_INSPECTOR_NUDGE_ROOM) return acted
    const nudge = this.deps.nudge ?? (async (profile: string, summary: string) => {
      try {
        const { readGatewayMatrixEnv } = require('../matrix/gateway-env')
        const { matrixSend } = require('../matrix/chat-bridge')
        const sendEnv = readGatewayMatrixEnv(process.env)          // 发送者凭据（orchestrator/默认）
        const agentEnv = readGatewayMatrixEnv({ ...process.env, LOOP_MATRIX_PROFILE: profile }) as { userId?: string } | null
        if (!sendEnv || !agentEnv?.userId) return undefined
        const body = `⏰ 集群巡检催办：${summary}。若仍在处理请继续；若已卡住请收口或回执阻塞原因。`
        await matrixSend(sendEnv, process.env.CLUSTER_INSPECTOR_NUDGE_ROOM!, 'm.room.message',
          { msgtype: 'm.text', body, 'm.mentions': { user_ids: [agentEnv.userId] } },
          globalThis.fetch.bind(globalThis), `ci-${Date.now()}`)
        return 'nudged'
      } catch { return undefined }
    })
    for (const a of anomalies) {
      if (a.detector !== 'session.stalled') continue
      const profile = a.subject.replace(/^profile:/, '')
      const r = await nudge(profile, a.summary)
      acted.push(`${profile}:${r ? 'nudged' : 'nudge-failed'}`)
    }
    return acted
  }

  /** ③destructive 审批联动（CLUSTER_INSPECTOR_DESTRUCTIVE=approval）：high 级网关类异常
   *  → 追加审批收件箱 mx-requests.jsonl 请求；后续轮询 responses/<eid>.json，approve 即
   *  调 autostart.restartGatewayForProfile（上游现成编排：stop→start→waitForRunning）。 */
  private destructiveQueue = new Map<string, string>() // eid → profile
  private async destructiveGuard(anomalies: Anomaly[]): Promise<string[]> {
    const acted: string[] = []
    if (process.env.CLUSTER_INSPECTOR_DESTRUCTIVE !== 'approval') return acted
    const { join } = require('node:path')
    const { appendFileSync, existsSync, readFileSync, mkdirSync } = require('node:fs')
    const dir = this.deps.approvalsDir ?? join(process.env.HERMES_HOME || require('node:os').homedir() + '/.hermes', 'approvals')
    // 重建挂起集（跨实例/重启恢复）：扫队列文件中未裁决的 cluster-inspector-* 请求
    try {
      const q0 = join(dir, 'mx-requests.jsonl')
      if (existsSync(q0)) {
        for (const line of readFileSync(q0, 'utf-8').split('\n').filter(Boolean)) {
          try {
            const e = JSON.parse(line) as { eid?: string; profile?: string }
            const actedMarker = join(dir, 'responses', `${e.eid}.ci-acted.json`)
            if (e.eid?.startsWith('cluster-inspector-') && !existsSync(actedMarker)) {
              this.destructiveQueue.set(e.eid, e.profile ?? 'default')
            }
          } catch { /* 坏行跳过 */ }
        }
      }
    } catch { /* fail-soft */ }
    // 新请求：high 级且 detector 指向网关本体
    for (const a of anomalies as TimedAnomaly[]) {
      if (a.severity !== 'high' || !a.detector.startsWith('gateway.')) continue
      const eid = `cluster-inspector-${a.ts ?? Date.now()}-${a.detector.replace(/\W+/g, '_')}`
      try {
        mkdirSync(dir, { recursive: true })
        const q = join(dir, 'mx-requests.jsonl')
        if (existsSync(q) && (readFileSync(q, 'utf-8').includes(eid) || this.destructiveQueue.has(eid))) continue
        appendFileSync(q, `${JSON.stringify({ eid, title: `集群巡检：建议重启网关（${a.detector}）`, detail: a.summary, profile: 'default', createdAt: new Date().toISOString() })}
`)
        this.destructiveQueue.set(eid, 'default')
        acted.push(`approval-requested:${eid}`)
      } catch { /* fail-soft */ }
    }
    // 裁决轮询：approve → 重启一次
    for (const [eid, profile] of [...this.destructiveQueue]) {
      const resp = join(dir, 'responses', `${eid}.json`)
      try {
        if (!existsSync(resp)) continue
        const decision = JSON.parse(readFileSync(resp, 'utf-8')) as { decision?: string }
        this.destructiveQueue.delete(eid)
        try { require('node:fs').writeFileSync(join(dir, 'responses', `${eid}.ci-acted.json`), JSON.stringify({ ts: Date.now() })) } catch { /* fail-soft */ }
        if (String(decision.decision ?? '').toLowerCase().startsWith('approve')) {
          const restart = this.deps.restartGateway ?? (async (pf: string) => {
            // 兄弟布局字面量 require（patch 525 build-escape 同款前缀，任意布局经
            // build-server.mjs 的 overlay-upstream-escape 插件重锚到本仓根解析）；
            // vitest 下由 deps.restartGateway 注入不触此路径
            const { restartGatewayForProfile } =
            require('../../../../upstream/hermes-studio/packages/server/src/modules/hermes/services/gateway/autostart')
            return restartGatewayForProfile(pf)
          })
          try {
            await restart(profile)
            acted.push(`gateway-restarted:${profile}`)
          } catch (e) {
            acted.push(`gateway-restart-failed:${(e as Error).message.slice(0, 80)}`)
          }
        } else {
          acted.push(`approval-rejected:${eid}`)
        }
      } catch { /* fail-soft */ }
    }
    return acted
  }

  private async safeAct(anomalies: Anomaly[]): Promise<string[]> {
    const acted: string[] = []
    if (process.env.CLUSTER_INSPECTOR_SAFE_ACT !== 'on') return acted
    const reclaim = this.deps.reclaimTask ?? ((id: string) => new Promise<string | undefined>((resolve) => {
      try {
        const { execFile } = require('node:child_process')
        execFile('hermes', ['kanban', 'reclaim', id, 'cluster-inspector-stale'], { timeout: 15_000 }, (e?: Error | null, out?: string) => resolve(e ? undefined : String(out ?? '').slice(0, 200)))
      } catch { resolve(undefined) }
    }))
    for (const a of anomalies) {
      if (a.detector !== 'kanban.stale-worker' || a.subject === 'board') continue
      const r = await reclaim(a.subject)
      acted.push(`${a.subject}:${r ? 'reclaimed' : 'reclaim-failed'}`)
    }
    return acted
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
      const anomalies: TimedAnomaly[] = detectAll(snap).map((a) => ({ ...a, ts: snap.ts }))
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
      const actions = [...(await this.safeAct(anomalies)), ...(await this.nudgeStalled(anomalies)), ...(await this.destructiveGuard(anomalies))]
      outcome = { ts: snap.ts, durationMs: Date.now() - t0, anomalies, emitted, suppressedByCooldown: suppressed, actions }
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
