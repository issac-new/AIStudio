// overlay/custom/server/clusterinspector/detectors.ts
// 检测层：纯函数，输入 ClusterSnapshot → Anomaly[]。五检测器对应 run11 实录病灶：
// D1 网关失联/降级、D2 槽位膨胀、D3 僵尸 worker、D4 会话卡死、D5 异常风暴（轮内聚簇升级）。

import type { ClusterSnapshot, ProfileTail } from './collectors'

export type AnomalySeverity = 'info' | 'warn' | 'high'

export interface Anomaly {
  detector: string
  /** 异常主体（网关/平台/profile/task）——冷却去重的配对键之一 */
  subject: string
  severity: AnomalySeverity
  summary: string
  detail?: Record<string, unknown>
}

export interface DetectOptions {
  /** active_agents 超出注册表活条目的容忍差（默认 5；≥inflateHigh 直接 high） */
  inflateTolerance?: number
  inflateHigh?: number
  /** D4 静默判卡阈值 ms（默认 300000=5min） */
  stallQuietMs?: number
  /** 阻塞卡停滞阈值 ms（默认 300000=5min——用户 2026-10-14 裁定：任何异常 300s 内识别；
   *  run19 G5 熔断死等 14400s+ 实锤的产品化常量） */
  blockedStaleMs?: number
  /** 派发通道僵死滞留时长 ms（控制器侧维护滞留起点传入；0=不检测） */
  dispatcherStuckMs?: number
  /** 负载不均衡判阈：单档案在办卡数 ≥ 此值且存在零卡档案（默认 3） */
  imbalanceMax?: number
  /** D7 在办卡·档案静默阈值 ms（默认 900000=15min；日志尾无错也算） */
  agentSilentMs?: number
  /** D8 跨机静默阈值 ms（默认 900000=15min；空闲机器不报） */
  machineSilentMs?: number
  /** D5 轮内同检测器异常数达到该值即追加风暴事件（默认 3） */
  stormClusterSize?: number
  /** D9 上下文水位告警阈（百分比，默认 85；≥watermarkHighPct 升 high） */
  watermarkWarnPct?: number
  watermarkHighPct?: number
  /** D10 空转连击告警阈（默认 4；runtime 侧轮换触发在 8，巡检先行预警） */
  emptyStreakLimit?: number
  nowMs?: number
}

const STALL_TAIL_RE = /ERROR |Traceback|TimeoutError|timed? ?out|gave_up/i

/** D1 网关失联/降级：探测失败或 gateway_state 非 running；platforms needs_attention 逐面 warn */
export function detectGateway(snap: ClusterSnapshot): Anomaly[] {
  const out: Anomaly[] = []
  const gw = snap.gateway
  if (gw.error && !gw.state) {
    out.push({ detector: 'gateway.unreachable', subject: 'gateway', severity: 'high', summary: `网关不可达：${gw.error}`, detail: { probe: gw.probe } })
  }
  const st = gw.state as { gateway_state?: string; exit_reason?: string; platforms?: Record<string, { needs_attention?: boolean; state?: string; error_message?: string }> } | undefined
  if (st && st.gateway_state && st.gateway_state !== 'running') {
    out.push({ detector: 'gateway.degraded', subject: 'gateway', severity: st.gateway_state === 'stopped' || st.gateway_state === 'startup_failed' ? 'high' : 'warn', summary: `网关状态 ${st.gateway_state}`, detail: { exit_reason: st.exit_reason } })
  }
  for (const [name, p] of Object.entries(st?.platforms ?? {})) {
    if (p?.needs_attention) {
      out.push({ detector: 'gateway.platform-attention', subject: `platform:${name}`, severity: 'warn', summary: `平台 ${name} 需要关注（${p.state ?? '?'}${p.error_message ? `：${p.error_message}` : ''}）` })
    }
  }
  return out
}

