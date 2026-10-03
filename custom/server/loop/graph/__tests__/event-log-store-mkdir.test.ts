// overlay/custom/server/loop/graph/__tests__/event-log-store-mkdir.test.ts
// event-log-store 建库前先建父目录（2026-10-03 全功能回归实锤：新检出/私有树缺
// .loop/ 时 node:sqlite 报 unable to open database file → 静默降级 InMemory）。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createEventLogStore } from '../event-log-store'

describe('event-log-store 父目录自建', () => {
  it('路径父目录不存在时仍建 SQLite（不再降级 InMemory）', () => {
    const root = mkdtempSync(join(tmpdir(), 'evlog-'))
    const deep = join(root, 'nested', '.loop', 'graph-events.db')
    try {
      createEventLogStore(deep)
      // 降级到 InMemory 的实例没有落盘文件——existsSync 即判别
      expect(existsSync(deep)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
