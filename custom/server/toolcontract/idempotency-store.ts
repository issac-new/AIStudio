// overlay/toolcontract 域：幂等键台账（2026-10-18 Harness 可靠性轮）。
//
// 源文《90% 的 Agent 止步于 Demo》05 节：请求层幂等键 = 工具名 + 关键参数哈希
// + 用户/账户 + 时间窗；执行前查键，命中直接复用上次结果，不再重复执行业务逻辑。
//
// 本账本先承担「可观测的幂等层」：preExecute 查键、postExecute 落键；命中时
// 审计与 govbus 可见（跨进程重启仍然有效）。真正把命中变成「跳过执行」需要
// 执行器返回缓存结果，属后续执行器改造；在此之前不改变工具执行语义。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { computeIdempotencyKey } from './contract'
import { atomicWriteText } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

/** 结果缓存上限：回放面只承载小结果（脱敏摘要级），大产物走 artifactRefs。 */
const RESULT_CACHE_MAX_BYTES = 8192

export type IdempotencyStatus = 'intended' | 'sent' | 'confirmed' | 'failed' | 'blocked'

export interface IdempotencyRecord {
  key: string
  tool: string
  firstAt: number
  lastAt: number
  /** 命中次数（含首次写入后的重复调用）。 */
  count: number
  /** 2026-11-12 handbook 吸收：动作生命周期状态。旧记录缺省=未知（按 confirmed 兼容）。 */
  status?: IdempotencyStatus
  /** 同一键的尝试次数（intent 写入累加）。 */
  attempts?: number
  /** 外部副作用标识（退款单号/PR 号/消息 id 等，由执行器可选提供）。 */
  externalRef?: string
  /** 失败归一类别（transient/permission/unknown…），由执行器提供。 */
  errorClass?: string
  /** 结算时刻（confirmed/failed/blocked 写入）。 */
  settledAt?: number
  /** 结果摘要指纹（不落结果原文）。 */
  resultDigest?: string
  /**
   * 脱敏后的结果缓存（W1 执法轮，replay:'return' 契约消费）：命中时可回放，
   * 让调用方「跳转已有记录」而非重复执行。只存脱敏摘要、8KB 上限——
   * 存的是可安全进审计面的形状，不是结果原文。
   */
  result?: unknown
  expiresAt: number
}

interface StoreFile {
  version: 1
  records: IdempotencyRecord[]
}

export interface IdempotencyStoreOptions {
  path?: string
  /** 最多保留条数（超出按 lastAt 淘汰）。 */
  maxRecords?: number
  now?: () => number
  /** 单实例可指向同一路径；测试注入临时路径。 */
}

function defaultPath(): string {
  const env = process.env.TOOL_IDEMPOTENCY_STORE?.trim()
  if (env) return resolve(env)
  return underWebUi('tool-idempotency.json')
}

/**
 * 幂等键台账：JSON 快照 + 原子替换（tmp → rename）。
 * 规模有界，不做跨进程锁——同一时刻只有一个 studio server 写入。
 */
export class IdempotencyStore {
  private readonly explicitPath?: string
  private readonly maxRecords: number
  private readonly now: () => number
  private records: Map<string, IdempotencyRecord> | null = null
  private recordsPath = ''

  constructor(opts: IdempotencyStoreOptions = {}) {
    this.explicitPath = opts.path
    this.maxRecords = Math.max(10, opts.maxRecords ?? 5_000)
    this.now = opts.now ?? Date.now
  }

  /** 路径延迟解析：测试可在 import 后设置 TOOL_IDEMPOTENCY_STORE 再调用。 */
  private resolvePath(): string {
    return this.explicitPath ?? defaultPath()
  }

  /** 只读查键：不累加命中计数（preExecute 用；计数由 complete 维护）。 */
  peek(key: string): IdempotencyRecord | null {
    const loaded = this.load()
    const record = loaded.get(key)
    if (!record) return null
    if (record.expiresAt <= this.now()) {
      loaded.delete(key)
      this.persist()
      return null
    }
    return { ...record }
  }

  /** 查键：未过期记录视为命中，并累加命中计数。 */
  lookup(key: string): IdempotencyRecord | null {
    const loaded = this.load()
    const record = loaded.get(key)
    if (!record) return null
    if (record.expiresAt <= this.now()) {
      loaded.delete(key)
      this.persist()
      return null
    }
    record.count += 1
    record.lastAt = this.now()
    this.persist()
    return { ...record }
  }