/** D2 槽位膨胀：active_agents ≫ 注册表活条目（run11 04:37 实锤形态：active=1 但闸满拒 / 26 vs 实跑寥寥） */
export function detectSlotInflation(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const tol = opts.inflateTolerance ?? 5
  const high = opts.inflateHigh ?? 10
  const active = Number((snap.gateway.state as { active_agents?: number } | undefined)?.active_agents ?? 0)
  if (!snap.sessions.ok || active <= 0) return []
  const delta = active - snap.sessions.live
  if (delta > tol) {
    return [{
      detector: 'gateway.slot-inflation', subject: 'gateway',
      severity: delta >= high ? 'high' : 'warn',
      summary: `槽位记账膨胀：active_agents=${active} vs 注册表活条目=${snap.sessions.live}（差 ${delta}）`,
      detail: { active_agents: active, sessions_live: snap.sessions.live, sessions_entries: snap.sessions.entries },
    }]
  }
  return []
}

/** D3 僵尸 worker：kanban 诊断 severity error/critical（心跳陈旧/claim 超时行） */
export function detectStaleWorkers(snap: ClusterSnapshot): Anomaly[] {
  if (!snap.kanban.ok) return []
  const out: Anomaly[] = []
  for (const row of snap.kanban.rows) {
    const items = Array.isArray(row.diagnostics) ? row.diagnostics : []
    for (const d of items) {
      const sev = String(d?.severity ?? '')
      if (sev === 'error' || sev === 'critical') {
        out.push({
          detector: 'kanban.stale-worker', subject: String(row.task_id ?? 'board'),
          severity: sev === 'critical' ? 'high' : 'warn',
          summary: `任务 ${row.task_id} 诊断 ${sev}：${d?.title ?? ''}${d?.detail ? `（${d.detail}）` : ''}`,
        })
      }
    }
  }
  return out
}

/** D4 会话卡死：profile 日志尾为错误态且静默超阈（harness 左移件 b 同款判据移植） */
export function detectSessionStall(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const quiet = opts.stallQuietMs ?? 300_000
  const now = opts.nowMs ?? Date.now()
  const out: Anomaly[] = []
  if (!snap.profiles.ok) return out
  for (const t of snap.profiles.tails) {
    if (STALL_TAIL_RE.test(t.tail) && now - t.mtimeMs > quiet) {
      out.push({
        detector: 'session.stalled', subject: `profile:${t.profile}`,
        severity: 'warn',
        summary: `会话疑似卡死：${t.profile} 日志尾错误态且静默 ${Math.round((now - t.mtimeMs) / 1000)}s${diffContext(snap, now, t.profile)}`,
        detail: { tail: t.tail, quietMs: now - t.mtimeMs },
      })
    }
  }
  return out
}

/** D6 容量泵拥塞（二期内省）：sidecar 深度占容量比——≥75% warn、≥90% high（run11 队列 64 满丢 400+ 件实录） */
export function detectCapacityPump(snap: ClusterSnapshot): Anomaly[] {
  const c = snap.gateway.capacity
  if (!c || !c.cap) return []
  const pct = c.depth / c.cap
  if (pct < 0.75) return []
  return [{
    detector: 'gateway.capacity-pump', subject: 'gateway',
    severity: pct >= 0.9 ? 'high' : 'warn',
    summary: `容量重试队列拥塞：${c.depth}/${c.cap}（${Math.round(pct * 100)}%）`,
    detail: { ...c },
  }]
}

/** D5 异常风暴：单轮内同检测器异常 ≥N 个主体 → 追加一条 high 聚簇事件（run11 反应风暴形态） */
export function detectStorm(anomalies: Anomaly[], opts: DetectOptions = {}): Anomaly[] {
  const size = opts.stormClusterSize ?? 3
  const byDetector = new Map<string, Set<string>>()
  for (const a of anomalies) {
    if (!byDetector.has(a.detector)) byDetector.set(a.detector, new Set())
    byDetector.get(a.detector)!.add(a.subject)
  }
  const out: Anomaly[] = []
  for (const [det, subjects] of byDetector) {
    if (subjects.size >= size) {
      out.push({ detector: 'anomaly.storm', subject: det, severity: 'high', summary: `异常风暴：${det} 单轮命中 ${subjects.size} 个主体`, detail: { subjects: [...subjects] } })
    }
  }
  return out
}

/** 全量检测入口 */
/** D7 在办任务·档案静默交叉（run14 三次停摆实战：日志无错但人走了）：
 * 在办卡（running）的 assignee 档案日志静默超阈即报——不要求日志尾为错误态
 * （区别于 D4）。真空闲档案无在办卡不误报。 */
