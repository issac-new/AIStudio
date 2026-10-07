// overlay[eval] Eval Studio · S1 判定客户端（clef SystemOne，toolresultguard/client.ts 同款纪律）。
//
// 刻意不走上游 JEV facade / @typesafe-ai/sdk：判定端点是本地 clef_mlx.py serve，
// 与 Studio JEV Profile 解耦（toolresultguard 同款先例）。单请求多问句（P1a 三纪律
// 之一：不做多往返）：一次 /v1/systemone 并发 N 条 noul 二元断言问句。
import { createHash } from 'crypto'
import type { EvalConfig } from './types'

/** 判定端不可用/超时/响应非法的统一出口（调用方据此 fail-open：断言置 unknown，不阻塞）。 */
export class JudgeUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'JudgeUnavailableError'
  }
}

/** 熔断器：连续失败达阈值后熔断冷却，冷却期内直接 fail-open。 */
export class Breaker {
  private consecutiveFailures = 0
  private openUntil = 0
  constructor(private readonly threshold: number, private readonly cooldownMs: number) {}
  isOpen(now = Date.now()): boolean {
    return now < this.openUntil
  }
  recordSuccess(): void {
    this.consecutiveFailures = 0
    this.openUntil = 0
  }
  recordFailure(now = Date.now()): void {
    this.consecutiveFailures += 1
    if (this.consecutiveFailures >= this.threshold) {
      this.openUntil = now + this.cooldownMs
      this.consecutiveFailures = 0
    }
  }
  _state(): { consecutiveFailures: number; openUntil: number } {
    return { consecutiveFailures: this.consecutiveFailures, openUntil: this.openUntil }
  }
}

export interface TtlEntry<T> {
  value: T
  expiresAt: number
}

/** TTL 缓存（判定结果；键=证据指纹+问句集指纹——toolresultguard/cache.ts 同款）。 */
export class TtlCache<T> {
  private readonly map = new Map<string, TtlEntry<T>>()
  constructor(private readonly ttlMs: number) {}
  get(key: string, now = Date.now()): T | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (now >= entry.expiresAt) {
      this.map.delete(key)
      return undefined
    }
    return entry.value
  }
  set(key: string, value: T, now = Date.now()): void {
    if (this.ttlMs <= 0) return
    this.map.set(key, { value, expiresAt: now + this.ttlMs })
  }
  _size(): number {
    return this.map.size
  }
}

export interface EvalJudgeQuestion {
  type: 'noul'
  instructions: string
}

export interface EvalJudgeRequest {
  model: string
  state: Record<string, unknown>
  questions: Record<string, EvalJudgeQuestion>
}

/** 问句 id → P(yes)；缺失/非数值的问句不在结果里（调用方按 unknown 处理）。 */
export type EvalJudgeAnswers = Record<string, number>

export interface ClefJudgeDeps {
  fetchImpl?: typeof fetch
  now?: () => number
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 解析 SystemOne 响应为 {问句id: P(yes)}；形状不符抛 JudgeUnavailableError。 */
export function parseJudgeAnswers(body: unknown): EvalJudgeAnswers {
  if (!body || typeof body !== 'object') throw new JudgeUnavailableError('judge response is not an object')
  const answers = (body as { answers?: Record<string, unknown> }).answers
  if (!answers || typeof answers !== 'object') throw new JudgeUnavailableError('judge response missing answers')
  const out: EvalJudgeAnswers = {}
  for (const [key, raw] of Object.entries(answers)) {
    const p = asFiniteNumber((raw as { noul?: unknown } | undefined)?.noul)
    if (p === null) continue
    out[key] = p
  }
  return out
}

/** 调本地 clef 的 /v1/systemone。任何失败（网络/超时/形状）都抛 JudgeUnavailableError。 */
export async function clefAsk(
  request: EvalJudgeRequest,
  config: EvalConfig,
  deps: ClefJudgeDeps = {},
): Promise<EvalJudgeAnswers> {
  const doFetch = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.judgeTimeoutMs)
  try {
    const response = await doFetch(`${config.judgeBaseUrl}/v1/systemone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
    if (!response.ok) throw new JudgeUnavailableError(`judge endpoint HTTP ${response.status}`)
    return parseJudgeAnswers(await response.json())
  } catch (error) {
    if (error instanceof JudgeUnavailableError) throw error
    throw new JudgeUnavailableError(
      `judge endpoint unreachable: ${error instanceof Error ? error.message : String(error)}`,
      error,
    )
  } finally {
    clearTimeout(timer)
  }
}

/** 内容指纹（缓存键成分）。 */
export function sha1Of(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}
