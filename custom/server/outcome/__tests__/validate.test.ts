// outcome 合同输入校验测试（spec 2026-11-19-ai-native-operating-model-design.md §4.1）。
// base 是合法最小合同：1 个 measure + 结果责任人 + 验证责任人（两人分离），baseline=null 合法。
import { describe, expect, it } from 'vitest'
import { validateContractInput } from '../validate'

const base = {
  schemaVersion: 1,
  outcomeId: 'oc-1',
  rootTaskId: 'task-1',
  version: 1,
  title: '发布事故率下降',
  valueStatement: '降低发布流程引发的生产事故',
  ownerPersonId: 'p-1',
  measures: [
    {
      measureId: 'm-1',
      name: '发布事故数',
      definition: '滚动 30 天内由发布直接引发的故障次数',
      unit: '次',
      operator: 'lte',
      baseline: null,
      target: 0,
      sourceRef: 'incidents://release',
    },
  ],
  acceptance: { statements: [], requiredEvidenceKinds: [] },
  scope: { included: ['发布流程'], excluded: [] },
  riskTier: 'medium',
  defaultReversibility: 'reversible',
  verificationOwnerId: 'p-2',
  contextPolicy: { allowedScopes: ['project'], excludedSourceKinds: [] },
  learningOptIn: false,
  status: 'draft',
  createdAt: 1,
  updatedAt: 1,
}

/** 浅覆盖构造非法变体；validateContractInput 入参是 unknown，不走上下文类型。 */
const variant = (patch: Record<string, unknown>): unknown => ({ ...base, ...patch })

