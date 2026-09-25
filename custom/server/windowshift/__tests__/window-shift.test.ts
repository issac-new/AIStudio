// 换窗决策守门（codex：critical 事实强制 compact/可弃换窗/剪枝居中）。
import { describe, it, expect } from 'vitest'
import { chooseOverflowStrategy } from '../window-shift'

describe('溢出三策略（codex 换窗语义）', () => {
  it('critical 事实强制 compact；可弃旧窗 shift；其余 prune', () => {
    expect(chooseOverflowStrategy({ overageTokens: 100, droppableHistory: true, hasCriticalFacts: true }).strategy).toBe('compact')
    expect(chooseOverflowStrategy({ overageTokens: 100, droppableHistory: true, hasCriticalFacts: false })).toMatchObject({ strategy: 'shift' })
    const p = chooseOverflowStrategy({ overageTokens: 500, droppableHistory: false, hasCriticalFacts: false })
    expect(p.strategy).toBe('prune')
    expect(p.detail).toContain('500')
  })
})
