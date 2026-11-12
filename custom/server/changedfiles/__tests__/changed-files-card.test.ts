// 每轮改动卡守门（deepseek：一轮一卡/行数账/折叠）。
import { describe, it, expect } from 'vitest'
import { changedFilesCard, type ChangedFile } from '../changed-files-card'

const f = (path: string, over: Partial<ChangedFile> = {}): ChangedFile => ({
  path, status: 'modified', added: 0, deleted: 0, ...over,
})

describe('changedFilesCard（deepseek 语义）', () => {
  it('卡头汇总总增删；折叠超出 maxFiles 为 +N more', () => {
    const files = [
      f('a.ts', { added: 3, deleted: 1 }),
      f('b.ts', { status: 'added', added: 10 }),
      f('c.ts', { status: 'deleted', deleted: 5 }),
    ]
    const card = changedFilesCard(files, 2)
    expect(card.totalAdded).toBe(13)
    expect(card.totalDeleted).toBe(6)
    expect(card.files.map((x) => x.path)).toEqual(['a.ts', 'b.ts'])
    expect(card.hiddenCount).toBe(1)
    expect(card.headline).toBe('3 files +13 -6 (+1 more)')
  })

  it('未超限不带折叠段', () => {
    const card = changedFilesCard([f('only.ts', { added: 1 })])
    expect(card.headline).toBe('1 files +1 -0')
    expect(card.hiddenCount).toBe(0)
  })
})
