// overlay/custom/server/clusterinspector/inspector.ts
// 巡检编排：周期采集→检测→定级→处置（notify 必发 govbus system 域；safe-act 策略开关
// 默认关；destructive 永远人工门=只发 high 事件）。冷却去重防巡检自身变成事件风暴
// （run11 反应风暴教训）。timer=RunSpawner 同款 setInterval().unref()，env
// CLUSTER_INSPECTOR=off 关闭；台账=scheduled-loads-registry。
// govbus 走"动态 require + fail-soft"（跨域桥接纪律，同 approvals/evidence 先例）。

import type { ClusterSnapshot } from './collectors'
import { collectGateway, collectProfiles, collectProfileToolUsage, collectSessionTelemetry, collectSessions } from './collectors'
import { anomalyKey, convergenceEnabled, type ConvergenceItem, type ConvergenceReport, ConvergenceTracker } from './convergence'
import { detectAll, type Anomaly } from './detectors'
import { routeHintForDetector } from './route-hint'
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
  /** 在办卡注入（控制器接 kanban list --status running --json；缺省=该面 not wired） */
  getRunningCards?: () => Promise<Array<Record<string, unknown>>>
  /** 阻塞卡注入（card.blocked-stale 检测面，run19 熔断死等产品化；缺省=该面静默跳过） */
  getBlockedCards?: () => Promise<Array<Record<string, unknown>>>
  /** FAIL 判卡接线（review.fail-stall 复审环老化面，run20 22:34 复审链断棒实录） */
  getFailedVerdictCards?: () => Promise<Array<Record<string, unknown>>>
  /** 未认领开放卡接线（card.unassigned-stale 面，run20 r3 派单断棒实录） */
  getUnassignedCards?: () => Promise<Array<Record<string, unknown>>>
  /** 期望工作卡接线（work.expected-silent 面，run20 双盲区实录产品化） */
  getExpectedWorkCards?: () => Promise<Array<Record<string, unknown>>>
  /** 执行面探测接线（runtime.spawn-health 面，run20 00:30 瘫痪实录） */
  getSpawnHealth?: () => { ok: boolean; detail: string }
  /** 磁盘水位面（C4 增件）：df -P 解析为挂载点×已用%；未接线=合法空态 */
  getDiskUsage?: () => Array<{ mount: string; usedPct: number }>
  /** 交付分支推送情报接线（delivery.pushed 面，V8.33 持续集成） */
  getDeliveryBranchIntel?: () => Promise<Array<{ branch: string; localTip: string; originTip: string; pushed: boolean; profile: string }>>
  /** 联邦注册表快照注入（进度联邦模块；缺省=该面 not wired，D8 空转零误报） */
  getFederationSnapshot?: () => { ok: boolean; nowMs: number; machines: Array<{ machineId: string; lastSeenMs: number; activeTasks: number; activeAgents?: number }> }
  /** kanban 诊断注入（控制器接 kanban-service；缺省=该面 not wired） */
  getKanbanDiagnostics?: () => Promise<Array<Record<string, unknown>>>
  /** safe-act 注入：matrix 跟进提醒（缺省经 readGatewayMatrixEnv 凭据链裸发；测试可stub） */
  nudge?: (profile: string, summary: string, body?: string) => Promise<string | undefined>
  /** destructive 注入：审批放行后的网关重启（缺省动态 require autostart.restartGatewayForProfile；测试可stub） */
  restartGateway?: (profile: string) => Promise<unknown>
  /** 审批队列目录注入（destructive 请求/裁决文件面；缺省 ~/.hermes/approvals） */
  approvalsDir?: string
  /** safe-act 注入：僵尸任务回收（缺省 CLI 桥 hermes kanban reclaim；测试可stub） */
  reclaimTask?: (taskId: string) => Promise<string | undefined>
  /** govbus 发事件注入（缺省动态 require fail-soft） */
  emitGovEvent?: (e: { domain: 'system' | 'security'; severity: 'info' | 'warn' | 'high'; type: string; source: string; summary: string; payload?: Record<string, unknown> }) => void
  /** 安全告警中继数据源注入（M9，2026-10-16 安全轮）：缺省动态 require
   *  queryGovEvents 读 security/approval 域 high 级事件。测试可 stub。 */
  getSecurityEvents?: () => Array<{ eventId: string; ts: number; domain: string; severity: string; type: string; summary: string; refs?: Record<string, string> }>
  /** 安全告警发送注入（M9）：缺省走矩阵通道（同 nudgeStalled 凭据链）；测试可 stub */
  sendSecurityAlert?: (body: string, profile?: string) => Promise<string | undefined>
  now?: () => number
}

const COOLDOWN_MS = 15 * 60_000

