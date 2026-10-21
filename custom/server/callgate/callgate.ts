// overlay/callgate 域：LLM 与 MCP 工具调用的流量稳定性四件套（2026-10-21 三号调研落地）。
//
// 来源：《Agent 架构设计 16》——大流量下 LLM、MCP 工具抖动、并发打爆资源需要
// 限流、熔断、降级、排队调度四层防护；《Agent 架构设计 19》调度上下文三实体
//（AgentQuota/TaskQueueItem/CircuitBreakerRecord）与五类降级策略、重试与熔断
// 互斥规则（熔断 OPEN 期间禁止重试、半开只放探测）。现状盘点：预算域只记账
//（warn/downgrade/block 三动作）不执法，判分端有熔断但只护评测，通用 LLM/MCP
// 调用面无限流无限流背压——本域补这一层，纯函数 + 可注入时钟，不绑定具体 SDK。
//
// 执法定位：调用方向 callgate 问路（admit），由调用方执行排队/降级/拒绝；
// 观测面（obs-signals 的 429 率）与本域共享同一时间戳语义。
export type ResourceKind = 'llm' | 'mcp' | 'tool'

/** 资源坐标：kind:key，如 llm:glm-5.3 / mcp:filesystem / tool:web_search。 */
export interface CallResource {
  kind: ResourceKind
  key: string
}

export function resourceId(r: CallResource): string {
  return `${r.kind}:${r.key}`
}

/** 并发与速率双限流（per resource；租户/Agent 维度由调用方复合进 key）。 */
export interface QuotaRule {
  maxConcurrent: number
  maxPerMinute: number
}

/** 熔断规则：窗口内失败数达阈值 → OPEN；冷却期满 → HALF_OPEN 只放探测。 */
export interface BreakerRule {
  failureThreshold: number
  windowMs: number
  openMs: number
  /** 半开态并发探测上限（默认 1：只放一个探针）。 */
  halfOpenProbes: number
}

export interface CallgateRule {
  resource: CallResource
  quota: QuotaRule
  breaker: BreakerRule
}

// ---- 熔断器（按资源隔离；三态：CLOSED → OPEN → HALF_OPEN） ----

export type BreakerState = 'closed' | 'open' | 'half-open'

export interface BreakerSnapshot {
  state: BreakerState
  /** 窗口内失败时间戳。 */
  failures: number[]
  openedAt: number | null
  halfOpenInFlight: number
}

export function initialBreaker(): BreakerSnapshot {
  return { state: 'closed', failures: [], openedAt: null, halfOpenInFlight: 0 }
}

/** 前推断言：当前态是否放行（半开只放探测名额）。 */
export function breakerAllows(snapshot: BreakerSnapshot, rule: BreakerRule, now: number): boolean {
  if (snapshot.state === 'closed') return true
  if (snapshot.state === 'open') {
    return now >= (snapshot.openedAt ?? 0) + rule.openMs ? snapshot.halfOpenInFlight < Math.max(1, rule.halfOpenProbes) : false
  }
  return snapshot.halfOpenInFlight < Math.max(1, rule.halfOpenProbes)
}

/** 失败入账：CLOSED 判阈值跳 OPEN；HALF_OPEN 失败即回 OPEN（冷却重置）。 */
export function recordFailure(snapshot: BreakerSnapshot, rule: BreakerRule, now: number): BreakerSnapshot {
  if (snapshot.state === 'open') {
    // OPEN 期间到达的迟到失败不重复触发
    return snapshot
  }
  if (snapshot.state === 'half-open') {
    return { state: 'open', failures: [now], openedAt: now, halfOpenInFlight: 0 }
  }
  const failures = [...snapshot.failures.filter((t) => now - t < rule.windowMs), now]
  if (failures.length >= rule.failureThreshold) {
    return { state: 'open', failures, openedAt: now, halfOpenInFlight: 0 }
  }
  return { ...snapshot, failures }
}

/** 成功入账：任何态都收敛回 CLOSED（半开探测成功=恢复）。 */
export function recordSuccess(snapshot: BreakerSnapshot): BreakerSnapshot {
  return initialBreaker()
}

/** 半开探测出发登记（放行方在 allows=true 且态非 closed 时调用）。 */
export function beginHalfOpenProbe(snapshot: BreakerSnapshot): BreakerSnapshot {
  return snapshot.state === 'half-open' ? { ...snapshot, halfOpenInFlight: snapshot.halfOpenInFlight + 1 } : snapshot
}

// ---- 滑动窗口限流 ----

export interface LimiterSnapshot {
  /** 窗口内放行时间戳（per resource，由注册表分键保管）。 */
  granted: number[]
}

export interface RateVerdict {
  allowed: boolean
  usedPerMinute: number
  /** 拒绝时：窗口最早一条滑出所需的毫秒。 */
  retryAfterMs: number
}