export function detectTaskAgentSilence(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const quiet = opts.agentSilentMs ?? 900_000
  const now = opts.nowMs ?? Date.now()
  if (!snap.runningCards.ok || !snap.profiles.ok) return []
  const byProfile = new Map<string, { mtimeMs: number; cards: string[] }>()
  for (const c of snap.runningCards.cards) {
    const a = (c.assignee ?? '').trim()
    if (!a) continue
    const cur = byProfile.get(a) ?? { mtimeMs: 0, cards: [] }
    cur.cards.push(c.id)
    byProfile.set(a, cur)
  }
  const out: Anomaly[] = []
  for (const t of snap.profiles.tails) {
    const hit = byProfile.get(t.profile)
    if (!hit) continue
    // 真做判据优先（run19 上移）：静默按 realWorkTsMs 判——嘴炮回合（单轮调用回话）
    // 不清静默账，被催后只回话的档案继续计入静默；无真做行退回 workTsMs（兼容旧日志）。
    const actTs = t.realWorkTsMs && t.realWorkTsMs > 0
      ? t.realWorkTsMs
      : (t.workTsMs && t.workTsMs > 0 ? t.workTsMs : t.mtimeMs) // 工作行优先；mtime 被 reaction 噪音刷新会假活跃（run14 实锤）
    const silent = now - actTs
    if (silent > quiet) {
      out.push({
        detector: 'task.agent-silent', subject: `profile:${t.profile}`,
        severity: 'warn',
        summary: `在办任务但档案真做停摆（按真做行判定活性：工具轮或多轮调用）：${t.profile} 持有 ${hit.cards.length} 张在办卡（${hit.cards.slice(0, 3).join('、')}${hit.cards.length > 3 ? '…' : ''}）真做静默 ${Math.round(silent / 1000)}s（日志尾无错误态——人走型停摆形态；若期间只有单轮回话=嘴炮顶回，未清静默账）${diffContext(snap, now, t.profile)}`,
        detail: { cards: hit.cards, quietMs: quiet, realWorkTsMs: t.realWorkTsMs },
      })
    }
  }
  return out
}

/** 差分上下文（run14 误诊根治面）：告警附「同时刻其余档案工作行活跃数/总数」——
 * 监控者一眼可见环境级根因是否成立（多数活跃=个别档案问题；全体静默=环境问题）。 */
function diffContext(snap: ClusterSnapshot, now: number, exclude: string): string {
  const others = snap.profiles.tails.filter((t) => t.profile !== exclude)
  const actTs = (t: ProfileTail) => (t.workTsMs && t.workTsMs > 0 ? t.workTsMs : t.mtimeMs)
  const alive = others.filter((t) => now - actTs(t) < 900_000).length
  return `［差分参照：其余 ${alive}/${others.length} 个档案 15 分钟内有工作行］`
}

/** D8 跨机静默（2026-10-11 联邦三步之③）：机器注册表里有过心跳（24h 内）但静默超阈
 * 且最近一次上报带在途任务 → 报 machine.silent（附其余机器活跃数=差分参照）。 */
export function detectMachineSilence(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const quiet = opts.machineSilentMs ?? 900_000
  const now = snap.federation.nowMs || snap.ts
  if (!snap.federation.ok) return []
  const out: Anomaly[] = []
  const actTs = (m: { lastSeenMs: number }) => m.lastSeenMs
  const aliveOthers = (exclude: string) =>
    snap.federation.machines.filter((m) => m.machineId !== exclude && now - actTs(m) < quiet).length
  for (const m of snap.federation.machines) {
    const silent = now - actTs(m)
    if (silent < quiet) continue
    if (m.activeTasks <= 0) continue // 空闲机器静默不报（零误报纪律）
    out.push({
      detector: 'machine.silent', subject: `machine:${m.machineId}`,
      severity: 'warn',
      summary: `跨机静默：机器 ${m.machineId} 上报 ${m.activeTasks} 张在途任务后已静默 ${Math.round(silent / 60000)} 分钟［差分参照：其余 ${aliveOthers(m.machineId)}/${snap.federation.machines.length - 1} 台机器 15 分钟内有心跳］`,
      detail: { machineId: m.machineId, silentMs: silent, activeTasks: m.activeTasks },
    })
  }
  return out
}

