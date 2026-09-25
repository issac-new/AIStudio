// 交接话术守门（dsh：六段齐备/空段拒/空行拒/渲染）。
import { describe, it, expect } from 'vitest'
import { validateHandoff, renderHandoff, type Handoff } from '../handoff-script'

const full = (): Handoff => ({
  done: ['a 完成'],
  notDone: ['无'],
  risks: ['无'],
  next: ['b 待办'],
  artifacts: ['custom/server/x.ts'],
  verify: ['npx vitest run custom/server/x/'],
})

describe('validateHandoff（六段守门）', () => {
  it('齐备即 ok', () => {
    const d = validateHandoff(full())
    expect(d.ok).toBe(true)
    expect(d.problems).toEqual([])
  })
  it('空段/空行段拒（含 notDone 空数组——空须显式写无）', () => {
    const bad = full()
    bad.risks = []
    bad.done = ['']
    const d = validateHandoff(bad)
    expect(d.ok).toBe(false)
    expect(d.problems).toContain('empty:risks')
    expect(d.problems).toContain('blank-line:done')
  })
})

describe('renderHandoff（final message=entire handoff）', () => {
  it('六段标题全在', () => {
    const text = renderHandoff(full())
    for (const t of ['## 已完成', '## 未完成', '## 风险', '## 下一步', '## 产物', '## 复核']) {
      expect(text).toContain(t)
    }
  })
})
