// overlay/toolcontract 域：幂等键台账（2026-10-18 Harness 可靠性轮）。
//
// 源文《90% 的 Agent 止步于 Demo》05 节：请求层幂等键 = 工具名 + 关键参数哈希
// + 用户/账户 + 时间窗；执行前查键，命中直接复用上次结果，不再重复执行业务逻辑。
//
// 本账本先承担「可观测的幂等层」：preExecute 查键、postExecute 落键；命中时
// 审计与 govbus 可见（跨进程重启仍然有效）。真正把命中变成「跳过执行」需要
// 执行器返回缓存结果，属后续执行器改造；在此之前不改变工具执行语义。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join, resolve } from 'path'
import { computeIdempotencyKey } from './contract'

export interface IdempotencyRecord {
  key: string
  tool: string
  firstAt: number
  lastAt: number
  /** 命中次数（含首次写入后的重复调用）。 */
  count: number
  /** 结果摘要指纹（不落结果原文）。 */
  resultDigest?: string
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
  return join(homedir(), '.hermes-web-ui', 'tool-idempotency.json')
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

  /** 落键：首次写入 firstAt；重复写入只更新 lastAt/count 与结果指纹。 */
  complete(key: string, input: { tool: string; ttlMs: number; resultDigest?: string }): IdempotencyRecord {
    const loaded = this.load()
    const now = this.now()
    const existing = loaded.get(key)
    const record: IdempotencyRecord = existing
      ? { ...existing, lastAt: now, count: existing.count + 1, resultDigest: input.resultDigest ?? existing.resultDigest }
      : {
          key,
          tool: input.tool,
          firstAt: now,
          lastAt: now,
          count: 1,
          resultDigest: input.resultDigest,
          expiresAt: now + Math.max(1_000, input.ttlMs),
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
      const tmp = `${path}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 })
      renameSync(tmp, path)
    } catch { /* 写失败不阻断工具执行；幂等命中率会下降但审计仍有记录 */ }
  }
}

/** 从契约与调用上下文生成幂等键（TTL 由调用方按契约取）。 */
export function idempotencyKeyFor(input: {
  tool: string
  args: unknown
  userId?: string
  runId?: string
  ttlMs: number
  keyFields?: string[]
  now?: number
}): string {
  return computeIdempotencyKey({
    tool: input.tool,
    args: input.args,
    userId: input.userId,
    runId: input.runId,
    windowMs: input.ttlMs,
    keyFields: input.keyFields,
    now: input.now,
  })
}