/** D9 会话上下文水位（长会话治理 B1）：602 遥测 watermark_pct ≥ 阈（默认 85）。
 *  高水位+多次轮换记录 = 压缩已压不住的会话——长会话质量衰减的先行指标。 */
export function detectContextWatermark(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const warnAt = opts.watermarkWarnPct ?? 85
  const highAt = opts.watermarkHighPct ?? 95
  const te = snap.sessionTelemetry
  if (!te?.ok) return []
  const out: Anomaly[] = []
  for (const e of te.entries) {
    const pct = e.watermarkPct
    if (pct === null || pct === undefined || pct < warnAt) continue
    out.push({
      detector: 'session.context-watermark', subject: `session:${e.sessionKey}`,
      severity: pct >= highAt ? 'high' : 'warn',
      summary: `会话上下文水位 ${pct}%（${e.platform ?? '?'} / ${e.model ?? '?'}，累计 ${e.cumApiCalls ?? 0} 次迭代${e.rotations ? `，已轮换 ${e.rotations} 次` : ''}）——压缩接近失效，指令遵循与产出质量将随稀释衰减`,
      detail: { watermarkPct: pct, turns: e.turns, cumApiCalls: e.cumApiCalls, rotations: e.rotations ?? 0, sessionId: e.sessionId },
    })
  }
  return out
}

/** D10 会话空转连击（长会话治理 B1）：连续 N 回合有 API 调用但零工具零产出
 *  （602 遥测 empty_streak）。「大上下文短回复自了断」形态的机械判据（run14 第七形态）。 */
export function detectEmptyStreak(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const limit = opts.emptyStreakLimit ?? 4
  const te = snap.sessionTelemetry
  if (!te?.ok) return []
  const out: Anomaly[] = []
  for (const e of te.entries) {
    const streak = e.emptyStreak ?? 0
    if (streak < limit) continue
    out.push({
      detector: 'session.empty-streak', subject: `session:${e.sessionKey}`,
      severity: streak >= limit * 2 ? 'high' : 'warn',
      summary: `会话空转连击 ${streak} 回合（有 API 调用但零工具零产出）——大上下文短回复自了断形态，建议按交接检查点轮换`,
      detail: { emptyStreak: streak, turns: e.turns, cumApiCalls: e.cumApiCalls, watermarkPct: e.watermarkPct ?? null },
    })
  }
  return out
}

/** D11 环检测信号（长会话治理 B1/A1）：601-605 遥测的 runaway 决策计数 ≥2
 *  （同会话反复触发六信号处置）——工具级死循环正在被守卫拦，但根因未除。 */
export function detectRunawayLoop(snap: ClusterSnapshot): Anomaly[] {
  const te = snap.sessionTelemetry
  if (!te?.ok) return []
  const out: Anomaly[] = []
  for (const e of te.entries) {
    const rw = e.runaway
    const decisions = rw?.decisions ?? 0
    if (decisions < 2) continue
    out.push({
      detector: 'session.runaway-loop', subject: `session:${e.sessionKey}`,
      severity: decisions >= 4 ? 'high' : 'warn',
      summary: `环检测处置 ${decisions} 次（最近信号 ${rw?.signal ?? '?'} @ ${rw?.tool ?? '?'}）——工具级死循环反复出现，查该会话的任务路径根因`,
      detail: { decisions, signal: rw?.signal ?? null, tool: rw?.tool ?? null, heartbeat: e.heartbeat ?? null },
    })
  }
  return out
}

/** card.blocked-stale：阻塞卡停滞检测（run19 G5 熔断死等产品化——用户 300s 时限）。
 *  blocked 卡（含评审 FAIL 熔断、依赖阻塞等一切 blocked 形态）自最后更新起停滞超阈值即报
 *  high（阻塞态无人推进是事故前形态，run19 实锤：评审卡缺项熔断后 agent 停摆 4 小时零信号）。
 *  未接线（blockedCards 缺席）=合法空态静默跳过。 */