/** 域路由（2026-10-16 安全轮 M4 治理中心裁定）：security.* 检测器的事件进
 *  security 域——治理中心面板按域筛选时工具告警归安全、集群健康归 system，不混流。 */
export function domainForDetector(detector: string): 'system' | 'security' {
  return detector.startsWith('security.') ? 'security' : 'system'
}

export class ClusterInspector {
  private readonly deps: InspectorDeps
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastSnapshot: ClusterSnapshot | null = null
  private lastOutcome: RunOutcome | null = null
  private readonly history: RunOutcome[] = []
  private readonly cooldown = new Map<string, number>()
  /** 同类风险收敛账本（用户 2026-10-14 指令：多轮工作有效性=同类风险持续收敛；
   *  熵增→升级/熔断/降级）。CLUSTER_INSPECTOR_CONVERGENCE=off 时为 null=全通道旁路 */
  private readonly convergence: ConvergenceTracker | null

  constructor(deps: InspectorDeps = {}) {
    this.deps = deps
    this.convergence = convergenceEnabled() ? new ConvergenceTracker(deps.hermesHome) : null
  }

  get snapshot(): ClusterSnapshot | null { return this.lastSnapshot }
  get lastRun(): RunOutcome | null { return this.lastOutcome }
  get runs(): RunOutcome[] { return [...this.history] }
  /** 收敛性报表（snapshot REST 面：指标+降级档案+熔断态） */
  get convergenceFace(): ConvergenceReport | null {
    return this.convergence ? this.convergence.report(this.deps.now?.() ?? Date.now()) : null
  }

  /** 当前降级档案集（有活跃熵增风险的负责人） */
  private degradedNow(): Set<string> {
    if (!this.convergence) return new Set()
    return this.convergence.degradedSet(this.convergence.items(this.deps.now?.() ?? Date.now()))
  }

  private emit(anomaly: Anomaly): void {
    // 失败路由标注（阿里调研轮 E 收尾件）：停滞族/失控环检测器随事件带 routeHint
    // （失败类型→回退点→携带物），无映射检测器不带；标注-only 不改派。
    const domain = domainForDetector(anomaly.detector)
    const routeHint = routeHintForDetector(anomaly.detector)
    const payload = { subject: anomaly.subject, ...anomaly.detail, ...(routeHint ? { routeHint } : {}) }
    if (this.deps.emitGovEvent) {
      this.deps.emitGovEvent({ domain, severity: anomaly.severity, type: `cluster.${anomaly.detector}`, source: 'cluster-inspector', summary: anomaly.summary, payload })
      return
    }
    try {
      // 动态 require + fail-soft（跨域桥接纪律；测试/独立运行时无 govbus 不炸）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { appendGovEvent } = require('../govbus/event-log')
      appendGovEvent({ domain, severity: anomaly.severity, type: `cluster.${anomaly.detector}`, source: 'cluster-inspector', summary: anomaly.summary, payload })
    } catch {
      // govbus 不可用：事件丢弃（巡检本体不受影响）
    }
  }

  /** ②matrix 跟进提醒（CLUSTER_INSPECTOR_NUDGE=on + ROOM 配置时）：会话卡死 → @agent 群消息唤醒 */
  /** 派发自愈（run19 凌晨实录根治：dispatcher 循环僵死 3h 零孵化+失败静默——CLI
   *  kanban dispatch 独立完好，直派孵化新工位=实证破局手）。触发=dispatcher.stuck
   *  告警（控制器侧滞留计时超阈）。幂等：同 subject 进程内只直派一次，直派失败
   *  退避到冷却期后由下轮重试（safeActedSubjects 复用 B4 幂等集）。 */
  private async dispatchSelfHeal(anomalies: Anomaly[]): Promise<string[]> {
    const acted: string[] = []
    if (process.env.CLUSTER_INSPECTOR_SAFE_ACT !== 'on') return acted
    for (const a of anomalies) {
      if (a.detector !== 'dispatcher.stuck') continue
      // 熵增熔断：直派反复无效（dispatcher 病灶持续不收敛）——停发，等人介入
      if (this.convergence?.isTripped(anomalyKey(a.detector, a.subject))) continue
      if (this.safeActedSubjects.has(a.subject)) continue
      this.safeActedSubjects.add(a.subject)
      try {
        const { execFile } = require('node:child_process')
        const out = await new Promise<string>((resolve, reject) => {
          execFile('hermes', ['kanban', 'dispatch', '--json'], {
            timeout: 120_000,
            env: { ...process.env, HERMES_HOME: process.env.HERMES_HOME || this.deps.hermesHome || require('node:os').homedir() + '/.hermes' },
          }, (e?: Error | null, stdout?: string) => e ? reject(e) : resolve(String(stdout ?? '')))
        })
        const spawned = (JSON.parse(out) as { spawned?: Array<{ task_id?: string }> }).spawned ?? []
        const ids = spawned.map((x) => x.task_id).filter(Boolean).join(',')
        acted.push(`dispatch-selfheal:${spawned.length ? ids : 'no-op'}`)
        this.deps.emitGovEvent?.({ domain: 'system', severity: 'info', type: 'cluster.dispatcher.selfheal', source: 'cluster-inspector', summary: `派发自愈：CLI 直派孵化 ${spawned.length} 工位（${ids || '无待派卡'}）`, payload: { subject: a.subject } })
      } catch (e) {
        acted.push(`dispatch-selfheal:failed:${(e as Error).message.slice(0, 80)}`)
      }
    }
    return acted
  }

