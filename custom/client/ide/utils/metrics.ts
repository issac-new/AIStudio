// overlay/custom/client/ide/utils/metrics.ts
// 会话遥测纯函数：上下文水位 / TPS / 缓存命中率（只做计算，不碰 store）。
//
// 语义源：upstream/dsh-TUI src/screens/StatusMetrics.ts + projection.ts 的移植，
// 口径裁决见 docs/upstream-analysis/zcode.md §四：
//   - 压力阈值对齐我方 ChatInput 60/80（同屏一致），不用 dsh 的 80/95；
//   - TPS = 首 token 起算的产出速率（排除 TTFT），流式期 chars/4 估计，
//     轮结束用 usage 结算真实计数替换；工具执行间隙不计时（burst 折叠）；
//   - 缓存命中 = cacheRead / (input + cacheRead + cacheWrite)，写计入 miss。

export const CONTEXT_WARN_PCT = 60
export const CONTEXT_DANGER_PCT = 80

export type PressureLevel = 'ok' | 'warn' | 'danger'

export function contextPressure(pct: number): PressureLevel {
  if (!Number.isFinite(pct)) return 'ok'
  if (pct >= CONTEXT_DANGER_PCT) return 'danger'
  if (pct >= CONTEXT_WARN_PCT) return 'warn'
  return 'ok'
}

export function contextPercent(used: number, windowTokens: number): number {
  if (!Number.isFinite(used) || used <= 0) return 0
  if (!Number.isFinite(windowTokens) || windowTokens <= 0) return 0
  return Math.min((used / windowTokens) * 100, 100)
}

