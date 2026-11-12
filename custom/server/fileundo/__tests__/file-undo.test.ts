// 逐文件 Undo 计划守门（codex-product：三态/逐文件独立/回写计划）。
import { describe, it, expect } from 'vitest'
import { undoPlan } from '../file-undo'

const restore = (map: Record<string, string | null>) => (path: string) => map[path] ?? null

describe('undoPlan（逐文件 Undo）', () => {
  it('三态：undoable/no-snapshot/undone 逐文件独立', () => {
    const plan = undoPlan('t1', 3, ['a.ts', 'b.ts', 'c.ts'], restore({
      'a.ts': 'old a', 'b.ts': null,
    }), ['c.ts'])
    const byPath = Object.fromEntries(plan.rows.map((r) => [r.path, r.state]))
    expect(byPath).toEqual({ 'a.ts': 'undoable', 'b.ts': 'no-snapshot', 'c.ts': 'undone' })
    expect(plan.writes).toEqual([{ path: 'a.ts', content: 'old a' }])
    expect(plan.taskId).toBe('t1')
    expect(plan.turnIndex).toBe(3)
  })

  it('空路径=空计划', () => {
    const plan = undoPlan('t', 0, [], restore({}))
    expect(plan.rows).toEqual([])
    expect(plan.writes).toEqual([])
  })
})
