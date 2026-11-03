// overlay/proactivity 域：断点推断适配器（2026-11-03 主动式 AI 全文吸收轮）。
//
// 论文 p26-27：介入成本是非平稳的——任务断点最便宜、思考中途最贵；时机不对时不该丢弃，
// 而应「骑现成断点」（opportunistic：用户本来就要停下的地方，如机器已停机、用户已在任务间停顿）。
// 上一版由调用方手填 atBreakpoint/nextBreakpointAtMs；本文件从看板生命周期事件自动推断，
// 让治理者拿到的是现实信号而不是调用方自觉。
//
// 纯函数：不读盘不读 env；事件由 delivery 的看板读取器提供（task_events 全量，板级量小）。
//
// 推断口径（保守，缺证据一律「不是断点」）：
//   ① 近期边界事件：任务走到 done/blocked/review/handoff/transition 等状态边界后 settleMinutes 内
//      ——用户此刻正在切换上下文，是天然断点；
//   ② 长间歇：最近 lullMinutes 内没有任何事件——用户已停下，重新唤起成本低；
//   ③ 否则视为工作流中途（mid_flow），并给出「按历史节奏推测的下一个断点」。
// 节奏用最近 cadenceWindow 条事件的间隔中位数，钳在 [minGapMinutes, maxGapMinutes]。

export interface BreakpointOptions {
  /** 边界事件后的「算断点」窗口（分钟）。 */
  settleMinutes: number
  /** 无事件多久视为用户已停下（分钟）。 */
  lullMinutes: number
  /** 估算节奏用的事件条数。 */
  cadenceWindow: number
  /** 推测间隔下限（分钟）。 */
  minGapMinutes: number
  /** 推测间隔上限（分钟）。 */
  maxGapMinutes: number
}

export const DEFAULT_BREAKPOINT_OPTIONS: BreakpointOptions = {
  settleMinutes: 3,
  lullMinutes: 20,
  cadenceWindow: 20,
  minGapMinutes: 5,
  maxGapMinutes: 120,
}

/** 状态边界类事件：走过这些 kind 说明一张卡结束了某段工作（不是「评论/创建」这种中途动作）。 */
const BOUNDARY_KINDS = new Set([
  'done',
  'completed',
  'complete',
  'blocked',
  'review',
  'handoff',
  'transition',
  'gave_up',
  'rejected',
  'verified',
  'rolled_back',
])

export interface BreakpointEvent {
  kind: string
  /** epoch 秒（与看板 task_events.created_at 同源）。 */
  atSec: number
}

export type BreakpointReason = 'recent_boundary' | 'lull' | 'mid_flow' | 'no_evidence'

export interface BreakpointEvidence {
  /** 参与判定的事件条数（非法时间戳已剔除）。 */
  eventsConsidered: number
  /** 最近一条事件距今秒数；无事件 null。 */
  lastEventAgeSec: number | null
  /** 最近一条边界事件距今秒数；无边界事件 null。 */
  lastBoundaryAgeSec: number | null
  /** 历史节奏中位间隔（秒）；样本不足 null。 */
  medianGapSec: number | null
  /** 最近 2 分钟内有事件＝正在干活（解释用，不单独改变结论）。 */
  activeStream: boolean
}