export function tryAcquire(granted: number[], quota: QuotaRule, now: number): { verdict: RateVerdict; granted: number[] } {
  const window = [...granted.filter((t) => now - t < 60_000)]
  if (window.length >= quota.maxPerMinute) {
    const retryAfterMs = Math.max(0, 60_000 - (now - window[0]))
    return { verdict: { allowed: false, usedPerMinute: window.length, retryAfterMs }, granted: window }
  }
  const next = [...window, now]
  return { verdict: { allowed: true, usedPerMinute: next.length, retryAfterMs: 0 }, granted: next }
}

// ---- 准入裁决 ----

export type AdmitVerdict =
  | 'allow'
  | 'queued'
  | 'rate_limited'
  | 'breaker_open'
  | 'concurrency_full'
  | 'queue_timeout'

export interface AdmitInput {
  rule: CallgateRule
  breaker: BreakerSnapshot
  granted: number[]
  inFlight: number
  /** 排队深度（当前等待数）。 */
  queueDepth: number
  now: number
}

export interface AdmitDecision {
  verdict: AdmitVerdict
  resource: string
  /** rate_limited 时的等待毫秒；其他态为 0。 */
  retryAfterMs: number
  breakerState: BreakerState
  usedPerMinute: number
}

/**
 * 准入次序（先熔断后并发再速率）：资源已经熔断时谈限流没有意义；并发满走
 * 排队（容量内），容量满即拒；速率超窗返回可等待时长（调用方选择排队或降速）。
 */
export function admit(input: AdmitInput): AdmitDecision {
  const { rule, breaker, granted, inFlight, queueDepth, now } = input
  const id = resourceId(rule.resource)
  if (!breakerAllows(breaker, rule.breaker, now)) {
    const coolRemaining = breaker.state === 'open' ? Math.max(0, (breaker.openedAt ?? 0) + rule.breaker.openMs - now) : 0
    return { verdict: 'breaker_open', resource: id, retryAfterMs: coolRemaining, breakerState: breaker.state, usedPerMinute: granted.length }
  }
  const { verdict } = tryAcquire(granted, rule.quota, now)
  if (!verdict.allowed) {
    return { verdict: 'rate_limited', resource: id, retryAfterMs: verdict.retryAfterMs, breakerState: breaker.state, usedPerMinute: verdict.usedPerMinute }
  }
  if (inFlight >= rule.quota.maxConcurrent) {
    // 并发满：队列还有容量就排队，没容量就拒绝（不做无界等待）
    const queued = queueDepth < rule.quota.maxConcurrent ? 'queued' : 'concurrency_full'
    return { verdict: queued, resource: id, retryAfterMs: 0, breakerState: breaker.state, usedPerMinute: verdict.usedPerMinute }
  }
  return { verdict: 'allow', resource: id, retryAfterMs: 0, breakerState: breaker.state, usedPerMinute: verdict.usedPerMinute }
}

// ---- 降级阶梯（预定义，不交给 LLM 自选） ----

export type DegradeAction =
  | 'none'
  | 'queue'
  | 'degrade_model' // 主模型熔断 → 切低成本备模
  | 'degrade_tools' // 禁高危慢工具，留只读
  | 'handoff_human' // 转人工
  | 'reject'

/** 降级映射表（可全局配置或按 Agent 覆盖；这里给缺省阶梯）。 */
export function degradeActionFor(verdict: AdmitVerdict, resourceKind: ResourceKind): DegradeAction {
  switch (verdict) {
    case 'allow': return 'none'
    case 'queued': return 'queue'
    case 'rate_limited': return resourceKind === 'llm' ? 'degrade_model' : 'queue'
    case 'breaker_open': return resourceKind === 'llm' ? 'degrade_model' : 'degrade_tools'
    case 'concurrency_full': return 'reject'
    case 'queue_timeout': return 'handoff_human'
  }
}

// ---- 重试 × 熔断互斥 ----

/**
 * 互斥规则（源文铁律）：熔断 OPEN 期间禁止一切重试（雪崩保护）；HALF_OPEN
 * 只放探测（探测即首次尝试，不算重试）；CLOSED 才按策略重试。重试占配额——
 * 判定方须同时过限流面（admit），这里只管熔断互斥这一维。
 */
export function retryPermitted(breaker: BreakerSnapshot, rule: BreakerRule, attempt: number, maxAttempts: number, now: number): boolean {
  if (attempt < 1 || attempt > Math.max(0, maxAttempts)) return false
  if (breaker.state === 'open') return false
  if (breaker.state === 'half-open') return attempt === 1 && breakerAllows(breaker, rule, now)
  return true
}

// ---- 注册表（进程内；时钟可注入，测试确定性） ----

