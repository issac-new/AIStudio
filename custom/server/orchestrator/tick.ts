// custom/server/orchestrator/tick.ts
// 编排轮（2026-10-31 定时轮批）：一次把「事件进来 → 判断 → 汇总 → 投递」走完。
// 设计：
// - 桥接必跑（只读看板库，按游标增量）；
// - 评估受 evalEnabled 控制（每次评估都会调一次模型，默认限量）；
// - 汇总只对**有订阅的线程**生成；生成后推进订阅游标，避免同一批事件反复汇总；
// - 投递复用 delivery.ts，成功置 delivered。
// 失败不抛：任一步出错记入 errors，其余步骤继续（fail-soft，不静默）。
import { deliverPendingDigests, type DeliveryResult } from './delivery'
import { evaluatePending, type EvaluationPassResult } from './pass'
import { bridgeAll } from './kanban-bridge'
import { insertDigest, listThreads } from './store'
import { summarize } from './summarizer'
import { markRead, pendingFor, subscriptionsOf } from './thread'
import type { SemanticVerdict, Trigger } from './types'

export interface TickResult {
  bridged: number
  evaluated: number
  digests: number
  delivered: number
  skippedDeliver: number
  errors: string[]
}

export interface TickOptions {
  bridgeLimit?: number
  evalLimit?: number
  evalEnabled?: boolean
  deliverLimit?: number
  env?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
  dbPaths?: string[]
  /** 测试注入：替换语义评估实现。 */
  evaluate?: (trigger: Trigger, context: Trigger[]) => Promise<SemanticVerdict>
}

/** 汇总生成：对有订阅的线程，把订阅者游标之后的增量事件合成一条并推进游标。 */
export function generateDigests(limitThreads = 50): { digests: number; errors: string[] } {
  let digests = 0
  const errors: string[] = []
  const threads = listThreads(limitThreads)
  for (const thread of threads) {
    const subs = subscriptionsOf(thread.id)
    for (const sub of subs) {
      try {
        const pending = pendingFor(thread.id, sub.subscriber)
        if (!pending.length) continue
        const digest = summarize(thread.id, sub.subscriber, pending)
        if (!digest) {
          // 静默：只有列变更，但游标照样推进，避免下一轮重复扫描同一批。
          markRead(thread.id, sub.subscriber, pending[pending.length - 1]!.id)
          continue
        }
        insertDigest(digest)
        markRead(thread.id, sub.subscriber, pending[pending.length - 1]!.id)
        digests++
      } catch (e) {
        errors.push(`digest:${thread.id}:${sub.subscriber}:${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return { digests, errors }
}

export async function runOrchestratorTick(opts: TickOptions = {}): Promise<TickResult> {
  const result: TickResult = {
    bridged: 0, evaluated: 0, digests: 0, delivered: 0, skippedDeliver: 0, errors: [],
  }

  // 1) 桥接：看板事件 → Trigger
  try {
    const rows = bridgeAll({ limit: opts.bridgeLimit ?? 100, dbPaths: opts.dbPaths })
    result.bridged = rows.length
  } catch (e) {
    result.errors.push(`bridge:${e instanceof Error ? e.message : String(e)}`)
  }

  // 2) 评估：只在新 pending 时调用模型；受额度限制
  const evalEnabled = opts.evalEnabled ?? true
  if (evalEnabled) {
    try {
      const evalResult: EvaluationPassResult = await evaluatePending({
        limit: opts.evalLimit ?? evalLimitFromEnv(opts.env ?? process.env),
        env: opts.env,
        evaluate: opts.evaluate,
      })
      result.evaluated = evalResult.evaluated
    } catch (e) {
      result.errors.push(`evaluate:${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 3) 汇总：只为有订阅的线程生成
  const digestResult = generateDigests()
  result.digests = digestResult.digests
  result.errors.push(...digestResult.errors)

  // 4) 投递
  try {
    const delivery: DeliveryResult = await deliverPendingDigests({
      limit: opts.deliverLimit ?? 20,
      env: opts.env,
      fetchImpl: opts.fetchImpl,
      dbPaths: opts.dbPaths,
    })
    result.delivered = delivery.delivered
    result.skippedDeliver = delivery.skipped
    if (delivery.failed) result.errors.push(`deliver_failed:${delivery.failed}`)
  } catch (e) {
    result.errors.push(`deliver:${e instanceof Error ? e.message : String(e)}`)
  }

  return result
}

/** 编排轮间隔：env 控制，默认 0=关闭（不自动跑）。 */
export function tickIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.ORCHESTRATOR_TICK_INTERVAL_MS ?? '')
  return Number.isFinite(raw) && raw >= 10_000 ? Math.min(Math.floor(raw), 3_600_000) : 0
}

/** 评估开关：默认开，设 ORCHESTRATOR_EVAL_ON_TICK=0 关掉（只桥接与投递）。 */
export function evalOnTick(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ORCHESTRATOR_EVAL_ON_TICK ?? '').trim() !== '0'
}

/** 每轮评估上限：默认 2，范围 1-20（每次评估一次模型调用，别开太大）。 */
export function evalLimitFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.ORCHESTRATOR_EVAL_LIMIT ?? '')
  return Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 20) : 2
}