  /** 已提醒催单档案的「NUDGE 后真做验证」账本（run20 17:42 嘴炮-不交卷形态产品化根治）：
   *  map entry = { firstNudgeAt, nudgeCount, lastRealWorkTsMs }。下轮巡检若该档案
   *  仍静默且 realWorkTsMs 未刷新→按 count 重催，3 次仍 0→升级报「需换档案接手」。 */
  private readonly nudgedProfiles = new Map<string, { firstNudgeAt: number; nudgeCount: number; lastRealWorkTsMs: number }>()

  private async nudgeStalled(anomalies: Anomaly[]): Promise<string[]> {
    const acted: string[] = []
    // 2026-10-11 默认开（用户指令；run14 六小时停摆实录：能力在而默认关=形同没有）。
    // CLUSTER_INSPECTOR_NUDGE=off 显式关；未配 ROOM 时静默跳过（安全缺省）。
    if (process.env.CLUSTER_INSPECTOR_NUDGE === 'off' || !process.env.CLUSTER_INSPECTOR_NUDGE_ROOM) return acted
    const nudge = this.deps.nudge ?? (async (profile: string, summary: string, customBody?: string) => {
      try {
        const { readGatewayMatrixEnv } = require('../matrix/gateway-env')
        const { matrixSend } = require('../matrix/chat-bridge')
        const sendEnv = readGatewayMatrixEnv(process.env)          // 发送者凭据（orchestrator/默认）
        const agentEnv = readGatewayMatrixEnv({ ...process.env, LOOP_MATRIX_PROFILE: profile }) as { userId?: string } | null
        if (!sendEnv || !agentEnv?.userId) return undefined
        // 提醒催单带缺口数字+分支情报+收尾动作（run19 推演层根治上移：模糊提醒"若仍在
        // 处理请继续"会被自认已完成的回话顶回——run19 三例实锤。改成点名卡清单+
        // 可执行收尾三步；配置 CLUSTER_INSPECTOR_NUDGE_REPO 后提醒催单词附「已见到你
        // 近期推送的分支+还差合并/结论」——干完活不收尾形态的带情报提醒催单。）
        const { probeBranchIntel } = require('./collectors') as typeof import('./collectors')
        const intel = probeBranchIntel(profile)
        const body = customBody ?? `⏰ 集群巡检提醒催单（真做静默）：${summary}。${intel}请收尾：①完成在办卡的剩余工作（交付物/结果落盘并 push）；②把在办卡推进到 done 或回执当前卡的实际缺口；③若被阻塞，回执阻塞原因。注意：仅回话不动手不清静默账，下轮巡检将持续跟进。`
        await matrixSend(sendEnv, process.env.CLUSTER_INSPECTOR_NUDGE_ROOM!, 'm.room.message',
          { msgtype: 'm.text', body, 'm.mentions': { user_ids: [agentEnv.userId] } },
          globalThis.fetch.bind(globalThis), `ci-${Date.now()}`)
        return 'nudged'
      } catch { return undefined }
    })
    const degraded = this.degradedNow()
    for (const a of anomalies) {
      // 交付锚验证两型也入提醒催单面（run19 上移 A+B）：锚缺失/陈旧分支的修复动作=推送，可催
      // card.blocked-stale 同入（run19 熔断死等产品化——用户 300s 时限：发现即提醒 assignee）
      if (a.detector !== 'session.stalled' && a.detector !== 'task.agent-silent'
        && a.detector !== 'delivery.anchor-missing' && a.detector !== 'delivery.branch-stale'
        && a.detector !== 'idle.with-work' && a.detector !== 'card.blocked-stale'
        && a.detector !== 'work.expected-silent'   // run20 期望对账：群消息派活形态唯一可见锚
        && a.detector !== 'delivery.pushed'         // V8.33 持续集成：未推分支催 push
        && a.detector !== 'session.starved') continue  // run20 复盘 D6：饥饿换会话令（专属文案，见下）
      const profile = (a.detail as { assignee?: string; profile?: string } | undefined)?.assignee?.trim()
        || (a.detail as { profile?: string } | undefined)?.profile?.trim()
        || a.subject.replace(/^profile:/, '').replace(/^branch:/, '').replace(/^session:/, '').replace(/@.*$/, '')
      // 降级先于熔断判（负责人有活跃熵增风险时不喂新活——领卡督办抑制；此语义
      // 优先于 idle.with-work 自身指纹的熔断，动作记 nudge-degrade 更可读）
      if (a.detector === 'idle.with-work' && degraded.has(profile)) {
        acted.push(`nudge-degrade:${profile}`)
        continue
      }
      // 熵增熔断：该指纹的提醒催单已反复无效（复发不收敛）——停发防回灌轰炸，等人介入
      if (this.convergence?.isTripped(anomalyKey(a.detector, a.subject))) {
        acted.push(`nudge-breaker:${profile}`)
        continue
      }
      // 真做验证：提醒催单后档案若仍无 realWorkTsMs 刷新→按重催档位执行（1→2→3，3 次仍 0→升级）
      // 取该档案当前 realWorkTsMs（来自最近一次 ProfileTail）
      const tailNow = this.lastSnapshot?.profiles?.tails?.find((t) => t.profile === profile)
      const rwNow = tailNow?.realWorkTsMs ?? 0
      const entry = this.nudgedProfiles.get(profile)
      if (entry) {
        // 已催过：判断真做是否刷新
        if (rwNow > entry.lastRealWorkTsMs + 1000) {
          // 真做刷新了→清账（重活轻催，不重催）
          this.nudgedProfiles.delete(profile)
          acted.push(`nudge-resumed:${profile}`)
          continue
        }
        // 真做未刷新：按 nudgeCount 决定动作
        const nextCount = entry.nudgeCount + 1
        if (nextCount >= 3) {
          // 3 次仍 0 升级：停发提醒催单，标记需换档案
          this.nudgedProfiles.set(profile, { firstNudgeAt: entry.firstNudgeAt, nudgeCount: nextCount, lastRealWorkTsMs: rwNow })
          acted.push(`nudge-escalate:${profile}:${nextCount}-nudges-no-realwork`)
          // 同时发一条升级消息让群内其他人能看到
          await nudge(profile, `【升级】已催 ${nextCount} 次仍无真做，疑似空转收场或唤醒即再死，建议换档案接手收尾`)
          continue
        }
        this.nudgedProfiles.set(profile, { firstNudgeAt: entry.firstNudgeAt, nudgeCount: nextCount, lastRealWorkTsMs: rwNow })
      } else {
        // 首次提醒催单：登记
        this.nudgedProfiles.set(profile, { firstNudgeAt: Date.now(), nudgeCount: 1, lastRealWorkTsMs: rwNow })
      }
      // 会话饥饿专属令（run20 复盘 D6）：通用收尾三步对饥饿是错误处方——
      // 空转×高上下文再催也没用，处方=换会话+显式命令清单（run20 wei 形态
      // 人工令的产品化：in 涨 out≤8token 连续 4 轮，人工换会话令救场）。
      const starvedBody = a.detector === 'session.starved'
        ? `🔄 换会话令（会话饥饿）：${a.summary}。请立即换新会话接续：新会话第一条消息只带「①当前卡号与剩余步骤 ②交接基线（commit/分支） ③下一条要执行的显式命令」三行，然后逐步执行显式命令清单（每条一行、做完回执）。本会话禁止再等待重试。`
        : undefined
      const r = await nudge(profile, a.summary, starvedBody)
      acted.push(`${profile}:${r ? (a.detector === 'session.starved' ? 'rotate-order-sent' : 'nudged') : 'nudge-failed'}`)
    }
    return acted
  }

