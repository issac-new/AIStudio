// overlay/custom/server/clusterinspector/convergence.ts
// 同类风险收敛性追踪（用户 2026-10-14 指令产品化）：多轮工作的有效判定标准=
// 同类/同一事件的风险是否持续收敛。巡检官以「复发记账」把它变成机械指标：
// 每个异常指纹（detector::subject）每过一次冷却窗再发 = 一次复发（episode），
// 复发间隔的走势给出趋势——熵增（复发次数超阈且间隔不放宽，或持久超硬阈）
// 时三联动处置：①升级风险项（复发异常 emit 时升 high）；②熔断（跳过该指纹
// 的自动处置——反复提醒催单/回收不收敛=副作用风暴，run14 回灌轰炸教训）；③降级
// （负责人档案标 degraded：停止喂新活，idle.with-work 提醒催单抑制）。
// 路由语义一致于 faileroute 的 non_convergent 档（反复不收敛→人闸：人补判断比
// 再试一轮便宜）。状态持久化 <home>/runtime/cluster-inspector-convergence.json
// （重启不失熵账；capacity sidecar 同款位置先例）；CLUSTER_INSPECTOR_CONVERGENCE=off 关闭。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export type ConvergenceTrend = 'watching' | 'converging' | 'diverging' | 'resolved'

export interface ConvergenceItem {
  key: string
  detector: string
  subject: string
  /** 首次在场轮时刻 */
  firstSeenMs: number
  /** 最后在场轮时刻（每轮 presence 刷新；消失超 resolveMs 即 resolved） */
  lastSeenMs: number
  /** 复发次数（过冷却窗的再发，含首发） */
  episodes: number
  /** 最近一次复发时刻 */
  lastEpisodeMs: number
  trend: ConvergenceTrend
  /** 熔断已触发（熵增→该指纹跳过自动处置，待人） */
  tripped: boolean
  trippedAtMs: number | null
  /** 最近一次异常摘要（人读） */
  summary?: string
  /** 卡类异常的负责人（降级判定面） */
  assignee?: string
}

export interface ConvergenceReport {
  items: ConvergenceItem[]
  /** 降级档案（有活跃熵增风险的负责人：不喂新活） */
  degradedProfiles: string[]
  summary: { tracked: number; diverging: number; converging: number; watching: number; resolved: number; tripped: number }
}

export interface ConvergenceOptions {
  /** 熵增判定最少复发次数（默认 3；env CLUSTER_INSPECTOR_CONV_ESCAPE_EPISODES） */
  escapeEpisodes?: number
  /** 消失多久算收敛解决（默认 3600000=1h；env CLUSTER_INSPECTOR_CONV_RESOLVE_MS） */
  resolveMs?: number
}

/** 间隔放宽到此倍数才算收敛走势（复发在变疏） */
const WIDEN_FACTOR = 1.5
/** 持久硬阈：复发≥此数即熵增（≈2h 连续在场不收敛，无论间隔走势） */
const HARD_EPISODES = 8
/** 复发时间戳保留上限（趋势判定只需尾部，防文件无限增长） */
const EPISODE_CAP = 20
/** 已解决条目保留时长（过后清账） */
const PRUNE_MS = 24 * 3600_000

const STATE_VERSION = 1

export function convergenceEnabled(): boolean {
  return process.env.CLUSTER_INSPECTOR_CONVERGENCE !== 'off'
}

export function convergenceOptions(): Required<ConvergenceOptions> {
  return {
    escapeEpisodes: Math.max(2, Number(process.env.CLUSTER_INSPECTOR_CONV_ESCAPE_EPISODES || 3)),
    resolveMs: Math.max(60_000, Number(process.env.CLUSTER_INSPECTOR_CONV_RESOLVE_MS || 3_600_000)),
  }
}

/** 趋势分类（纯函数）：
 *  resolved   = 消失超 resolveMs（收敛完成）
 *  diverging  = 复发≥硬阈，或复发≥escapeEpisodes 且间隔不放宽（熵增）
 *  converging = 复发≥escapeEpisodes 且间隔在放宽（复发变疏，走势向好）
 *  watching   = 复发次数不足判定（观察中） */
