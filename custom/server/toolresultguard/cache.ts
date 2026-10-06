// overlay[toolresultguard] P1a · 判定结果缓存（文 5 §6.2 幂等设计）。
//
// 同一 stage + 内容指纹在 TTL 内直接回缓存结论：本地 clef 单请求单锁、
// 1-3s 级延迟，重复内容（同一工具反复返回同一段落、重试的相同输入）
// 不应重复排队付费。内存 Map、容量上限 512、set 时顺带清扫过期项。
export interface CacheEntry<T> {
  expiresAt: number
  value: T
}

export class TtlCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()
  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 512,
    private readonly now: () => number = Date.now,
  ) {}
  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (this.now() >= entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }
  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) this.sweep()
    if (this.store.size >= this.maxEntries) {
      // 清扫后仍满：丢最旧（Map 迭代序=插入序）
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, { expiresAt: this.now() + this.ttlMs, value })
  }
  private sweep(): void {
    const now = this.now()
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) this.store.delete(key)
    }
  }
  /** 测试观测。 */
  _size(): number {
    return this.store.size
  }
}