  /** ④安全告警中继（M9，2026-10-16 安全轮预警先行版）：govbus 的 security/approval
   *  域 high 级事件 → Matrix 群消息。背景：事件流有 subscribe 面但生产零消费方，
   *  「写了没人看」= 告警幻觉。三层去重防刷屏（水位线/键冷却/每轮封顶），与
   *  nudgeStalled 的提醒催单走同一房间但消息类不同（治理告警 vs 催单），账本
   *  不共享（被催对象是「违规 profile」而非「静默档案」，合账会互相污染）。
   *  总开关 CLUSTER_INSPECTOR_SECURITY_RELAY 默认开，'off' 显式关。 */
  private securityRelayCooldown = new Map<string, number>()
  private lastRelayTs = 0
  private async relaySecurityEvents(): Promise<string[]> {
    const acted: string[] = []
    if (process.env.CLUSTER_INSPECTOR_SECURITY_RELAY === 'off') return acted
    if (!process.env.CLUSTER_INSPECTOR_NUDGE_ROOM) return acted  // 无房间=无处可发（同 nudgeStalled 安全缺省）
    let events: Array<{ eventId: string; ts: number; domain: string; severity: string; type: string; summary: string; refs?: Record<string, string> }>
    if (this.deps.getSecurityEvents) {
      try { events = this.deps.getSecurityEvents() } catch { return acted }
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { queryGovEvents } = require('../govbus/event-log')
        events = (queryGovEvents({ minSeverity: 'high', limit: 200 }) as Array<Record<string, unknown>>)
          .filter((e) => e.domain === 'security' || e.domain === 'approval')
          .map((e) => ({
            eventId: String(e.eventId ?? ''), ts: Number(e.ts ?? 0), domain: String(e.domain ?? ''),
            severity: String(e.severity ?? ''), type: String(e.type ?? ''), summary: String(e.summary ?? ''),
            refs: (e.refs && typeof e.refs === 'object' ? e.refs : {}) as Record<string, string>,
          }))
      } catch { return acted }  // govbus 不可用：静默（巡检本体不受影响）
    }
    const now = this.deps.now?.() ?? Date.now()
    // 重启防重放：首轮（水位线未初始化）只从「现在减 5 分钟宽限期」起算——
    // 否则重启后 lastRelayTs=0 会把事件流里全部历史 high 事件当新事件重发一遍。
    if (this.lastRelayTs === 0) this.lastRelayTs = now - 300_000
    // ①水位线：只取上次中继之后的新事件（跳过历史与重复轮询）
    const fresh = events.filter((e) => e.ts > this.lastRelayTs && e.ts <= now + 5000)
    // ②键冷却：type+profileId 组合键（同事件 100s 内重复的实测形态）
    const perRound: typeof fresh = []
    for (const e of fresh) {
      const key = `${e.type}|${e.refs?.profileId ?? ''}`
      const seen = this.securityRelayCooldown.get(key) ?? 0
      if (now - seen < COOLDOWN_MS) continue
      this.securityRelayCooldown.set(key, now)
      perRound.push(e)
    }
    // 水位线只按「过了冷却的事件」推进：若按全部 fresh 推进，被冷却抑制的事件
    // 会把水位垫高，后续同刻或更早的新事件被静默丢弃（冷却×水位线耦合缺陷）。
    if (perRound.length > 0) this.lastRelayTs = Math.max(this.lastRelayTs, ...perRound.map((e) => e.ts))
    if (perRound.length === 0) return acted
    // ③每轮封顶 2 条，超限聚合为一条汇总（防 enforce-gate 拒绝风暴演变成 mention 风暴）
    const send = this.deps.sendSecurityAlert ?? (async (body: string, profile?: string) => {
      try {
        const { readGatewayMatrixEnv } = require('../matrix/gateway-env')
        const { matrixSend } = require('../matrix/chat-bridge')
        const sendEnv = readGatewayMatrixEnv(process.env)
        if (!sendEnv) return undefined
        const payload: Record<string, unknown> = { msgtype: 'm.text', body }
        if (profile) {
          const agentEnv = readGatewayMatrixEnv({ ...process.env, LOOP_MATRIX_PROFILE: profile }) as { userId?: string } | null
          if (agentEnv?.userId) payload['m.mentions'] = { user_ids: [agentEnv.userId] }
        }
        await matrixSend(sendEnv, process.env.CLUSTER_INSPECTOR_NUDGE_ROOM!, 'm.room.message', payload, globalThis.fetch.bind(globalThis), `ci-sec-${Date.now()}`)
        return 'sent'
      } catch { return undefined }
    })
    const cap = 2
    for (const e of perRound.slice(0, cap)) {
      const profile = e.refs?.profileId
      const r = await send(`🚨 安全告警（${e.domain}/${e.type}）：${e.summary}${profile ? `（profile ${profile}）` : ''}——预警先行版：只告警不拦截，请人工复核。事件 ID ${e.eventId}`, profile)
      acted.push(`security-relay:${e.eventId}:${r ? 'sent' : 'failed'}`)
    }
    if (perRound.length > cap) {
      const rest = perRound.slice(cap)
      const r = await send(`🚨 安全告警汇总：本轮另有 ${rest.length} 条高危事件（${rest.map((e) => e.type).join('、')}），已按 15 分钟冷却去重，明细查治理事件流`, undefined)
      acted.push(`security-relay-aggregated:${rest.length}:${r ? 'sent' : 'failed'}`)
    }
    return acted
  }

  /** ③destructive 审批联动（CLUSTER_INSPECTOR_DESTRUCTIVE=approval）：high 级网关类异常   *  → 追加审批收件箱 mx-requests.jsonl 请求；后续轮询 responses/<eid>.json，approve 即
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
    // B4 幂等：同任务的 reclaim 进程内只做一次——重启环里巡检每轮都看到同一张
    // 僵尸卡，重复 reclaim 是副作用风暴（4be3a3b 教训同源；跨进程靠 hermes CLI 自身幂等）。
    const reclaim = this.deps.reclaimTask ?? ((id: string) => new Promise<string | undefined>((resolve) => {
      try {
        const { execFile } = require('node:child_process')
        execFile('hermes', ['kanban', 'reclaim', id, 'cluster-inspector-stale'], { timeout: 15_000 }, (e?: Error | null, out?: string) => resolve(e ? undefined : String(out ?? '').slice(0, 200)))
      } catch { resolve(undefined) }
    }))
    for (const a of anomalies) {
      if (a.detector !== 'kanban.stale-worker' || a.subject === 'board') continue
      // 熵增熔断：回收反复无效（同卡僵尸态复发不收敛）——停发，等人介入
      if (this.convergence?.isTripped(anomalyKey(a.detector, a.subject))) continue
      if (this.safeActedSubjects.has(a.subject)) continue
      this.safeActedSubjects.add(a.subject)
      const r = await reclaim(a.subject)
      acted.push(`${a.subject}:${r ? 'reclaimed' : 'reclaim-failed'}`)
    }
    return acted
  }
  /** safe-act 已处置主体（进程内幂等键，B4） */
  private safeActedSubjects = new Set<string>()
  private readySince = 0 // dispatcher 僵死滞留起点（ready 队列首次非空时刻）

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
      let cards: Array<Record<string, unknown>> = []
      let cardsOk = true
      let cardsErr: string | undefined
      if (this.deps.getRunningCards) {
        try {
          cards = await this.deps.getRunningCards()
        } catch (e) {
          cardsOk = false
          cardsErr = (e as Error).message
        }
      } else {
        cardsOk = false
        cardsErr = 'not wired'
      }
      const runningCards = cards.map((c) => ({
        id: String(c.task_id ?? c.id ?? ''),
        assignee: typeof c.assignee === 'string' ? c.assignee : undefined,
        title: typeof c.title === 'string' ? c.title : undefined,
        // 交付锚验证面（A+B 检测器）依赖的看板 tasks 表透传字段——漏传则
        // detectDeliveryAnchor 对每张卡在 branch_name 判空处直接跳过、永不触发。
        branch_name: typeof c.branch_name === 'string' ? c.branch_name : undefined,
        started_at: typeof c.started_at === 'number' || typeof c.started_at === 'string' ? c.started_at : undefined,
        completed_at: typeof c.completed_at === 'number' || typeof c.completed_at === 'string' ? c.completed_at : undefined,
        status: typeof c.status === 'string' ? c.status : undefined,
        // 任务正文透传（card.body-empty 检测面）
        body: typeof c.body === 'string' ? c.body : undefined,
      })).filter((c) => c.id)
      // 阻塞卡面（card.blocked-stale）：未接线=合法空态（可选面，同 sessionTelemetry 语义）
      let blockedCards: ClusterSnapshot['blockedCards']
      if (this.deps.getBlockedCards) {
        try {
          const rows = await this.deps.getBlockedCards()
          blockedCards = {
            ok: true,
            cards: rows.map((c) => ({
              id: String(c.task_id ?? c.id ?? ''),
              assignee: typeof c.assignee === 'string' ? c.assignee : undefined,
              title: typeof c.title === 'string' ? c.title : undefined,
              status: typeof c.status === 'string' ? c.status : undefined,
              // 「最后推进时刻」回退链（真实 tasks 表无 updated_at 列——run19 巡检实锤）：
              // last_heartbeat_at（worker 心跳）?? completed_at ?? created_at
              updated_at: pickLastTouched(c),
            })).filter((c) => c.id),
          }
        } catch (e) {
          blockedCards = { ok: false, error: (e as Error).message, cards: [] }
        }
      }
      // FAIL 判卡面（review.fail-stall 复审环老化）：未接线=合法空态（可选面，同 blockedCards 语义）
      let failedVerdictCards: ClusterSnapshot['failedVerdictCards']
      if (this.deps.getFailedVerdictCards) {
        try {
          const rows = await this.deps.getFailedVerdictCards()
          failedVerdictCards = {
            ok: true,
            cards: rows
              .filter((c) => String(c.result ?? '').toUpperCase().includes('FAIL'))
              .map((c) => ({
                id: String(c.task_id ?? c.id ?? ''),
                assignee: typeof c.assignee === 'string' ? c.assignee : undefined,
                title: typeof c.title === 'string' ? c.title : undefined,
                status: typeof c.status === 'string' ? c.status : undefined,
                result: typeof c.result === 'string' ? c.result : undefined,
                updated_at: pickLastTouched(c),
              })).filter((c) => c.id),
          }
        } catch (e) {
          failedVerdictCards = { ok: false, error: (e as Error).message, cards: [] }
        }
      }
      // 未认领开放卡面（card.unassigned-stale）：未接线=合法空态（可选面）
      let unassignedCards: ClusterSnapshot['unassignedCards']
      if (this.deps.getUnassignedCards) {
        try {
          const rows = await this.deps.getUnassignedCards()
          unassignedCards = {
            ok: true,
            cards: rows
              .filter((c) => !c.assignee || String(c.assignee).trim() === '' || String(c.assignee).trim().toLowerCase() === 'none')
              .map((c) => ({
                id: String(c.task_id ?? c.id ?? ''),
                assignee: undefined,
                title: typeof c.title === 'string' ? c.title : undefined,
                status: typeof c.status === 'string' ? c.status : undefined,
                body: typeof c.body === 'string' ? c.body : undefined,
                created_at: typeof c.created_at === 'number' || typeof c.created_at === 'string' ? c.created_at : undefined,
                updated_at: pickLastTouched(c),
              })).filter((c) => c.id),
          }
        } catch (e) {
          unassignedCards = { ok: false, error: (e as Error).message, cards: [] }
        }
      }
      // 期望工作卡面（work.expected-silent）：未接线=合法空态（可选面，同 unassignedCards 语义）
      let expectedWorkCards: ClusterSnapshot['expectedWorkCards']
      if (this.deps.getExpectedWorkCards) {
        try {
          const rows = await this.deps.getExpectedWorkCards()
          expectedWorkCards = {
            ok: true,
            cards: rows
              .filter((c) => c.assignee && String(c.assignee).trim() !== '' && String(c.assignee).trim().toLowerCase() !== 'none')
              .map((c) => ({
                id: String(c.task_id ?? c.id ?? ''),
                assignee: typeof c.assignee === 'string' ? c.assignee : undefined,
                title: typeof c.title === 'string' ? c.title : undefined,
                status: typeof c.status === 'string' ? c.status : undefined,
                body: typeof c.body === 'string' ? c.body : undefined,
                created_at: typeof c.created_at === 'number' || typeof c.created_at === 'string' ? c.created_at : undefined,
                updated_at: pickLastTouched(c),
              })).filter((c) => c.id),
          }
        } catch (e) {
          expectedWorkCards = { ok: false, error: (e as Error).message, cards: [] }
        }
      }
      // 执行面健康面（runtime.spawn-health）：未接线=合法空态
      let spawnHealth: { ok: boolean; detail: string } | undefined
      if (this.deps.getSpawnHealth) { try { spawnHealth = this.deps.getSpawnHealth() } catch { spawnHealth = { ok: false, detail: 'probe-error' } } }
      // 磁盘水位面（disk.capacity）：未接线=合法空态
      let diskUsage: Array<{ mount: string; usedPct: number }> | undefined
      if (this.deps.getDiskUsage) { try { diskUsage = this.deps.getDiskUsage() } catch { diskUsage = undefined } }
      // 交付分支推送情报面（delivery.pushed）：未接线=合法空态
      let deliveryBranchIntel: Array<{ branch: string; localTip: string; originTip: string; pushed: boolean; profile: string }> | undefined
      if (this.deps.getDeliveryBranchIntel) {
        try { deliveryBranchIntel = await this.deps.getDeliveryBranchIntel() } catch { deliveryBranchIntel = [] }
      }
      const snap: ClusterSnapshot = {
        ts: t0,
        gateway: await collectGateway(this.deps),
        sessions: collectSessions(this.deps),
        profiles: collectProfiles(this.deps),
        kanban: { ok: kanbanOk, error: kanbanErr, rows: kanbanRows },
        runningCards: { ok: cardsOk, error: cardsErr, cards: runningCards },
        blockedCards,
        failedVerdictCards,
        unassignedCards,
        expectedWorkCards,
        deliveryBranchIntel: deliveryBranchIntel as unknown as ClusterSnapshot['deliveryBranchIntel'],
        spawnHealth: spawnHealth as unknown as ClusterSnapshot['spawnHealth'],
        diskUsage: diskUsage as unknown as ClusterSnapshot['diskUsage'],
        federation: this.deps.getFederationSnapshot
          ? this.deps.getFederationSnapshot()
          : { ok: false, error: 'not wired', nowMs: t0, machines: [] },
        sessionTelemetry: collectSessionTelemetry(this.deps),
        // M6b teams 观测面（安全轮预警先行版）：逐 profile state.db 只读聚合。
        // 采集自身 fail-soft——单库打不开只缺该 profile，检测器见 toolUsage 缺席即静默。
        toolUsage: (() => {
          try { return collectProfileToolUsage(this.deps) } catch { return undefined }
        })(),
      }
      this.lastSnapshot = snap
      // dispatcher 僵死滞留计时（run19 根治）：ready 队列首次非空记起点，持续非空
      // 时长作为 dispatcherStuckMs 传入（默认阈 15min，env 可调）——检测器纯函数无
      // 状态，滞留语义由本侧维护；队列清空即复位。
      const readyNow = snap.runningCards.ok
        ? snap.runningCards.cards.filter((c) => String(c.status ?? '').toLowerCase() === 'ready').length : 0
      if (readyNow > 0) {
        if (this.readySince === 0) this.readySince = Date.now()
      } else this.readySince = 0
      const dispatcherStuckMs = this.readySince > 0 ? Date.now() - this.readySince : 0
      const anomalies: TimedAnomaly[] = detectAll(snap, {
        dispatcherStuckMs: dispatcherStuckMs >= Number(process.env.CLUSTER_INSPECTOR_STUCK_MS || 900_000) ? dispatcherStuckMs : 0,
      }).map((a) => ({ ...a, ts: snap.ts }))
      const now = this.deps.now?.() ?? Date.now()
      // 收敛性在场记账（每轮全量）：同类/同一事件风险的复发账
      this.convergence?.recordPresence(now, anomalies)
      let emitted = 0
      let suppressed = 0
      const trips: TimedAnomaly[] = []
      for (const a of anomalies) {
        const key = anomalyKey(a.detector, a.subject)
        const seen = this.cooldown.get(key) ?? 0
        if (now - seen < COOLDOWN_MS) {
          suppressed += 1
          continue
        }
        this.cooldown.set(key, now)
        if (this.convergence) {
          // 过冷却窗再发=一次复发（episode）；熵增态三联动：
          // ①升级风险项（复发异常升 high）②熔断（trip，one-shot）③降级（degradedSet）
          this.convergence.recordEpisode(now, key)
          const st = this.convergence.itemOf(key, now)
          if (st?.trend === 'diverging') {
            a.severity = 'high'
            a.detail = { ...(a.detail ?? {}), convergence: { episodes: st.episodes, firstSeenMs: st.firstSeenMs, tripped: st.tripped } }
            if (!st.tripped) {
              this.convergence.trip(now, key)
              trips.push(riskDivergingTrip(a, st))
            }
          }
        }
        this.emit(a)
        emitted += 1
      }
      // 熵增熔断事件（one-shot：每段熵增只发一次，常态走原异常的升级high+收敛面；
      // 同主体多来源同轮触发时按 cooldown 键去重，只发首条——账本明细在收敛面可见）
      for (const t of trips) {
        const tkey = anomalyKey(t.detector, t.subject)
        if (now - (this.cooldown.get(tkey) ?? 0) < COOLDOWN_MS) { suppressed += 1; continue }
        this.cooldown.set(tkey, now)
        this.emit(t)
        emitted += 1
      }
      const allAnomalies = [...anomalies, ...trips]
      const actions = [...(await this.safeAct(allAnomalies)), ...(await this.nudgeStalled(allAnomalies)), ...(await this.dispatchSelfHeal(allAnomalies)), ...(await this.destructiveGuard(allAnomalies)), ...(await this.relaySecurityEvents())]
      outcome = { ts: snap.ts, durationMs: Date.now() - t0, anomalies: allAnomalies, emitted, suppressedByCooldown: suppressed, actions }
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


