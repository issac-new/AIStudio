// 思考档位引擎语义守门（2026-10-18 双源根治）：zcodeModelReasoningLevels 必须
// 与引擎/发送链同款——`^(?:pattern)$` 全匹配+大小写不敏感，builtin 精确规则压轴，
// reasoningLevel:null 清空。缺陷实录：GLM-5.3（大写）旧实现只命中通配 `.*` →
// 目录给 [disabled,enabled]，发送链按引擎语义算 [low,high,max] → 选「开」被拒。
import { describe, it, expect } from 'vitest'
import { zcodeModelReasoningLevels } from '../engine-models'

const RULES = [
  { modelMatch: '.*', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'enabled'] } } } },
  { modelMatch: '.*glm-5(?:[.\\-:/\\[].*)?', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'enabled'] } } } },
  { modelMatch: '.*glm-5\\.3(?:-flash)?(?:[.\\-:/\\[].*)?', config: { optionSpecs: { reasoningLevel: { values: ['low', 'high', 'max'] } } } },
]

const BUILTIN = [
  { providerId: 'builtin:bigmodel', modelId: 'glm-4.7', config: { optionSpecs: { reasoningLevel: { values: ['low'] } } } },
  { providerId: 'builtin:zai-coding-plan', modelId: 'GLM-5.3', config: { optionSpecs: { reasoningLevel: null } } },
]

describe('zcodeModelReasoningLevels（引擎同款语义）', () => {
  it('大小写不敏感：GLM-5.3（大写）命中专属规则 → low/high/max（旧实现此例给 disabled/enabled）', () => {
    expect(zcodeModelReasoningLevels('GLM-5.3', RULES)).toEqual(['low', 'high', 'max'])
    expect(zcodeModelReasoningLevels('glm-5.3', RULES)).toEqual(['low', 'high', 'max'])
    expect(zcodeModelReasoningLevels('GLM-5.3-Flash', RULES)).toEqual(['low', 'high', 'max'])
  })

  it('全匹配锚定：无通配前缀的规则不得部分匹配更长 id（引擎 `^(?:p)$` 语义）', () => {
    // 不锚定的 re.test('glm-5') 会命中 'glm-5.3'；引擎全匹配不命中 → 落通配
    expect(zcodeModelReasoningLevels('glm-5.3', [
      { modelMatch: 'glm-5', config: { optionSpecs: { reasoningLevel: { values: ['low'] } } } },
      { modelMatch: '.*', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'enabled'] } } } },
    ])).toEqual(['disabled', 'enabled'])
  })

  it('通配兜底仍生效；无任何命中 → null（不伪造）', () => {
    expect(zcodeModelReasoningLevels('kimi-k2.6', RULES)).toEqual(['disabled', 'enabled'])
    expect(zcodeModelReasoningLevels('other-model', [
      { modelMatch: '.*kimi', config: { optionSpecs: { reasoningLevel: { values: ['low'] } } } },
    ])).toBeNull()
  })

  it('builtin 精确规则（providerId 匹配调用方+modelId 精确）压过 model 通配；reasoningLevel:null 清空', () => {
    expect(zcodeModelReasoningLevels('glm-4.7', RULES, BUILTIN, 'builtin:bigmodel')).toEqual(['low'])
    expect(zcodeModelReasoningLevels('GLM-5.3', RULES, BUILTIN, 'builtin:zai-coding-plan')).toBeNull()
    // providerId 不匹配调用方引擎条目的 builtin 规则不生效
    expect(zcodeModelReasoningLevels('glm-4.7', RULES, [
      { providerId: 'builtin:other', modelId: 'glm-4.7', config: { optionSpecs: { reasoningLevel: { values: ['max'] } } } },
    ], 'builtin:bigmodel')).toEqual(['disabled', 'enabled'])
  })
})