export function classifyTrend(
  episodes: number[],
  lastSeenMs: number,
  nowMs: number,
  opts: ConvergenceOptions = {},
): ConvergenceTrend {
  const { escapeEpisodes, resolveMs } = { ...convergenceOptions(), ...opts }
  if (episodes.length === 0) return 'watching'
  if (nowMs - lastSeenMs > resolveMs) return 'resolved'
  if (episodes.length >= HARD_EPISODES) return 'diverging'
  if (episodes.length >= escapeEpisodes) {
    if (episodes.length >= 3) {
      const n = episodes.length
      const gapLate = episodes[n - 1] - episodes[n - 2]
      const gapEarly = episodes[n - 2] - episodes[n - 3]
      if (gapEarly > 0 && gapLate >= gapEarly * WIDEN_FACTOR) return 'converging'
    }
    return 'diverging'
  }
  return 'watching'
}

interface PersistedEntry {
  detector: string
  subject: string
  summary?: string
  assignee?: string
  firstSeenMs: number
  lastSeenMs: number
  episodes: number[]
  tripped: boolean
  trippedAtMs?: number
}

interface PersistedState { version: number; entries: Record<string, PersistedEntry> }

export function anomalyKey(detector: string, subject: string): string {
  return `${detector}::${subject}`
}

/** 收敛账本：在场/复发记账 + 趋势 + 熔断/降级判定面。文件读写全 fail-soft。 */
export class ConvergenceTracker {
  private readonly file: string | null
  private readonly entries = new Map<string, PersistedEntry>()
  private dirty = false

  constructor(homeDir?: string) {
    const home = homeDir ?? process.env.HERMES_HOME ?? join(homedir(), '.hermes')
    this.file = join(home, 'runtime', 'cluster-inspector-convergence.json')
    try {
      if (existsSync(this.file)) {
        const raw = JSON.parse(readFileSync(this.file, 'utf-8')) as PersistedState
        if (raw?.version === STATE_VERSION && raw.entries && typeof raw.entries === 'object') {
          for (const [k, v] of Object.entries(raw.entries)) {
            if (v && Array.isArray(v.episodes)) this.entries.set(k, v)
          }
        }
      }
    } catch { /* 坏文件=从零记账（fail-soft，不炸巡检） */ }
  }

  /** 每轮巡检在场记账（anomalies 为本轮全量检测结果；收敛性元事件自身不计）。
   *  已解决条目重现身=新风险周期：复发账清零、熔断重武装（旧账不带入新周期）。 */
  recordPresence(nowMs: number, anomalies: Array<{ detector: string; subject: string; summary?: string; detail?: Record<string, unknown> }>, opts: ConvergenceOptions = {}): void {
    const { resolveMs } = { ...convergenceOptions(), ...opts }
    for (const a of anomalies) {
      if (a.detector === 'risk.diverging') continue
      const key = anomalyKey(a.detector, a.subject)
      const prev = this.entries.get(key)
      const e = prev ?? {
        detector: a.detector, subject: a.subject,
        firstSeenMs: nowMs, lastSeenMs: nowMs, episodes: [], tripped: false,
      }
      if (prev && nowMs - prev.lastSeenMs > resolveMs) {
        e.episodes = []
        e.firstSeenMs = nowMs
        e.tripped = false
        e.trippedAtMs = undefined
      }
      e.lastSeenMs = nowMs
      e.summary = a.summary
      const asg = (a.detail as { assignee?: unknown } | undefined)?.assignee
      if (typeof asg === 'string' && asg.trim()) e.assignee = asg.trim()
      this.entries.set(key, e)
      this.dirty = true
    }
    // 清账：消失超 24h 的条目删除
    for (const [k, e] of this.entries) {
      if (nowMs - e.lastSeenMs > PRUNE_MS) { this.entries.delete(k); this.dirty = true }
    }
    this.flush()
  }