export interface CallgateStatus {
  resource: string
  breaker: BreakerSnapshot
  usedPerMinute: number
  inFlight: number
  queueDepth: number
}

export interface CallgateOptions {
  now?: () => number
  maxTracked?: number
}

export class CallgateRegistry {
  private readonly rules = new Map<string, CallgateRule>()
  private readonly breakers = new Map<string, BreakerSnapshot>()
  private readonly granted = new Map<string, number[]>()
  private readonly inFlight = new Map<string, number>()
  private readonly queueDepth = new Map<string, number>()
  private readonly now: () => number
  private readonly maxTracked: number

  constructor(opts: CallgateOptions = {}) {
    this.now = opts.now ?? Date.now
    this.maxTracked = Math.max(1, opts.maxTracked ?? 500)
  }

  setRule(rule: CallgateRule): void {
    this.rules.set(resourceId(rule.resource), rule)
  }

  getRule(resource: CallResource): CallgateRule | undefined {
    return this.rules.get(resourceId(resource))
  }

  /** 缺省规则：未登记的资源按保守并发 4/每分钟 60 放行（fail-open 不静默杀流量）。 */
  private ruleFor(resource: CallResource): CallgateRule {
    return this.getRule(resource) ?? {
      resource,
      quota: { maxConcurrent: 4, maxPerMinute: 60 },
      breaker: { failureThreshold: 5, windowMs: 60_000, openMs: 30_000, halfOpenProbes: 1 },
    }
  }

  private breakerOf(id: string): BreakerSnapshot {
    return this.breakers.get(id) ?? initialBreaker()
  }

  /** 准入问路：放行即占用速率窗与并发位（begin 由调用方在真正发起时确认）。 */
  check(resource: CallResource): AdmitDecision {
    const now = this.now()
    const id = resourceId(resource)
    const rule = this.ruleFor(resource)
    const decision = admit({
      rule,
      breaker: this.breakerOf(id),
      granted: this.granted.get(id) ?? [],
      inFlight: this.inFlight.get(id) ?? 0,
      queueDepth: this.queueDepth.get(id) ?? 0,
      now,
    })
    if (decision.verdict === 'allow') {
      const { granted } = tryAcquire(this.granted.get(id) ?? [], rule.quota, now)
      this.granted.set(id, granted)
      this.inFlight.set(id, (this.inFlight.get(id) ?? 0) + 1)
      // OPEN 冷却期满后的首次放行 = 半开探测出发（状态迁移在这里闭环）
      const prev = this.breakerOf(id)
      let next = prev
      if (prev.state === 'open' && now >= (prev.openedAt ?? 0) + rule.breaker.openMs) {
        next = { ...prev, state: 'half-open', halfOpenInFlight: 1 }
      } else if (prev.state === 'half-open') {
        next = beginHalfOpenProbe(prev)
      }
      if (next !== prev) this.breakers.set(id, next)
      this.evict()
    }
    return decision
  }

  /** 调用结束回执：成功/失败入账熔断器，释放并发位。 */
  settle(resource: CallResource, ok: boolean): BreakerSnapshot {
    const now = this.now()
    const id = resourceId(resource)
    const rule = this.ruleFor(resource)
    const prev = this.breakerOf(id)
    const next = ok ? recordSuccess(prev) : recordFailure(prev, rule.breaker, now)
    this.breakers.set(id, next)
    this.inFlight.set(id, Math.max(0, (this.inFlight.get(id) ?? 1) - 1))
    return next
  }

  status(resource: CallResource): CallgateStatus {
    const id = resourceId(resource)
    const granted = (this.granted.get(id) ?? []).filter((t) => this.now() - t < 60_000)
    return {
      resource: id,
      breaker: this.breakerOf(id),
      usedPerMinute: granted.length,
      inFlight: this.inFlight.get(id) ?? 0,
      queueDepth: this.queueDepth.get(id) ?? 0,
    }
  }

  listStatuses(): CallgateStatus[] {
    const ids = new Set<string>([...this.rules.keys(), ...this.breakers.keys(), ...this.granted.keys()])
    return [...ids].map((id) => this.status({ kind: id.slice(0, id.indexOf(':')) as ResourceKind, key: id.slice(id.indexOf(':') + 1) }))
  }

  /** 测试/收口用。 */
  reset(): void {
    this.rules.clear()
    this.breakers.clear()
    this.granted.clear()
    this.inFlight.clear()
    this.queueDepth.clear()
  }

  private evict(): void {
    if (this.granted.size <= this.maxTracked) return
    let oldest = ''
    let oldestAt = Infinity
    for (const [id, list] of this.granted) {
      const first = list[0] ?? Infinity
      if (first < oldestAt) { oldestAt = first; oldest = id }
    }
    if (oldest) this.granted.delete(oldest)
  }
}