export interface BreakpointDecision {
  atBreakpoint: boolean
  /** 当前不是断点时，按节奏推测的下一个断点（epoch ms）；无法推测 null。 */
  nextBreakpointAtMs: number | null
  reason: BreakpointReason
  /** 人话说明（面板与日志直接用）。 */
  detail: string
  evidence: BreakpointEvidence
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

function isBoundary(kind: string): boolean {
  if (BOUNDARY_KINDS.has(kind)) return true
  // 容错：上游 kind 可能带前缀（如 card.done / task:review）
  return /(^|[.:_-])(done|completed|blocked|review|handoff)([.:_-]|$)/i.test(kind)
}

/**
 * 从事件流推断「现在是不是断点」与「下一个断点大约何时」。
 * 保守口径：任何缺证据的情形都返回 atBreakpoint=false，绝不猜成「是断点」去促成打扰。
 */
export function inferBreakpoint(
  events: BreakpointEvent[],
  nowMs: number,
  options: Partial<BreakpointOptions> = {},
): BreakpointDecision {
  const opts: BreakpointOptions = { ...DEFAULT_BREAKPOINT_OPTIONS, ...options }
  const nowSec = Math.floor(nowMs / 1000)
  const valid = events
    .filter((e) => Number.isFinite(e.atSec) && e.atSec > 0 && e.atSec <= nowSec + 60)
    .sort((a, b) => a.atSec - b.atSec)

  if (valid.length === 0) {
    return {
      atBreakpoint: false,
      nextBreakpointAtMs: null,
      reason: 'no_evidence',
      detail: '无看板事件可推断断点——按非断点处理（缺证据不猜成断点）',
      evidence: { eventsConsidered: 0, lastEventAgeSec: null, lastBoundaryAgeSec: null, medianGapSec: null, activeStream: false },
    }
  }

  const last = valid[valid.length - 1]
  const lastEventAgeSec = Math.max(0, nowSec - last.atSec)
  const boundaries = valid.filter((e) => isBoundary(e.kind))
  const lastBoundary = boundaries.length ? boundaries[boundaries.length - 1] : null
  const lastBoundaryAgeSec = lastBoundary ? Math.max(0, nowSec - lastBoundary.atSec) : null
  const activeStream = lastEventAgeSec <= 120

  // 节奏：最近 N 条事件的相邻间隔（只取正间隔）
  const windowEvents = valid.slice(-Math.max(2, opts.cadenceWindow))
  const gaps: number[] = []
  for (let i = 1; i < windowEvents.length; i += 1) {
    const gap = windowEvents[i].atSec - windowEvents[i - 1].atSec
    if (gap > 0) gaps.push(gap)
  }
  const medianGapSec = median(gaps)
  const clampedGapSec =
    medianGapSec == null ? null : Math.min(opts.maxGapMinutes * 60, Math.max(opts.minGapMinutes * 60, medianGapSec))

  const evidence: BreakpointEvidence = { eventsConsidered: valid.length, lastEventAgeSec, lastBoundaryAgeSec, medianGapSec, activeStream }

  // ① 近期边界：用户正在切换上下文
  if (lastBoundaryAgeSec != null && lastBoundaryAgeSec <= opts.settleMinutes * 60) {
    return {
      atBreakpoint: true,
      nextBreakpointAtMs: null,
      reason: 'recent_boundary',
      detail: `${Math.round(lastBoundaryAgeSec / 60)} 分钟前刚有状态边界事件（${lastBoundary?.kind}）——用户正在切换上下文，是骑上的好时机`,
      evidence,
    }
  }

  // ② 长间歇：用户已停下
  if (lastEventAgeSec >= opts.lullMinutes * 60) {
    return {
      atBreakpoint: true,
      nextBreakpointAtMs: null,
      reason: 'lull',
      detail: `已静默 ${Math.round(lastEventAgeSec / 60)} 分钟（阈值 ${opts.lullMinutes}）——用户已停下，重新唤起成本低`,
      evidence,
    }
  }

  // ③ 工作流中途：给出按节奏推测的下一个断点
  const nextBreakpointAtMs = clampedGapSec == null ? null : (last.atSec + clampedGapSec) * 1000
  return {
    atBreakpoint: false,
    nextBreakpointAtMs,
    reason: 'mid_flow',
    detail:
      nextBreakpointAtMs == null
        ? '工作流中途且事件样本不足，无法推测下一断点——信息型干预按非断点处理'
        : `工作流中途（最近事件 ${Math.round(lastEventAgeSec / 60)} 分钟前）——按历史节奏推测下次断点约在 ${Math.round(clampedGapSec! / 60)} 分钟后`,
    evidence,
  }
}
