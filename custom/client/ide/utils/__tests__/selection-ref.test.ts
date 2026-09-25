// 选区引用守门（codex-product：校验/@ 形态/引用卡）。
import { describe, it, expect } from 'vitest'
import { validateSelectionRef, formatSelectionRef, renderSelectionCard, type SelectionRef } from '../selection-ref'

const ref = (over: Partial<SelectionRef> = {}): SelectionRef => ({
  path: 'src/a.ts', startLine: 10, endLine: 20, snippet: 'const x = 1\nconst y = 2', ...over,
})

describe('validateSelectionRef', () => {
  it('合法通过；起点<1/区间倒置/空片段拒', () => {
    expect(validateSelectionRef(ref()).ok).toBe(true)
    expect(validateSelectionRef(ref({ startLine: 0 })).problem).toContain('startLine')
    expect(validateSelectionRef(ref({ endLine: 5 })).problem).toContain('endLine')
    expect(validateSelectionRef(ref({ snippet: '  ' })).problem).toContain('empty')
  })
})

describe('formatSelectionRef / renderSelectionCard', () => {
  it('@file:path:L区间 形态', () => {
    expect(formatSelectionRef(ref())).toBe('@file:src/a.ts:L10-L20')
  })
  it('引用卡含路径+区间+首行摘要（60 字截断）', () => {
    expect(renderSelectionCard(ref())).toBe('src/a.ts L10-L20 · const x = 1')
    const long = ref({ snippet: 'z'.repeat(80) })
    expect(renderSelectionCard(long).endsWith('…')).toBe(true)
  })
})