export function detectBlockedStale(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const staleMs = opts.blockedStaleMs ?? 300_000
  const now = opts.nowMs ?? Date.now()
  const out: Anomaly[] = []
  const face = snap.blockedCards
  if (!face || !face.ok) return out
  for (const c of face.cards) {
    const upd = typeof c.updated_at === 'number' ? c.updated_at
      : typeof c.updated_at === 'string' ? Number(c.updated_at) : NaN
    if (!Number.isFinite(upd) || upd <= 0) continue
    const quietMs = now - upd
    if (quietMs > staleMs) {
      out.push({
        detector: 'card.blocked-stale', subject: `card:${c.id}`,
        severity: quietMs > staleMs * 4 ? 'high' : 'warn',
        summary: `阻塞卡停滞 ${Math.round(quietMs / 1000)}s：${c.title ?? c.id}（最后更新于 ${new Date(upd).toISOString()}，阈值 ${Math.round(staleMs / 1000)}s）——无人推进形态，run19 熔断死等同型`,
        detail: { cardId: c.id, title: c.title, assignee: c.assignee, quietMs, staleMs },
      })
    }
  }
  return out
}

export function detectAll(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const base = [
    ...detectGateway(snap),
    ...detectSlotInflation(snap, opts),
    ...detectStaleWorkers(snap),
    ...detectSessionStall(snap, opts),
    ...detectCapacityPump(snap),
    ...detectTaskAgentSilence(snap, opts),
    ...detectMachineSilence(snap, opts),
    ...detectContextWatermark(snap, opts),
    ...detectEmptyStreak(snap, opts),
    ...detectRunawayLoop(snap),
    ...detectDeliveryAnchor(snap, opts),
    ...detectDispatcherStuck(snap, opts),
    ...detectFakeCompletion(snap, opts),
    ...detectLoadImbalance(snap, opts),
    ...detectIdleWithWorkAvailable(snap, opts),
    ...detectBlockedStale(snap, opts),
  ]
  return [...base, ...detectStorm(base, opts)]
}

/** ── 交付锚验证（run19 推演层根治上移 A+B，用户 2026-10-13「全做」裁定）──
 *  A 分支新鲜度（branch_fresh 推演件产品化）：卡引用的交付分支，tip 提交时间必须
 *     ≥ 卡的 started_at——tip 早于任务开始=上轮遗留分支冒充本轮交付（run15 实锤
 *     形态：feat/DEV-X 存上轮提交时真值锚恒假、等待环盲转 150min）。
 *  B 锚可反查（FIX-DONE commit 抽验产品化）：已完成卡引用的分支必须在仓中可
 *     rev-parse 反查——不可查=未推送或伪锚（「嘴上说完成」的防线；判活管过程、
 *     锚验证管结果，两者互补闭环）。
 *  fail-open：未配 CLUSTER_INSPECTOR_NUDGE_REPO / git 失败 → 返回空（不误报）。
 *  只对带 branch_name 的卡生效（无交付引用的卡不在此面）。 */
