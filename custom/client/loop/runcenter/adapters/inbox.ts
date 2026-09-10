// overlay/custom/client/loop/runcenter/adapters/inbox.ts
// 介入收件箱归档标记（task-7，§7B.1 两态）：用户点"归档"仅在本地 kv 打标，
// 不改 run 状态（服务端仍是 awaiting-input）。cockpit-kv 同款纪律：
// safe get/set（quota/异常静默）、JSON 畸形按空兜底。storage 可注入：
// 缺省用全局 localStorage；显式传 null 时退化为纯内存映射（不落盘，SSR/异常环境安全）。

/** localStorage 中的归档映射键（runId → 归档时刻 ISO） */
export const INBOX_ARCHIVED_KEY = 'runcenter:inbox:archived'

/** 结构化 Storage 子集（测试注入内存实现，不耦合 DOM localStorage） */
export type KvStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function resolveStorage(storage?: KvStorage | null): KvStorage | null {
  if (storage !== undefined) return storage
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** 读取归档映射；畸形 JSON / 非对象载荷按空映射兜底 */
export function loadArchivedMap(storage?: KvStorage | null): Record<string, string> {
  const store = resolveStorage(storage)
  if (!store) return {}
  let raw: string | null = null
  try { raw = store.getItem(INBOX_ARCHIVED_KEY) } catch { return {} }
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** 写回映射（写入失败静默——归档是本地便利标记，不值得打断用户） */
function writeMap(store: KvStorage | null, map: Record<string, string>): void {
  if (!store) return
  try { store.setItem(INBOX_ARCHIVED_KEY, JSON.stringify(map)) } catch { /* quota 静默 */ }
}

/** markArchived — 归档标记 runId（重复归档只更新时刻）；返回更新后的映射 */
export function markArchived(runId: string, ts: string, storage?: KvStorage | null): Record<string, string> {
  const store = resolveStorage(storage)
  const next = { ...loadArchivedMap(store), [runId]: ts }
  writeMap(store, next)
  return next
}

/** unmarkArchived — 取消归档标记；返回更新后的映射 */
export function unmarkArchived(runId: string, storage?: KvStorage | null): Record<string, string> {
  const store = resolveStorage(storage)
  const next = { ...loadArchivedMap(store) }
  delete next[runId]
  writeMap(store, next)
  return next
}
