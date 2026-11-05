// 守门:审计抽样的可复现性与 spec 四段检查。
// spec: docs/superpowers/specs/2026-11-05-governance-truth-restoration.md（批次 C4）
import { describe, expect, it } from 'vitest'
import { rng, sampleDeterministic, checkSpecSections, main } from '../audit-sample.mjs'

describe('sampleDeterministic', () => {
  it('同 seed 同序列；不同 seed 不同序列', () => {
    const items = Array.from({ length: 20 }, (_, i) => `x${i}`)
    expect(sampleDeterministic(items, 5, 'a')).toEqual(sampleDeterministic(items, 5, 'a'))
    expect(sampleDeterministic(items, 5, 'a')).not.toEqual(sampleDeterministic(items, 5, 'b'))
    expect(sampleDeterministic(items, 5, 'a')).toHaveLength(5)
  })
  it('rng 输出在 [0,1)', () => {
    const r = rng('seed')
    for (let i = 0; i < 50; i += 1) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('checkSpecSections', () => {
  it('四段齐全 → ok', () => {
    const text = '# x\n## 变更\na\n## 决策记录\nb\n## 验证\nc\n## 设计文档影响\nd\n'
    expect(checkSpecSections(text)).toEqual({ ok: true, missing: [] })
  })
  it('缺段如实列出', () => {
    const r = checkSpecSections('# x\n## 变更\na\n')
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('决策记录')
    expect(r.missing).toContain('验证')
    expect(r.missing).toContain('设计文档影响')
  })
})

describe('main', () => {
  it('--help 返回 0', () => {
    const out = { text: '', write(s) { this.text += s } }
    expect(main(['--help'], out, { write() {} })).toBe(0)
    expect(out.text).toContain('audit-sample')
  })
  it('非法 count 返回 2', () => {
    const err = { text: '', write(s) { this.text += s } }
    expect(main(['--count', '0'], { write() {} }, err)).toBe(2)
    expect(err.text).toContain('positive integer')
  })
})
