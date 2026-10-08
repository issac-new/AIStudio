// overlay/custom/server/clusterinspector/detectors.ts
// 检测层：纯函数，输入 ClusterSnapshot → Anomaly[]。五检测器对应 run11 实录病灶：
// D1 网关失联/降级、D2 槽位膨胀、D3 僵尸 worker、D4 会话卡死、D5 异常风暴（轮内聚簇升级）。

import type { ClusterSnapshot } from './collectors'

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
  /** D5 轮内同检测器异常数达到该值即追加风暴事件（默认 3） */
  stormClusterSize?: number
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
        summary: `会话疑似卡死：${t.profile} 日志尾错误态且静默 ${Math.round((now - t.mtimeMs) / 1000)}s`,
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
export function detectAll(snap: ClusterSnapshot, opts: DetectOptions = {}): Anomaly[] {
  const base = [
    ...detectGateway(snap),
    ...detectSlotInflation(snap, opts),
    ...detectStaleWorkers(snap),
    ...detectSessionStall(snap, opts),
    ...detectCapacityPump(snap),
  ]
  return [...base, ...detectStorm(base, opts)]
}