// dsh-TUI formatTokens 阶梯：<1k 原值 / <10k 一位小数 / <1M 取整 k / 以上 M
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000) return String(Math.round(n))
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1000000) return `${Math.round(n / 1000)}k`
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`
  return `${Math.round(n / 1000000)}M`
}

export function contextReadout(used: number, windowTokens: number): string {
  const pct = contextPercent(used, windowTokens)
  const pctText = pct < 10 ? pct.toFixed(1) : String(Math.round(pct))
  return `${formatTokens(used)}/${formatTokens(windowTokens)} ${pctText}%`
}

export function cacheHitRate(
  inputTokens: number | null | undefined,
  cacheReadTokens: number | null | undefined,
  cacheWriteTokens: number | null | undefined,
): number | null {
  const input = Number(inputTokens ?? 0)
  const read = Number(cacheReadTokens ?? 0)
  const write = Number(cacheWriteTokens ?? 0)
  const total = input + read + write
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(read) || read < 0) return null
  return (read / total) * 100
}

// ── TPS ─────────────────────────────────────────────────────────────────────

export const TPS_FAST = 50
export const TPS_MED = 20
export const TPS_FLOOR = 40
export const TPS_WARMUP_MS = 500
export const CHARS_PER_TOKEN = 4
// 流式间隔超过该值视为工具执行等非解码阶段，折起新 burst 重新起表
export const TPS_BURST_GAP_MS = 2000

export type SpeedLevel = 'fast' | 'med' | 'slow'

export function speedLevel(tps: number): SpeedLevel {
  if (!Number.isFinite(tps) || tps <= 0) return 'slow'
  if (tps >= TPS_FAST) return 'fast'
  if (tps >= TPS_MED) return 'med'
  return 'slow'
}

export interface TpsSample {
  tps: number
  at: number
}

export const TPS_SAMPLES_CAP = 500
export const SPARKLINE_BLOCKS = '▁▂▃▄▅▆▇█'
export const SPARKLINE_POINTS = 12

// min-max 归一化到 8 级块字符；无样本返回空串，全等样本取中位
export function sparkline(samples: TpsSample[], points = SPARKLINE_POINTS): string {
  const recent = samples.slice(-points)
  if (!recent.length) return ''
  const values = recent.map((s) => s.tps)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const last = SPARKLINE_BLOCKS.length - 1
  return values
    .map((v) => SPARKLINE_BLOCKS[span > 0 ? Math.round(((v - min) / span) * last) : Math.floor(last / 2)])
    .join('')
}

/**
 * 每轮 TPS 跟踪器（事件驱动状态机）。
 *
 * 两条输入路径：
 *  - onStreamDelta：流式 assistant 文本累计字符数（chars/4 估计，首 token 起表）；
 *  - onUsageOutput：usage.updated 的会话累计 outputTokens（真实计数，结算优先）。
 *
 * 限制（诚实声明）：拿不到每步首 token 的服务端时刻，burst 间隔 2s 折叠工具
 * 阶段；轮均值 = 产出 token / 首 token→末事件 时距，含轮内非解码间隙。
 */
export class TpsTracker {
  private running = false
  private firstDeltaAt: number | null = null
  private lastEventAt: number | null = null
  private burstFirstAt: number | null = null
  private burstBaseChars = 0
  private streamChars = 0
  // burst 累加（dsh-TUI 解码折页：Σtoken / Σ解码时长，工具间隙不计入分母）
  private accChars = 0
  private accDurationMs = 0
  private settledOutputBase: number | null = null
  private settledOutputLast: number | null = null
  private samples: TpsSample[] = []
  private lastRunTps: number | null = null

  getSamples(): readonly TpsSample[] {
    return this.samples
  }

  getLastRunTps(): number | null {
    return this.lastRunTps
  }

  startRun(now: number, baselineOutputTokens?: number): void {
    this.running = true
    this.firstDeltaAt = null
    this.lastEventAt = null
    this.burstFirstAt = null
    this.burstBaseChars = 0
    this.streamChars = 0
    this.accChars = 0
    this.accDurationMs = 0
    this.settledOutputBase =
      typeof baselineOutputTokens === 'number' && Number.isFinite(baselineOutputTokens)
        ? baselineOutputTokens
        : null
    this.settledOutputLast = this.settledOutputBase
  }

  /** totalStreamChars：本轮开始以来流式 assistant 文本累计字符数（单调不减） */
  onStreamDelta(now: number, totalStreamChars: number): void {
    if (!this.running || !Number.isFinite(totalStreamChars) || totalStreamChars <= this.streamChars) return
    if (this.firstDeltaAt === null) {
      this.firstDeltaAt = now
      this.burstFirstAt = now
      this.burstBaseChars = totalStreamChars
    } else if (this.burstFirstAt !== null && now - this.lastEventAt! > TPS_BURST_GAP_MS) {
      this.closeBurst()
      this.burstFirstAt = now
      this.burstBaseChars = totalStreamChars
    }
    this.streamChars = totalStreamChars
    this.lastEventAt = now
  }

  /** 关闭当前 burst：字符数与首末时距入账（单增量 burst 时距为 0，不入账） */
  private closeBurst(): void {
    if (this.burstFirstAt === null) return
    const chars = this.streamChars - this.burstBaseChars
    const duration = this.lastEventAt !== null ? this.lastEventAt - this.burstFirstAt : 0
    if (chars > 0 && duration > 0) {
      this.accChars += chars
      this.accDurationMs += duration
    }
    this.burstFirstAt = null
  }

  /** cumulativeOutputTokens：会话累计 outputTokens（usage.updated / 会话切换快照） */
  onUsageOutput(now: number, cumulativeOutputTokens: number): void {
    if (!this.running || !Number.isFinite(cumulativeOutputTokens)) return
    if (this.settledOutputBase === null) {
      this.settledOutputBase = cumulativeOutputTokens
      this.settledOutputLast = cumulativeOutputTokens
    }
    if (cumulativeOutputTokens > (this.settledOutputLast ?? cumulativeOutputTokens)) {
      this.settledOutputLast = cumulativeOutputTokens
      if (this.firstDeltaAt === null) this.firstDeltaAt = now
      this.lastEventAt = now
    }
  }

  /** 流式中的实时估计；无有效时距（<500ms 预热）返回 null */
  liveTps(now: number): number | null {
    if (!this.running || this.burstFirstAt === null) return null
    const elapsed = now - this.burstFirstAt
    if (elapsed < TPS_WARMUP_MS) return null
    const chars = this.streamChars - this.burstBaseChars
    if (chars <= 0) return null
    return chars / CHARS_PER_TOKEN / (elapsed / 1000)
  }

  /**
   * 轮结束结算：真实 output 增量优先，退化 chars/4；分母优先 Σburst 解码
   * 时长（排除工具间隙），无有效 burst 时退化 首 token→末事件 全时距 +
   * 全量流式字符（含工具时间，诚实低估）。无可测时距时不动样本并返回 null。
   */
  endRun(now: number): TpsSample | null {
    if (!this.running) return null
    this.running = false
    this.closeBurst()
    const spanMs =
      this.firstDeltaAt !== null && this.lastEventAt !== null
        ? Math.max(0, this.lastEventAt - this.firstDeltaAt)
        : 0
    const durationMs = this.accDurationMs > 0 ? this.accDurationMs : spanMs
    const settledDelta =
      this.settledOutputBase !== null && this.settledOutputLast !== null
        ? this.settledOutputLast - this.settledOutputBase
        : -1
    const estimateTokens =
      this.accChars > 0 || this.accDurationMs > 0 ? this.accChars / CHARS_PER_TOKEN : this.streamChars / CHARS_PER_TOKEN
    const tokens = settledDelta > 0 ? settledDelta : estimateTokens
    let sample: TpsSample | null = null
    if (tokens > 0 && durationMs > 0) {
      sample = { tps: tokens / (durationMs / 1000), at: now }
      this.samples.push(sample)
      if (this.samples.length > TPS_SAMPLES_CAP) this.samples.shift()
      this.lastRunTps = sample.tps
    }
    // 无样本时保留上一轮 lastRunTps（dsh 同款：不让估计值污染历史）
    return sample
  }
}