describe('validateContractInput', () => {
  it('合法最小合同通过（1 measure + owner + verifier，baseline=null 合法未知）', () => {
    expect(validateContractInput(base)).toEqual({ problems: [], separationNotice: null })
  })

  it('measures 与 acceptance.statements 双空不得通过', () => {
    const r = validateContractInput(
      variant({ measures: [], acceptance: { statements: [], requiredEvidenceKinds: [] } }),
    )
    expect(r.problems.join()).toContain('同时为空')
  })

  it('operator 非法被拒（只允许 gte|lte|eq）', () => {
    const r = validateContractInput(
      variant({ measures: [{ ...base.measures[0], operator: 'gt' }] }),
    )
    expect(r.problems.join()).toContain('operator')
  })

  it('target 非有限数被拒（NaN/Infinity/字符串）', () => {
    for (const target of [Number.NaN, Number.POSITIVE_INFINITY, '5']) {
      const r = validateContractInput(variant({ measures: [{ ...base.measures[0], target }] }))
      expect(r.problems.join()).toContain('target')
    }
  })

  it('高风险 owner===verifier 是 problem；换人后通过', () => {
    const same = validateContractInput(variant({ riskTier: 'high', verificationOwnerId: 'p-1' }))
    expect(same.problems.join()).toContain('同一人')
    expect(same.separationNotice).toBeNull()
    const split = validateContractInput(variant({ riskTier: 'high' }))
    expect(split.problems).toEqual([])
  })

  it('低/中风险允许同人，但返回未分离提示', () => {
    for (const riskTier of ['low', 'medium']) {
      const r = validateContractInput(variant({ riskTier, verificationOwnerId: 'p-1' }))
      expect(r.problems).toEqual([])
      expect(r.separationNotice).toContain('未分离')
    }
    expect(validateContractInput(base).separationNotice).toBeNull()
  })

  it('rootTaskId 缺失或超过 128 字符被拒', () => {
    const missing = { ...base } as Record<string, unknown>
    delete missing.rootTaskId
    expect(validateContractInput(missing).problems.join()).toContain('rootTaskId')
    expect(validateContractInput(variant({ rootTaskId: 'a'.repeat(129) })).problems.join()).toContain(
      '128',
    )
  })

  it('processRef 存在时 processId 与 definitionVersion 必填', () => {
    expect(
      validateContractInput(variant({ processRef: { processId: 'proc-1' } })).problems.join(),
    ).toContain('definitionVersion')
    expect(
      validateContractInput(variant({ processRef: { definitionVersion: 'v1' } })).problems.join(),
    ).toContain('processId')
    expect(validateContractInput(variant({ processRef: 'x' })).problems.join()).toContain('processRef')
    expect(validateContractInput(variant({ processRef: { processId: 'proc-1', definitionVersion: 'v1' } })).problems).toEqual([])
  })

  it('非对象输入直接拒绝', () => {
    for (const v of [null, undefined, 'x', 42, [], [{ ...base }]]) {
      const r = validateContractInput(v)
      expect(r.problems.length).toBeGreaterThan(0)
      expect(r.separationNotice).toBeNull()
    }
  })

  it('顶层必填字符串与标量字段逐项校验', () => {
    for (const field of ['outcomeId', 'title', 'valueStatement', 'ownerPersonId', 'verificationOwnerId']) {
      const copy = { ...base } as Record<string, unknown>
      delete copy[field]
      expect(validateContractInput(copy).problems.join()).toContain(field)
    }
    for (const patch of [
      { schemaVersion: 2 },
      { version: 0 },
      { version: 1.5 },
      { riskTier: 'extreme' },
      { defaultReversibility: 'free' },
      { status: 'done' },
      { learningOptIn: 'yes' },
      { createdAt: Number.NaN },
      { updatedAt: 'now' },
    ]) {
      expect(validateContractInput(variant(patch)).problems.join()).toContain(
        Object.keys(patch)[0],
      )
    }
  })

  it('measures 元素字段与容器结构校验', () => {
    expect(validateContractInput(variant({ measures: 'x' })).problems.join()).toContain(
      'measures 须为数组',
    )
    const brokenMeasure = { ...base.measures[0] } as Record<string, unknown>
    delete brokenMeasure.name
    delete brokenMeasure.sourceRef
    const r = validateContractInput(
      variant({ measures: [{ ...brokenMeasure, baseline: '5' }] }),
    )
    const joined = r.problems.join()
    expect(joined).toContain('measures[0].name')
    expect(joined).toContain('measures[0].sourceRef')
    expect(joined).toContain('baseline')
  })

  it('measures 内 measureId 重复被拒；measureId 唯一时通过', () => {
    const dup = [
      { ...base.measures[0] },
      { ...base.measures[0], measureId: 'm-2' },
      { ...base.measures[0], measureId: 'm-1' },
    ]
    const joined = validateContractInput(variant({ measures: dup })).problems.join()
    expect(joined).toContain('重复')
    expect(joined).toContain('m-1')
    const uniq = [{ ...base.measures[0] }, { ...base.measures[0], measureId: 'm-2' }]
    expect(validateContractInput(variant({ measures: uniq })).problems).toEqual([])
  })

  it('acceptance/scope/contextPolicy 容器与数组字段校验', () => {
    for (const patch of [
      { acceptance: 'x' },
      { acceptance: { statements: 'x', requiredEvidenceKinds: [] } },
      { acceptance: { statements: [], requiredEvidenceKinds: 3 } },
      { scope: { included: 'x', excluded: [] } },
      { contextPolicy: { allowedScopes: [], excludedSourceKinds: 'x' } },
    ]) {
      expect(validateContractInput(variant(patch)).problems.length).toBeGreaterThan(0)
    }
  })

  it('dueAt 可选（批三 T1）：undefined=未设置（旧合同零迁移）、null=显式无期限、有限数值=期限，均放行', () => {
    expect(validateContractInput(base).problems).toEqual([])
    expect(validateContractInput(variant({ dueAt: null })).problems).toEqual([])
    expect(validateContractInput(variant({ dueAt: 1700000099999 })).problems).toEqual([])
  })

  it('dueAt 非法类型拒绝（字符串/NaN/Infinity）', () => {
    for (const dueAt of ['soon', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateContractInput(variant({ dueAt })).problems.join()).toContain('dueAt')
    }
  })
})