  /** 落键：首次写入 firstAt；重复写入只更新 lastAt/count 与结果指纹。
   *  result 为脱敏结果缓存（可选）：序列化超 8KB 截断为 undefined——回放面
   *  只承载小结果，大产物走 artifactRefs 路径，不进幂等账。 */
  complete(key: string, input: { tool: string; ttlMs: number; resultDigest?: string; result?: unknown }): IdempotencyRecord {
    const loaded = this.load()
    const now = this.now()
    let cached: unknown
    if (input.result !== undefined) {
      try {
        const serialized = JSON.stringify(input.result)
        cached = serialized && serialized.length <= RESULT_CACHE_MAX_BYTES ? input.result : undefined
      } catch { /* 不可序列化结果不缓存 */ }
    }
    const existing = loaded.get(key)
    const record: IdempotencyRecord = existing
      ? {
          ...existing,
          lastAt: now,
          count: existing.count + 1,
          status: 'confirmed',
          settledAt: now,
          resultDigest: input.resultDigest ?? existing.resultDigest,
          ...(cached !== undefined ? { result: cached } : {}),
        }
      : {
          key,
          tool: input.tool,
          firstAt: now,
          lastAt: now,
          count: 1,
          status: 'confirmed',
          attempts: 1,
          settledAt: now,
          resultDigest: input.resultDigest,
          ...(cached !== undefined ? { result: cached } : {}),
          expiresAt: now + Math.max(1_000, input.ttlMs),
        }
    loaded.set(key, record)
    this.evict(loaded)
    this.persist()
    return { ...record }
  }

  /**
   * 动作意图：执行前写 intended。已有 confirmed/sent/blocked 记录不降级——
   * 返回 `reused:true` 让调用方先查外部状态/直接复用；intended/failed 允许重试累加。
   */
  beginIntent(key: string, input: { tool: string; ttlMs: number }): { record: IdempotencyRecord; reused: boolean } {
    const loaded = this.load()
    const now = this.now()
    const existing = loaded.get(key)
    if (existing) {
      const status = existing.status ?? 'confirmed'
      if (status === 'confirmed' || status === 'sent' || status === 'blocked') {
        existing.lastAt = now
        this.persist()
        return { record: { ...existing }, reused: true }
      }
      const record: IdempotencyRecord = {
        ...existing,
        status: 'intended',
        attempts: (existing.attempts ?? existing.count) + 1,
        lastAt: now,
      }
      loaded.set(key, record)
      this.persist()
      return { record: { ...record }, reused: false }
    }
    const record: IdempotencyRecord = {
      key,
      tool: input.tool,
      firstAt: now,
      lastAt: now,
      count: 1,
      status: 'intended',
      attempts: 1,
      expiresAt: now + Math.max(1_000, input.ttlMs),
    }
    loaded.set(key, record)
    this.evict(loaded)
    this.persist()
    return { record: { ...record }, reused: false }
  }

  /** 已发出：执行器在动作真正进入外部系统后写（超时/断线也写 sent，不写 failed）。 */
  markSent(key: string, input: { tool: string; ttlMs: number; externalRef?: string }): IdempotencyRecord {
    return this.patch(key, {
      tool: input.tool,
      ttlMs: input.ttlMs,
      patch: { status: 'sent', settledAt: undefined, externalRef: input.externalRef },
    })
  }

  /** 已确认：拿到外部成功凭据后写；结果缓存语义同 complete。 */
  confirm(key: string, input: { tool: string; ttlMs: number; resultDigest?: string; result?: unknown; externalRef?: string }): IdempotencyRecord {
    const loaded = this.load()
    const now = this.now()
    let cached: unknown
    if (input.result !== undefined) {
      try {
        const serialized = JSON.stringify(input.result)
        cached = serialized && serialized.length <= RESULT_CACHE_MAX_BYTES ? input.result : undefined
      } catch { /* 不可序列化结果不缓存 */ }
    }
    const existing = loaded.get(key)
    const record: IdempotencyRecord = {
      ...(existing ?? { key, tool: input.tool, firstAt: now, count: 1, expiresAt: now + Math.max(1_000, input.ttlMs) }),
      lastAt: now,
      count: existing ? existing.count + 1 : 1,
      status: 'confirmed',
      settledAt: now,
      ...(input.resultDigest !== undefined ? { resultDigest: input.resultDigest } : {}),
      ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
      ...(cached !== undefined ? { result: cached } : {}),
    }
    loaded.set(key, record)
    this.evict(loaded)
    this.persist()
    return { ...record }
  }

