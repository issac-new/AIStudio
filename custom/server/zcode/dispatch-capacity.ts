// overlay[zcode]：派单准入（DeerFlow capacity 吸收轮 2026-11-03）。
//
// 来源：DeerFlow 2.0 `subagents/capacity.py`——进程内准入控制：队列满即 `SubagentCapacityRejected`、
// 排到队却没在截止前拿到槽位即 `SubagentCapacityTimeout`。我方 `planDispatch` 只有**单槽**语义
// （同 (workspace,agent) 活跃即并入），没有**进程级并发上限**：每个 agent 各占一槽时，
// 30 个 agent 就是 30 路并发。
//
// 本模块补的是「进程级闸」：跑数达到上限时按策略处置。三条纪律：
//   · **缺省不拦**（maxRunning<=0 → 放行）——不配置就没有行为变化，避免存量部署被改变；
//   · 拒绝有具名理由（`capacity_exhausted` / `capacity_timeout`），沿用 dispatch-reasons 的
//     「决策分支处产生、原样透传 UI、不从错误串反推」纪律；
//   · 排队只是一次判定结果，不在这里持久化队列——排队的事实（已等多久）由调用方按 now 注入，
//     避免再造一个进程内队列与既有 pending 槽双重事实源。

export type CapacityPolicy = 'reject' | 'queue'

export interface CapacityFacts {
  /** 当前在本进程内活跃的 run 数（调用方注入）。 */
  runningTotal: number
  /** 并发上限；<=0 表示未配置（不拦）。 */
  maxRunning: number
  /** 饱和时的策略；缺省 reject。 */
  policy?: CapacityPolicy
  /** 已排队等待毫秒数（policy=queue 时有意义；首次判定传 0）。 */
  waitedMs?: number
  /** 排队截止毫秒（缺省 0=不设截止）。 */
  queueTimeoutMs?: number
}

export type CapacityAction = 'start' | 'reject' | 'queue'

export interface CapacityDecision {
  action: CapacityAction
  reason?: 'capacity_exhausted' | 'capacity_timeout'
  detail: string
}

/**
 * 准入判定（纯函数）。判定序：未配置 → 放行；有余量 → 放行；饱和 → 按策略排队/拒绝；
 * 排队超时 → 拒绝（`capacity_timeout`）。
 */
export function admitDispatch(facts: CapacityFacts): CapacityDecision {
  const max = Number.isFinite(facts.maxRunning) ? Math.trunc(facts.maxRunning) : 0
  const running = Math.max(0, Math.trunc(facts.runningTotal) || 0)
  if (max <= 0) {
    return { action: 'start', detail: `未配置并发上限（maxRunning=${facts.maxRunning}）——放行` }
  }
  if (running < max) {
    return { action: 'start', detail: `并发 ${running}/${max}，有余量` }
  }
  const policy: CapacityPolicy = facts.policy === 'queue' ? 'queue' : 'reject'
  if (policy === 'reject') {
    return {
      action: 'reject',
      reason: 'capacity_exhausted',
      detail: `并发已达上限 ${running}/${max}，按 reject 策略直接拒绝（等待无用：槽位要等既有 run 结束）`,
    }
  }
  const waited = Math.max(0, Math.trunc(facts.waitedMs ?? 0) || 0)
  const timeout = Math.max(0, Math.trunc(facts.queueTimeoutMs ?? 0) || 0)
  if (timeout > 0 && waited >= timeout) {
    return {
      action: 'reject',
      reason: 'capacity_timeout',
      detail: `并发已达上限 ${running}/${max}，排队 ${Math.round(waited / 1000)}s 超过截止 ${Math.round(timeout / 1000)}s——拒绝`,
    }
  }
  return {
    action: 'queue',
    detail: timeout > 0
      ? `并发已达上限 ${running}/${max}，排队等待（截止 ${Math.round(timeout / 1000)}s）`
      : `并发已达上限 ${running}/${max}，排队等待（未设截止）`,
  }
}

/** 从环境变量读上限与策略（调用方装配用；纯函数，不读 env）。 */
export function capacityFromEnv(env: Record<string, string | undefined>, runningTotal: number): CapacityFacts {
  const max = Number(env.ZCODE_MAX_CONCURRENT_RUNS ?? 0)
  const policyRaw = String(env.ZCODE_CAPACITY_POLICY ?? 'reject').trim()
  const timeoutMs = Number(env.ZCODE_CAPACITY_QUEUE_TIMEOUT_MS ?? 0)
  return {
    runningTotal,
    maxRunning: Number.isFinite(max) ? max : 0,
    policy: policyRaw === 'queue' ? 'queue' : 'reject',
    waitedMs: 0,
    queueTimeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 0,
  }
}
