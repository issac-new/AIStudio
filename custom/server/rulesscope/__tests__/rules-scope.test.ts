// 规则四型作用域守门（qoder：always/手动/glob/模型酌情+两级合并）。
import { describe, it, expect } from 'vitest'
import { applicableRules, ruleApplies, type Rule } from '../rules-scope'

const r = (id: string, kind: Rule['kind'], over: Partial<Rule> = {}): Rule => ({
  ruleId: id, kind, scope: 'project', text: 't', ...over,
})

describe('四型作用域（qoder 语义）', () => {
  it('always 恒适用；at-manual 靠触发；glob 按文件匹配；model-decides 恒入候选', () => {
    const ctx = { manualTrigger: false, filePath: 'src/a.ts' }
    expect(ruleApplies(r('a', 'always'), ctx)).toBe(true)
    expect(ruleApplies(r('m', 'at-manual'), ctx)).toBe(false)
    expect(ruleApplies(r('m', 'at-manual'), { ...ctx, manualTrigger: true })).toBe(true)
    expect(ruleApplies(r('g', 'glob', { pattern: 'src/*.ts' }), ctx)).toBe(true)
    expect(ruleApplies(r('g', 'glob', { pattern: 'docs/*.md' }), ctx)).toBe(false)
    expect(ruleApplies(r('md', 'model-decides'), ctx)).toBe(true)
  })

  it('glob ** 跨段匹配', () => {
    const rule = r('g', 'glob', { pattern: '**/*.test.ts' })
    expect(ruleApplies(rule, { manualTrigger: false, filePath: 'a/b/c.test.ts' })).toBe(true)
    expect(ruleApplies(rule, { manualTrigger: false, filePath: 'a/b/c.ts' })).toBe(false)
  })

  it('applicableRules 过滤（global/project 两级合并视图）', () => {
    const rules = [
      r('a', 'always', { scope: 'global' }),
      r('m', 'at-manual'),
      r('g', 'glob', { pattern: '**/*.ts' }),
    ]
    const got = applicableRules(rules, { manualTrigger: true, filePath: 'x/y/z.ts' })
    expect(got.map((x) => x.ruleId).sort()).toEqual(['a', 'g', 'm'])
  })
})
