// 反事实五维变体守门（数据飞轮吸收轮件二）：五维 ×2=10 变体 / 确定性 /
// rubric 继承不引入新 S0 / 异常类目只标语义对应维度 / 维度过滤。
import { describe, it, expect } from 'vitest'
import { buildBadCaseVariants, CF_DIMENSIONS } from '../badcase-variants'
import type { EvalTask } from '../types'

const blueprint: EvalTask = {
  id: 'bd-abc123',
  problem: '查 3 张 2026 年 10 月北京到上海的机票',
  expectedBehavior: '返回正确航班与价格',
  rubric: [{ id: 'a1', text: '结果包含航班号', expect: 'yes', kind: 'result' }],
  origin: { runId: 'erun-1', taskId: 't1', sampleIdx: 1, at: 1 },
}

describe('五维变体扩产', () => {
  it('默认五维 ×2 = 10 条变体；id 带派生关系', () => {
    const variants = buildBadCaseVariants(blueprint)
    expect(variants).toHaveLength(10)
    for (const v of variants) expect(v.id).toMatch(/^bd-abc123-cf(syn|noise|edge|implicit|multi)[12]$/)
    expect(new Set(variants.map((v) => v.id)).size).toBe(10)
  })

  it('确定性：同输入同输出（深比较）', () => {
    expect(buildBadCaseVariants(blueprint)).toEqual(buildBadCaseVariants(blueprint))
  })

  it('rubric 逐字继承（不引入新 S0/新断言）；溯源不复制', () => {
    for (const v of buildBadCaseVariants(blueprint)) {
      expect(v.rubric).toEqual(blueprint.rubric)
      expect(v.origin).toBeUndefined()
      expect(v.expectedBehavior).toContain('变体：')
    }
  })

  it('异常类目只标语义对应维度：syn→user_rephrase、implicit→ambiguous_intent；其余不硬标', () => {
    const byId = new Map(buildBadCaseVariants(blueprint).map((v) => [v.id, v]))
    expect(byId.get('bd-abc123-cfsyn1')?.exceptionType).toBe('user_rephrase')
    expect(byId.get('bd-abc123-cfimplicit1')?.exceptionType).toBe('ambiguous_intent')
    expect(byId.get('bd-abc123-cfnoise1')?.exceptionType).toBeUndefined()
    expect(byId.get('bd-abc123-cfedge1')?.exceptionType).toBeUndefined()
    expect(byId.get('bd-abc123-cfmulti1')?.exceptionType).toBeUndefined()
  })

  it('边界突破：有数字替换为极端值；无数字追加边界子句', () => {
    const withDigits = buildBadCaseVariants(blueprint).find((v) => v.id.endsWith('cfedge1'))!
    expect(withDigits.problem).not.toContain('2026')
    expect(withDigits.problem).toContain('2099')
    const noDigits: EvalTask = { ...blueprint, id: 'bd-nodigit', problem: '查北京到上海的机票' }
    const edge = buildBadCaseVariants(noDigits).find((v) => v.id.endsWith('cfedge1'))!
    expect(edge.problem).toContain('2099 年 12 月 31 日')
  })

  it('噪声/口语化/隐式/多意图模板生效（题面变形且保留任务本体词）', () => {
    const list = buildBadCaseVariants(blueprint)
    expect(list.find((v) => v.id.endsWith('cfnoise1'))!.problem).toContain('别管这句')
    expect(list.find((v) => v.id.endsWith('cfsyn2'))!.problem).toContain('最省事')
    expect(list.find((v) => v.id.endsWith('cfimplicit1'))!.problem).toContain('那件事')
    expect(list.find((v) => v.id.endsWith('cfmulti1'))!.problem).toContain('一句话总结')
  })

  it('维度过滤：只取 syn → 2 条；空数组过滤后仍走全维兜底由调用方拦（此处传 undefined）', () => {
    expect(buildBadCaseVariants(blueprint, ['syn'])).toHaveLength(2)
    expect(buildBadCaseVariants(blueprint, ['syn', 'edge'])).toHaveLength(4)
  })

  it('维度目录五键齐且中文标签在册', () => {
    expect(CF_DIMENSIONS.map((d) => d.key)).toEqual(['syn', 'noise', 'edge', 'implicit', 'multi'])
    for (const d of CF_DIMENSIONS) expect(d.zh.length).toBeGreaterThan(0)
  })
})
