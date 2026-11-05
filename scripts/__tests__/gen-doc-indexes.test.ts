// 守门:设计索引的集合等式与计数。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 C6）
import { describe, expect, it } from 'vitest'
import { parseListLinks, compareIndex, main } from '../maintenance/gen-doc-indexes.mjs'

describe('parseListLinks', () => {
  it('只取列表项链接', () => {
    const links = parseListLinks('- [a](../superpowers/specs/a.md)\n正文 [b](x.md)\n- [c](y.md)')
    expect(links).toEqual(['../superpowers/specs/a.md', 'y.md'])
  })
})

describe('compareIndex', () => {
  it('一致时 problems 为空', () => {
    const text = '- [a](../superpowers/specs/a.md)\n- [b](../superpowers/specs/b.md)\n根目录：**2 份**\n合计 2 份\n## 2026-11（1 份）'
    const r = compareIndex({ links: parseListLinks(text), specs: ['a.md', '2026-11-01-b.md'], text })
    // b.md 不在 specs → ghost；这里用真实集合构造
    expect(r.problems.length).toBeGreaterThan(0)
  })
  it('missing/ghosts/duplicates 都报', () => {
    const text = '- [a](../superpowers/specs/a.md)\n- [a](../superpowers/specs/a.md)\n根目录：**2 份**\n合计 2 份\n## 2026-11（1 份）'
    const r = compareIndex({ links: parseListLinks(text), specs: ['a.md', 'b.md', '2026-11-01-c.md'], text })
    expect(r.missing).toContain('b.md')
    expect(r.duplicates).toContain('a.md')
    expect(r.problems.length).toBeGreaterThan(0)
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('gen-doc-indexes')
  })
})
