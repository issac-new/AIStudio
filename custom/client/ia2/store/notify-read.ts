// overlay/custom/client/ia2/store/notify-read.ts
// v12.3 通知已读态（2026-09-20 用户裁定：通知下拉允许清除已读未读状态）。
// 单一事实源 localStorage（同 cockpit-kv 模式）：键为条目去重 id
// （waiting 的 task:/run:/fleet: 前缀 id + 评审门 gate: 前缀 id + 收件箱条目 id）。
// 只存已读集合——条目本体仍在各 store，消失即自动出集合（写入侧惰性清扫）。
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const KEY_READ = 'ia2.notifyRead'
const MAX_READ = 2000

function loadRead(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_READ)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function persistRead(set: Set<string>): void {
  try {
    // 封顶防膨胀：超限时丢最旧（Set 保插入序，取后半段）
    let arr = [...set]
    if (arr.length > MAX_READ) arr = arr.slice(arr.length - MAX_READ)
    localStorage.setItem(KEY_READ, JSON.stringify(arr))
  } catch { /* quota 失败静默 */ }
}

export const useNotifyReadStore = defineStore('ia2-notify-read', () => {
  const readIds = ref<Set<string>>(loadRead())

  function _write(next: Set<string>): void {
    readIds.value = next
    persistRead(next)
  }

  function isRead(id: string): boolean {
    return readIds.value.has(id)
  }

  function markRead(id: string): void {
    if (readIds.value.has(id)) return
    _write(new Set([...readIds.value, id]))
  }

  function markManyRead(ids: readonly string[]): void {
    const next = new Set(readIds.value)
    let changed = false
    for (const id of ids) {
      if (!next.has(id)) { next.add(id); changed = true }
    }
    if (changed) _write(next)
  }

  /** 清除单条已读标记（恢复为未读） */
  function unreadOne(id: string): void {
    if (!readIds.value.has(id)) return
    const next = new Set(readIds.value)
    next.delete(id)
    _write(next)
  }

  /** 清除全部已读状态（全部恢复为未读） */
  function clearRead(): void {
    _write(new Set())
  }

  /** 有效已读数（相对当前存活条目集合；已消失条目不计数，惰性清扫） */
  const aliveReadCountIn = computed(() => (ids: readonly string[]) => {
    let n = 0
    for (const id of ids) if (readIds.value.has(id)) n++
    return n
  })

  /** 未读数 = 存活条目 − 已读 */
  function unreadCount(ids: readonly string[]): number {
    let n = 0
    for (const id of ids) if (!readIds.value.has(id)) n++
    return n
  }

  return { readIds, isRead, markRead, markManyRead, unreadOne, clearRead, aliveReadCountIn, unreadCount }
})
