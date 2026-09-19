// overlay/custom/client/ide/utils/pins.ts
// /ide 侧栏自有置顶（localStorage 持久化）。
// 背景：上游 session-browser-prefs store 无 pinnedIds API（曾见到的版本是
// 并行会话临时态），置顶在此自治，与历史页互不影响。
const KEY = 'hermes_ide_pins_v1'

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function useIdePins() {
  let pins = load()
  const listeners = new Set<() => void>()

  function persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify(pins)) } catch { /* 配额满忽略 */ }
    for (const fn of listeners) fn()
  }

  return {
    get pinnedIds(): string[] { return pins },
    isPinned(id: string): boolean { return pins.includes(id) },
    togglePinned(id: string): void {
      pins = pins.includes(id) ? pins.filter(x => x !== id) : [...pins, id]
      persist()
    },
    onChange(fn: () => void): () => void {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

export type IdePins = ReturnType<typeof useIdePins>
