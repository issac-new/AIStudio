// kanban-layout 单元：主库三态／双布局枚举／板名推导／去重／`_` 跳过／isKanbanHome。
// 覆盖批二收敛前的真实漂移面：旧布局 <home>/boards 此前只有 delivery 侧认得。
import { describe, expect, it, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  mainDbOf, boardsDirsOf, boardDbPathOf, namedBoardDbsOf, allBoardDbsOf, boardSlugOf, isKanbanHome,
} from '../kanban-layout'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function mk(...segments: string[]): string {
  const p = join(tmpdir(), `kl-${Math.random().toString(36).slice(2, 8)}`, ...segments)
  mkdirSync(p, { recursive: true })
  return p
}

function touchDb(dir: string): string {
  mkdirSync(dir, { recursive: true })
  const p = join(dir, 'kanban.db')
  writeFileSync(p, '')
  return p
}

describe('kanban-layout（布局单一事实源）', () => {
  it('主库两态：根级优先，kanban/ 根级兜底，均缺席为 null', () => {
    const h1 = mk(); touchDb(h1)
    expect(mainDbOf(h1)).toBe(join(h1, 'kanban.db'))
    const h2 = mk(); touchDb(join(h2, 'kanban'))
    expect(mainDbOf(h2)).toBe(join(h2, 'kanban', 'kanban.db'))
    const h3 = mk()
    expect(mainDbOf(h3)).toBeNull()
  })

  it('分板双布局并存时都返回（新在前）', () => {
    const h = mk()
    touchDb(join(h, 'kanban', 'boards', 'a'))
    touchDb(join(h, 'boards', 'b'))
    expect(boardsDirsOf(h)).toEqual([join(h, 'kanban', 'boards'), join(h, 'boards')])
  })

  it('default 三态与命名板双布局', () => {
    const h1 = mk(); touchDb(h1)
    expect(boardDbPathOf('default', h1)).toBe(join(h1, 'kanban.db'))
    const h2 = mk(); touchDb(join(h2, 'kanban', 'boards', 'default'))
    expect(boardDbPathOf('default', h2)).toBe(join(h2, 'kanban', 'boards', 'default', 'kanban.db'))
    const h3 = mk(); touchDb(join(h3, 'kanban'))
    expect(boardDbPathOf('default', h3)).toBe(join(h3, 'kanban', 'kanban.db'))
    const h4 = mk(); touchDb(join(h4, 'boards', 'legacy'))
    expect(boardDbPathOf('legacy', h4)).toBe(join(h4, 'boards', 'legacy', 'kanban.db'))
    expect(boardDbPathOf('missing', h4)).toBeNull()
    expect(boardDbPathOf('  ', h4)).toBeNull()
  })

  it('namedBoardDbsOf：双布局全枚举＋skipUnderscored 口径', () => {
    const h = mk()
    touchDb(join(h, 'kanban', 'boards', 'a'))
    touchDb(join(h, 'kanban', 'boards', '_archive'))
    touchDb(join(h, 'boards', 'legacy'))
    const all = namedBoardDbsOf(h)
    expect(all.map(e => e.slug).sort()).toEqual(['_archive', 'a', 'legacy'])
    const skip = namedBoardDbsOf(h, { skipUnderscored: true })
    expect(skip.map(e => e.slug).sort()).toEqual(['a', 'legacy'])
  })

  it('allBoardDbsOf：default 主库＋命名板，同路径不重复', () => {
    const h = mk()
    touchDb(h)
    touchDb(join(h, 'kanban', 'boards', 'a'))
    const all = allBoardDbsOf(h)
    expect(all.map(e => e.slug)).toEqual(['default', 'a'])
  })

  it('boardSlugOf：boards 段认板名，裸库是 default（测试库不是新板）', () => {
    expect(boardSlugOf('/tmp/x/kanban/boards/pay/kanban.db')).toBe('pay')
    expect(boardSlugOf('/tmp/x/kanban.db')).toBe('default')
    expect(boardSlugOf('/tmp/x/other.db')).toBe('other')
  })

  it('isKanbanHome：四探测等价收一', () => {
    const a = mk(); touchDb(a)
    const b = mk(); touchDb(join(b, 'kanban'))
    const c = mk(); mkdirSync(join(c, 'kanban', 'boards'), { recursive: true })
    const d = mk(); mkdirSync(join(d, 'boards'), { recursive: true })
    const e = mk()
    expect(isKanbanHome(a)).toBe(true)
    expect(isKanbanHome(b)).toBe(true)
    expect(isKanbanHome(c)).toBe(true)
    expect(isKanbanHome(d)).toBe(true)
    expect(isKanbanHome(e)).toBe(false)
  })

  it('旧布局部署下枚举不再读空（批一 P0 缺口的回归锁）', () => {
    const h = mk()
    touchDb(h)
    touchDb(join(h, 'boards', 'legacy'))
    expect(allBoardDbsOf(h).map(e => e.slug)).toContain('legacy')
    expect(mainDbOf(h)).toBe(join(h, 'kanban.db'))
  })
})
