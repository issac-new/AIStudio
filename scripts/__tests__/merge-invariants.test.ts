// 守门:合并不变量的集合等式与附录解析。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 C2）
import { describe, expect, it } from 'vitest'
import { compareDocsSets, parseAppendix, main } from '../merge-invariants.mjs'

describe('compareDocsSets', () => {
  it('A.1 ∪ 角色表 == specs 时四项全空', () => {
    const r = compareDocsSets(['a.md', 'b.md', 'c.md'], ['a', 'b'], ['c'])
    expect(r.missing).toEqual([])
    expect(r.ghosts).toEqual([])
    expect(r.duplicates).toEqual([])
    expect(r.overlap).toEqual([])
  })
  it('missing/ghosts/duplicates/overlap 全部报出', () => {
    const r = compareDocsSets(['a.md', 'b.md', 'c.md', 'd.md'], ['a', 'a', 'x'], ['a', 'b'])
    expect(r.missing).toContain('c')
    expect(r.ghosts).toContain('x')
    expect(r.duplicates).toContain('a')
    expect(r.overlap).toContain('a')
  })
})

describe('parseAppendix', () => {
  it('按角色表分界切 A.1 与角色行', () => {
    const text = [
      '| 2026-01-01-a | t | s |',
      '### 角色/排除（非 spec 文档）',
      '| 2026-01-02-b | 导航 | x |',
    ].join('\n')
    const r = parseAppendix(text)
    expect(r.appendixRows).toEqual(['2026-01-01-a'])
    expect(r.roleRows).toEqual(['2026-01-02-b'])
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('merge-invariants')
  })
})