/** blocked 卡「最后推进时刻」三重回退（tasks 表实无 updated_at 列；CLI 透传列实测） */
function pickLastTouched(c: Record<string, unknown>): number | string | undefined {
  for (const k of ['updated_at', 'last_heartbeat_at', 'completed_at', 'created_at']) {
    const v = c[k]
    if (typeof v === 'number' && v > 0) return v
    if (typeof v === 'string' && v && !Number.isNaN(Number(v))) return v
  }
  return undefined
}

/** 熵增熔断事件（one-shot）：同类风险复发不收敛→升级人工。routeHint 经
 *  DETECTOR_FAILURE_CLASS 的 risk.diverging→non_convergent 档自动携带。 */
function riskDivergingTrip(a: TimedAnomaly, st: ConvergenceItem): TimedAnomaly {
  return {
    detector: 'risk.diverging', subject: a.subject, severity: 'high',
    summary: `同类风险不收敛（熵增熔断）：${a.detector}（${a.subject}）已复发 ${st.episodes} 次且间隔未放宽（首见 ${new Date(st.firstSeenMs).toISOString()}）——按「同类风险是否持续收敛」的多轮有效性标准，判熵增。已熔断该风险的自动处置（提醒催单/回收/直派停发，反复无效=副作用风暴）；涉及负责人档案的同步降级（暂停派新卡，先收敛存量）；请人工介入（失败路由 non_convergent 档：带同错重试次数、已试方案与失败证据升级裁决）`,
    detail: { origin: a.detector, episodes: st.episodes, firstSeenMs: st.firstSeenMs, lastEpisodeMs: st.lastEpisodeMs, breaker: true, degraded: true },
    ts: a.ts,
  }
}
