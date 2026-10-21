// 可执行动作层守门（2026-10-21 三号调研落地）：校验器四道闸 + 导出三格式 +
// 缺省审批语义 + 旧 spec 无 actionTypes 的读取兼容。
import { describe, expect, it } from 'vitest'
import { validateSpec } from '../ontology-validate'
import { actionIri, effectiveApproval, specStats, type OntologySpec } from '../ontology-types'
import { toJSONLD, toTurtle } from '../ontology-export'
import { seedSpec } from '../ontology-seed'

const NOW = 1_700_000_000_000

function baseSpec(): OntologySpec {
  const spec = seedSpec(NOW)
  spec.actionTypes = []
  return spec
}

function okAction(extra: Partial<NonNullable<OntologySpec['actionTypes']>[number]> = {}): NonNullable<OntologySpec['actionTypes']>[number] {
  return {
    id: 'approve-order',
    label: '审批订单',
    targetTypes: ['Task'],
    kind: 'write',
    permissionTags: ['finance:order:approve'],
    approval: 'mandatory',
    idempotent: true,
    modality: 'shall',
    ...extra,
  }
}

describe('validateSpec：动作层四道闸', () => {
  it('合法动作（write+权限标签+强制审批）零违规', () => {
    const spec = baseSpec()
    spec.actionTypes = [okAction()]
    const v = validateSpec(spec)
    expect(v.filter((x) => x.code.startsWith('spec:action') || x.code === 'spec:dup-action')).toEqual([])
  })

  it('targetTypes 引用不存在的类型 → error', () => {
    const spec = baseSpec()
    spec.actionTypes = [okAction({ targetTypes: ['NoSuchType'] })]
    const v = validateSpec(spec)
    expect(v.some((x) => x.code === 'spec:action-target-unknown' && x.severity === 'error')).toBe(true)
  })

  it('preconditions 引用不存在的公理 → error', () => {
    const spec = baseSpec()
    spec.actionTypes = [okAction({ preconditions: ['axiom-not-exist'] })]
    const v = validateSpec(spec)
    expect(v.some((x) => x.code === 'spec:action-precondition-unknown' && x.severity === 'error')).toBe(true)
  })

  it('write 动作缺 permissionTags → error（写面动作必须带权限标签）', () => {
    const spec = baseSpec()
    spec.actionTypes = [okAction({ permissionTags: [] })]
    const v = validateSpec(spec)
    expect(v.some((x) => x.code === 'spec:action-no-authz' && x.severity === 'error')).toBe(true)
  })

  it('execute 未声明幂等 → warning；read 缺权限标签不报错', () => {
    const spec = baseSpec()
    spec.actionTypes = [
      okAction({ id: 'dispatch-settlement', kind: 'execute', idempotent: undefined }),
      okAction({ id: 'peek-order', kind: 'read', permissionTags: undefined }),
    ]
    const v = validateSpec(spec)
    expect(v.some((x) => x.code === 'spec:action-unidempotent' && x.severity === 'warning')).toBe(true)
    expect(v.some((x) => x.code === 'spec:action-no-authz' && x.subject === 'peek-order')).toBe(false)
  })

  it('动作 id 重复 → error；IRI 与实体类型撞车 → dup-iri error', () => {
    const spec = baseSpec()
    spec.actionTypes = [okAction(), okAction({ id: 'approve-order' })]
    const v = validateSpec(spec)
    expect(v.some((x) => x.code === 'spec:dup-action')).toBe(true)

    const spec2 = baseSpec()
    spec2.actionTypes = [okAction({ id: spec2.entityTypes[0].id })]
    expect(validateSpec(spec2).some((x) => x.code === 'spec:dup-iri')).toBe(true)
  })
})

describe('effectiveApproval：缺省审批语义', () => {
  it('write/execute 缺省 mandatory；read/recommend 缺省 none；显式声明优先', () => {
    expect(effectiveApproval(okAction({ kind: 'write', approval: undefined }))).toBe('mandatory')
    expect(effectiveApproval(okAction({ kind: 'execute', approval: undefined }))).toBe('mandatory')
    expect(effectiveApproval(okAction({ kind: 'read', approval: undefined }))).toBe('none')
    expect(effectiveApproval(okAction({ kind: 'recommend', approval: undefined }))).toBe('none')
    expect(effectiveApproval(okAction({ kind: 'write', approval: 'advisory' }))).toBe('advisory')
  })
})

describe('导出与统计', () => {
  it('JSON-LD 含 core:Action 节点（审批/权限/前置公理谓词）；Turtle 含动作三行', () => {
    const spec = baseSpec()
    const axiomId = spec.axioms[0].id
    spec.actionTypes = [okAction({ preconditions: [axiomId], auditNote: '审批通过后写回订单状态' })]
    const doc = toJSONLD(spec, [], NOW)
    const graph = doc['@graph'] as Array<Record<string, any>>
    const action = graph.find((n) => n['@type'] === 'core:Action') as Record<string, any>
    expect(action).toBeTruthy()
    expect(action['@id']).toBe(actionIri(spec, 'approve-order'))
    expect(action['core:approval']).toBe('mandatory')
    expect(action['core:permissionTag']).toEqual(['finance:order:approve'])
    expect(action['core:idempotent']).toBe(true)
    expect(Array.isArray(action['core:precondition'])).toBe(true)
    // Turtle 同步暴露
    const ttl = toTurtle(spec, [])
    expect(ttl).toContain('a core:Action')
    expect(ttl).toContain('core:approval "mandatory"')
    expect(ttl).toContain('core:permissionTag "finance:order:approve"')
  })

  it('specStats 登记 actionCount；旧 spec 无 actionTypes = 0（读取兼容）', () => {
    const spec = baseSpec()
    expect(specStats(spec, 0).actionCount).toBe(0)
    spec.actionTypes = [okAction()]
    expect(specStats(spec, 0).actionCount).toBe(1)
    const legacy = seedSpec(NOW)
    expect(specStats(legacy, 0).actionCount).toBe(0)
    // 旧 spec（无 actionTypes 字段）直接过校验，不产生动作类违规
    expect(validateSpec(legacy).every((x) => !x.code.startsWith('spec:action'))).toBe(true)
  })
})