export function detectDeliveryAnchor(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const repo = process.env.CLUSTER_INSPECTOR_NUDGE_REPO
  if (!repo || !snap.runningCards.ok) return []
  const out: Anomaly[] = []
  let git: (args: string[]) => string
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    git = (args: string[]) => execFileSync('git', ['-C', repo, ...args], { timeout: 5000, encoding: 'utf-8' }) as string
  } catch { return [] }
  const epoch = (v: number | string | undefined): number => {
    if (typeof v === 'number') return Math.round(v < 1e12 ? v * 1000 : v)
    if (typeof v === 'string' && v) { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t }
    return 0
  }
  for (const c of snap.runningCards.cards) {
    const br = (c.branch_name ?? '').trim()
    if (!br) continue
    const startedMs = epoch(c.started_at)
    const done = String(c.status ?? '').toLowerCase() === 'done' || String(c.status ?? '').toLowerCase() === 'completed'
    // B 锚可反查（done 卡）：分支在 refs/heads 或 refs/remotes 任一存在。
    // rev-parse --verify -q 对缺失 ref 以退出码 1 结束——execFileSync 会抛异常
    // 而非返回空串，`a() || b()` 形态下 b 永不可达（remote-only 分支被误报伪锚）。
    const refExists = (ref: string): boolean => {
      try { return git(['rev-parse', '--verify', '-q', ref]).trim() !== '' } catch { return false }
    }
    if (done) {
      if (!refExists(`refs/heads/${br}`) && !refExists(`refs/remotes/origin/${br}`)) {
        out.push({
          detector: 'delivery.anchor-missing', subject: `card:${c.id}`,
          severity: 'warn',
          summary: `已完成卡引用的交付分支不可反查：卡 ${c.id}（${c.title ?? ''}）branch=${br} 在仓中查无（未推送或伪锚）——「嘴上说完成」形态，请 ${c.assignee ?? '负责人'} 推送该分支或修正卡的 branch_name 后在卡内回执`,
          detail: { card: c.id, branch: br, assignee: c.assignee },
        })
        continue
      }
    }
    // A 分支新鲜度（running/done 通用）：tip 提交时间 ≥ 卡开始时间
    if (startedMs > 0) {
      try {
        const cdate = git(['for-each-ref', '--format=%(committerdate:unix)',
          `refs/heads/${br}`, `refs/remotes/origin/${br}`]).trim().split('\n').filter(Boolean).map(Number).sort((a, b) => b - a)[0]
        if (cdate && cdate * 1000 < startedMs) {
          out.push({
            detector: 'delivery.branch-stale', subject: `card:${c.id}`,
            severity: 'warn',
            summary: `交付分支 tip 早于任务开始（上轮遗留冒充本轮）：卡 ${c.id}（${c.title ?? ''}）branch=${br} 的 tip 在任务开始前 ${Math.round((startedMs - cdate * 1000) / 60000)} 分钟——本轮新提交未推上该分支（勿只留工作区分支），请推送后回执`,
            detail: { card: c.id, branch: br, tipEpochS: cdate, startedMs, assignee: c.assignee },
          })
        }
      } catch { /* 单卡 git 失败不阻塞其余卡 */ }
    }
  }
  return out
}

/** ── 派发通道僵死检测（run19 凌晨实录根治：网关 dispatcher 循环 3h 零孵化+失败
 *  静默，ready 卡滞留无人领；CLI kanban dispatch 完好可绕——实证破局手产品化）。
 *  判据：ready 队列非空且持续滞留（detectors 是无状态纯函数，滞留时长由调用方
 *  通过 opts.dispatcherStuckMs 传入——控制器/inspector 侧维护滞留起点）。
 *  fail-open：runningCards 面不可用 → 不报。 */
export function detectDispatcherStuck(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const stuckMs = opts.dispatcherStuckMs ?? 0
  if (!snap.runningCards.ok || stuckMs <= 0) return []
  const ready = snap.runningCards.cards.filter((c) => String(c.status ?? '').toLowerCase() === 'ready')
  if (ready.length === 0) return []
  return [{
    detector: 'dispatcher.stuck', subject: 'board:current',
    severity: 'warn',
    summary: `派发通道僵死：ready 队列 ${ready.length} 张卡滞留 ${Math.round(stuckMs / 1000)}s 零孵化（网关 dispatcher 循环故障实录形态；CLI 直派通道独立可用）——建议执行 kanban dispatch 直派孵化（自愈动作已内置于 safe-act）`,
    detail: { readyCards: ready.map((c) => c.id), stuckMs },
  }]
}

/** ── 假完成检测（run19 实录根治：「嘴炮完成」——卡推进到 done 但负责人全程零真做
 *  行：仅回话/占位即完成。判据：done 卡的 assignee 其 realWorkTsMs 为 0（全程无
 *  工具轮/多轮调用）或远早于卡创建时刻（活儿不是它干的）。与交付锚验证互补：
 *  锚验证管「结果可反查」，本检测管「过程归属」。 */
export function detectFakeCompletion(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  if (!snap.runningCards.ok || !snap.profiles.ok) return []
  const now = opts.nowMs ?? Date.now()
  const byProfile = new Map(snap.profiles.tails.map((t) => [t.profile, t]))
  const done = snap.runningCards.cards.filter((c) => ['done', 'completed'].includes(String(c.status ?? '').toLowerCase()))
  const out: Anomaly[] = []
  for (const c of done) {
    const a = (c.assignee ?? '').trim()
    if (!a) continue
    const t = byProfile.get(a)
    if (!t) continue
    const real = t.realWorkTsMs && t.realWorkTsMs > 0 ? t.realWorkTsMs : 0
    if (real === 0) {
      out.push({
        detector: 'completion.no-realwork', subject: `card:${c.id}`,
        severity: 'warn',
        summary: `假完成嫌疑（零真做）：卡 ${c.id}（${c.title ?? ''}）已置 done，但负责人 ${a} 全程无真做行（无工具轮/多轮调用）——「嘴炮完成」形态，请复核交付实际产出人或重开卡`,
        detail: { card: c.id, assignee: a },
      })
    }
  }
  return out
}

