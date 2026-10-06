// overlay[toolresultguard] P1a · S1 判定客户端 + 熔断器（文 5 §8 供应商依赖对策）。
//
// 刻意不走上游 JEV facade / @typesafe-ai/sdk：本守卫的判定端点是本地
// clef_mlx.py serve（自有配置），与 Studio 的 JEV Profile 设置解耦——切换
// 四门（P2 第 0 步）与本守卫互不影响；也因此不在 jev-harness 契约注册面内
// （无 facade/SDK import，toolpipeline 同款先例）。
import { createHash } from 'crypto'
import type { GuardConfig, JudgeAnswers } from './types'
import type { SystemOneRequest } from './questions'

/** 判定端不可用/超时/响应非法的统一出口（调用方据此 fail-open）。 */
export class JudgeUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'JudgeUnavailableError'
  }
}

/** 熔断器：连续失败达阈值后熔断冷却，冷却期内直接 fail-open（不再烧 3s 超时）。 */
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
  /** 测试观测。 */
  _state(): { consecutiveFailures: number; openUntil: number } {
    return { consecutiveFailures: this.consecutiveFailures, openUntil: this.openUntil }
  }
}

export interface ClefJudgeDeps {
  fetchImpl?: typeof fetch
  now?: () => number
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 解析 SystemOne 响应为 JudgeAnswers；形状不符抛 JudgeUnavailableError。 */
export function parseJudgeAnswers(body: unknown): JudgeAnswers {
  if (!body || typeof body !== 'object') throw new JudgeUnavailableError('judge response is not an object')
  const answers = (body as { answers?: Record<string, unknown> }).answers
  if (!answers || typeof answers !== 'object') throw new JudgeUnavailableError('judge response missing answers')
  const attack = answers.is_attack as { noul?: unknown } | undefined
  const attackP = asNumber(attack?.noul)
  if (attackP === null) throw new JudgeUnavailableError('judge response missing is_attack.noul')
  const categoryAnswer = answers.attack_category as { choice?: unknown } | undefined
  const severityAnswer = answers.severity as { score?: unknown } | undefined
  return {
    attackP,
    category: typeof categoryAnswer?.choice === 'string' ? categoryAnswer.choice : null,
    severity: asNumber(severityAnswer?.score) ?? 0,
  }
}

/** 调本地 clef 的 /v1/systemone。任何失败（网络/超时/形状）都抛 JudgeUnavailableError。 */
export async function clefJudge(
  request: SystemOneRequest,
  config: GuardConfig,
  deps: ClefJudgeDeps = {},
): Promise<JudgeAnswers> {
  const doFetch = deps.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await doFetch(`${config.baseUrl}/v1/systemone`, {
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

/** 内容指纹（缓存键成分 + 留痕防泄原文）。 */
export function sha1Of(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}