  /** 复发记账（emit 过冷却窗时调用一次；同刻度重复忽略） */
  recordEpisode(nowMs: number, key: string): void {
    const e = this.entries.get(key)
    if (!e) return
    if (e.episodes[e.episodes.length - 1] === nowMs) return
    e.episodes.push(nowMs)
    if (e.episodes.length > EPISODE_CAP) e.episodes.splice(0, e.episodes.length - EPISODE_CAP)
    this.dirty = true
    this.flush()
  }

  /** 熵增熔断标记（one-shot：触发一次，resolved 后自动复位重武装） */
  trip(nowMs: number, key: string): void {
    const e = this.entries.get(key)
    if (!e) return
    e.tripped = true
    e.trippedAtMs = nowMs
    this.dirty = true
    this.flush()
  }

  isTripped(key: string): boolean {
    return this.entries.get(key)?.tripped ?? false
  }

  itemOf(key: string, nowMs: number, opts: ConvergenceOptions = {}): ConvergenceItem | null {
    const e = this.entries.get(key)
    if (!e) return null
    const trend = classifyTrend(e.episodes, e.lastSeenMs, nowMs, opts)
    // 复位重武装：已解决即解除熔断（再激活从零起算）
    if (trend === 'resolved' && e.tripped) { e.tripped = false; e.trippedAtMs = undefined; this.dirty = true; this.flush() }
    return {
      key, detector: e.detector, subject: e.subject,
      firstSeenMs: e.firstSeenMs, lastSeenMs: e.lastSeenMs,
      episodes: e.episodes.length,
      lastEpisodeMs: e.episodes[e.episodes.length - 1] ?? 0,
      trend,
      tripped: e.tripped, trippedAtMs: e.trippedAtMs ?? null,
      summary: e.summary, assignee: e.assignee,
    }
  }

  /** 全量条目（人读面：snapshot/UI） */
  items(nowMs: number, opts: ConvergenceOptions = {}): ConvergenceItem[] {
    return [...this.entries.keys()].map((k) => this.itemOf(k, nowMs, opts)).filter((x): x is ConvergenceItem => x !== null)
  }

  /** 降级档案集：有活跃（未解决）熵增风险的负责人——profile 主体直取，卡类经 assignee */
  degradedSet(items: ConvergenceItem[]): Set<string> {
    const out = new Set<string>()
    for (const it of items) {
      if (it.trend === 'resolved') continue
      if (it.trend !== 'diverging' && !it.tripped) continue
      if (it.subject.startsWith('profile:')) out.add(it.subject.slice('profile:'.length))
      else if (it.assignee) out.add(it.assignee)
    }
    return out
  }

  report(nowMs: number, opts: ConvergenceOptions = {}): ConvergenceReport {
    const items = this.items(nowMs, opts)
    const degradedProfiles = [...this.degradedSet(items)].sort()
    const summary = { tracked: items.length, diverging: 0, converging: 0, watching: 0, resolved: 0, tripped: 0 }
    for (const it of items) {
      summary[it.trend] += 1
      if (it.tripped && it.trend !== 'resolved') summary.tripped += 1
    }
    return { items, degradedProfiles, summary }
  }

  private flush(): void {
    if (!this.dirty || !this.file) return
    try {
      mkdirSync(join(this.file, '..'), { recursive: true })
      const state: PersistedState = {
        version: STATE_VERSION,
        entries: Object.fromEntries([...this.entries.entries()].map(([k, v]) => [k, {
          detector: v.detector, subject: v.subject, summary: v.summary, assignee: v.assignee,
          firstSeenMs: v.firstSeenMs, lastSeenMs: v.lastSeenMs, episodes: v.episodes,
          tripped: v.tripped, trippedAtMs: v.trippedAtMs,
        }])),
      }
      writeFileSync(this.file, JSON.stringify(state))
      this.dirty = false
    } catch { /* 写失败不炸巡检（内存账仍可用） */ }
  }
}