/** ── 负载不均衡检测（用户 2026-10-14 裁定：巡检官识别负载不均衡并做工作调节）：
 *  在办卡分布 max≥imbalanceMax（默认 3）且存在零在办卡的活跃编制档案并存 → 报
 *  load.imbalance（附分布与调节建议：拆分复合卡/并行领卡/督办再平衡）。活跃编制
 *  = profiles 面可见的档案（有日志尾巴即算——真空闲档案的区别见 idle.note）。 */
export function detectLoadImbalance(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const maxCards = opts.imbalanceMax ?? 3
  if (!snap.runningCards.ok || !snap.profiles.ok) return []
  const known = new Set(snap.profiles.tails.map((t) => t.profile))
  const load = new Map<string, number>()
  for (const c of snap.runningCards.cards) {
    const a = (c.assignee ?? '').trim()
    if (!a || !known.has(a)) continue
    load.set(a, (load.get(a) ?? 0) + 1)
  }
  const busy = [...load.entries()].filter(([, n]) => n >= maxCards)
  if (busy.length === 0) return []
  const idle = snap.profiles.tails.filter((t) => !load.has(t.profile)).map((t) => t.profile)
  if (idle.length === 0) return []
  const dist = [...load.entries()].map(([p, n]) => `${p}:${n}`).join('、')
  return [{
    detector: 'load.imbalance', subject: 'board:current',
    severity: 'warn',
    summary: `工作负载不均衡：${busy.map(([p, n]) => `${p} 持 ${n} 张在办卡`).join('、')}（≥${maxCards}）而 ${idle.slice(0, 5).join('、')}${idle.length > 5 ? ' 等' : ''} 零在办——建议调节：复合卡拆分（decompose）、待办卡并行领卡、或再平衡指派`,
    detail: { distribution: dist, busy: busy.map(([p]) => p), idle },
  }]
}

/** ── 空闲正当性检测（同裁定）：空闲≠都该催——判别「有活可干的空闲」（异常）与
 *  「真空闲」（正常，run14 教训不误报）。异常形态=档案零在办卡+真做静默超阈+
 *  存在无主 ready 卡（可领未领）；真空闲（无卡可领）不报。输出接催办面：督办领卡。 */
export function detectIdleWithWorkAvailable(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const quiet = opts.agentSilentMs ?? 900_000
  const now = opts.nowMs ?? Date.now()
  if (!snap.runningCards.ok || !snap.profiles.ok) return []
  const unassigned = snap.runningCards.cards.filter((c) => String(c.status ?? '').toLowerCase() === 'ready' && !(c.assignee ?? '').trim())
  if (unassigned.length === 0) return []
  const load = new Set(snap.runningCards.cards.filter((c) => (c.status ?? '').toLowerCase() !== 'ready').map((c) => (c.assignee ?? '').trim()).filter(Boolean))
  const out: Anomaly[] = []
  for (const t of snap.profiles.tails) {
    if (load.has(t.profile)) continue
    const actTs = t.realWorkTsMs && t.realWorkTsMs > 0 ? t.realWorkTsMs : (t.workTsMs && t.workTsMs > 0 ? t.workTsMs : t.mtimeMs)
    if (now - actTs <= quiet) continue
    out.push({
      detector: 'idle.with-work', subject: `profile:${t.profile}`,
      severity: 'warn',
      summary: `空闲异常（有活可干的空闲）：${t.profile} 零在办卡且真做静默 ${Math.round((now - actTs) / 1000)}s，而队列有 ${unassigned.length} 张无主 ready 卡（${unassigned.slice(0, 3).map((c) => c.id).join('、')}${unassigned.length > 3 ? '…' : ''}）可领未领——请领卡并行开工（真空闲=队列无卡时不报，不误催）`,
      detail: { readyCards: unassigned.map((c) => c.id) },
    })
  }
  return out
}