  /** 已失败：明确失败（非超时/未知）才写；retryable 由调用方在恢复判定里消费。 */
  fail(key: string, input: { tool?: string; ttlMs?: number; errorClass?: string; externalRef?: string }): IdempotencyRecord {
    return this.patch(key, {
      tool: input.tool ?? 'unknown',
      ttlMs: input.ttlMs ?? 60_000,
      patch: { status: 'failed', settledAt: this.now(), errorClass: input.errorClass, externalRef: input.externalRef },
    })
  }

  /** 已拦截：准备执行前被策略/审批/幂等守卫拒绝。 */
  blocked(key: string, input: { tool?: string; ttlMs?: number; errorClass?: string }): IdempotencyRecord {
    return this.patch(key, {
      tool: input.tool ?? 'unknown',
      ttlMs: input.ttlMs ?? 60_000,
      patch: { status: 'blocked', settledAt: this.now(), errorClass: input.errorClass ?? 'blocked' },
    })
  }

  /** 未结算动作（intended/sent 且未过期）：恢复前必须先核对外部状态。 */
  unsettled(now = this.now()): IdempotencyRecord[] {
    const loaded = this.load()
    return [...loaded.values()]
      .filter((r) => (r.status === 'intended' || r.status === 'sent') && r.expiresAt > now)
      .sort((a, b) => b.lastAt - a.lastAt)
  }

  private patch(key: string, input: { tool: string; ttlMs: number; patch: Partial<IdempotencyRecord> }): IdempotencyRecord {
    const loaded = this.load()
    const now = this.now()
    const existing = loaded.get(key)
    const record: IdempotencyRecord = {
      ...(existing ?? {
        key,
        tool: input.tool,
        firstAt: now,
        count: 0,
        expiresAt: now + Math.max(1_000, input.ttlMs),
      }),
      lastAt: now,
      ...input.patch,
    }
    loaded.set(key, record)
    this.evict(loaded)
    this.persist()
    return { ...record }
  }

  /** 清过期记录（低频维护入口）。 */
  prune(): number {
    const loaded = this.load()
    const now = this.now()
    let removed = 0
    for (const [key, record] of loaded) {
      if (record.expiresAt <= now) {
        loaded.delete(key)
        removed += 1
      }
    }
    if (removed > 0) this.persist()
    return removed
  }

  size(): number {
    return this.load().size
  }

  private evict(records: Map<string, IdempotencyRecord>): void {
    if (records.size <= this.maxRecords) return
    const sorted = [...records.values()].sort((a, b) => a.lastAt - b.lastAt)
    const excess = records.size - this.maxRecords
    for (let i = 0; i < excess; i++) records.delete(sorted[i].key)
  }

  private load(): Map<string, IdempotencyRecord> {
    const path = this.resolvePath()
    if (this.records && this.recordsPath === path) return this.records
    const out = new Map<string, IdempotencyRecord>()
    try {
      if (existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoreFile
        const now = this.now()
        for (const record of parsed.records ?? []) {
          if (record && record.key && record.expiresAt > now) out.set(record.key, record)
        }
      }
    } catch { /* 损坏快照按空账处理：幂等层降级为观测，不影响执行 */ }
    this.records = out
    this.recordsPath = path
    return out
  }

  private persist(): void {
    if (!this.records) return
    const path = this.resolvePath()
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      const payload: StoreFile = { version: 1, records: [...this.records.values()] }
  atomicWriteText(path, JSON.stringify(payload), { mode: 0o600 })
    } catch { /* 写失败不阻断工具执行；幂等命中率会下降但审计仍有记录 */ }
  }
}

/** 从契约与调用上下文生成幂等键（TTL 由调用方按契约取）。 */
export function idempotencyKeyFor(input: {  tool: string
  args: unknown
  userId?: string
  runId?: string
  taskId?: string
  stepId?: string
  ttlMs: number
  keyFields?: string[]
  now?: number
}): string {
  return computeIdempotencyKey({
    tool: input.tool,
    args: input.args,
    userId: input.userId,
    runId: input.runId,
    taskId: input.taskId,
    stepId: input.stepId,
    windowMs: input.ttlMs,
    keyFields: input.keyFields,
    now: input.now,
  })
}

/**
 * 进程级共享单例：tool-hooks 与 contract-guard 曾各自 new 一个实例，缓存互不刷新，
 * 导致 auditHook 落键后 contractGuard.peek 看不到（同进程 replay 失效）。
 * 路径由 env 在首次解析，测试用 `_resetSharedIdempotencyStoreForTests` 清缓存。
 */
let sharedStore: IdempotencyStore | null = null

export function sharedIdempotencyStore(): IdempotencyStore {
  if (!sharedStore) sharedStore = new IdempotencyStore()
  return sharedStore
}

export function _resetSharedIdempotencyStoreForTests(): void {
  sharedStore = null
}
