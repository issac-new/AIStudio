// 本体校验器守门（GB/T 48000.3 方法论产品化）：
// 模式层自检（IRI 唯一/引用/继承红线/公理一致性）+ 实例数据契约（闭世界：
// 字段级 required/pattern/enum/min/max、关系级 domain/range/基数/悬空、
// 类级公理 disjoint/acyclic/unique-key/required-relation）+ 情态→severity。
import { describe, expect, it } from 'vitest'
import { validateInstances, validateSpec, violationSummary } from '../ontology-validate'
import { seedInstances, seedSpec } from '../ontology-seed'
import type { OntologyInstance, OntologySpec } from '../ontology-types'

function inst(partial: Partial<OntologyInstance> & Pick<OntologyInstance, 'id' | 'type'>): OntologyInstance {
  return { label: partial.id, data: {}, relations: [], updatedAt: 0, ...partial }
}

describe('validateSpec（模式层自检）', () => {
  it('种子本体零违规', () => {
    expect(validateSpec(seedSpec(0))).toEqual([])
  })

  it('IRI 唯一：类型 id 与对象属性 id 冲突报 spec:dup-iri', () => {
    const spec = seedSpec(0)
    spec.objectProperties.push({ ...spec.objectProperties[0], id: spec.entityTypes[0].id, label: '撞名' })
    const codes = validateSpec(spec).map((v) => v.code)
    expect(codes).toContain('spec:dup-iri')
  })

  it('坏 namespace 报 spec:bad-namespace', () => {
    const spec = seedSpec(0)
    spec.namespace = 'not-a-namespace'
    expect(validateSpec(spec).some((v) => v.code === 'spec:bad-namespace')).toBe(true)
  })

  it('parent 环报 spec:parent-cycle；引用缺失报 spec:unknown-parent', () => {
    const spec = seedSpec(0)
    const a = spec.entityTypes.find((t) => t.id === 'Task')!
    a.parent = 'Deliverable'
    const b = spec.entityTypes.find((t) => t.id === 'Deliverable')!
    b.parent = 'Task'
    expect(validateSpec(spec).some((v) => v.code === 'spec:parent-cycle')).toBe(true)
    const spec2 = seedSpec(0)
    spec2.entityTypes.find((t) => t.id === 'Task')!.parent = 'Ghost'
    expect(validateSpec(spec2).some((v) => v.code === 'spec:unknown-parent')).toBe(true)
  })

  it('扩展红线：子类移除父类必填/放宽 enum 报 spec:inherit-widen', () => {
    // 造子类：SubTask parent=Task，status enum 放宽 + 必填被去
    const spec = seedSpec(0)
    spec.entityTypes.push({
      id: 'SubTask', label: '子任务', parent: 'Task', category: '工作对象', modality: 'shall',
      dataProperties: [
        { id: 'title', label: '标题', datatype: 'string', modality: 'shall' },          // required 被移除
        { id: 'status', label: '状态', datatype: 'string', required: true, enum: ['todo', 'done', 'zzz'], modality: 'shall' }, // enum 放宽
      ],
    })
    const hits = validateSpec(spec).filter((v) => v.code === 'spec:inherit-widen')
    expect(hits.some((v) => v.subject === 'SubTask.title')).toBe(true)
    expect(hits.some((v) => v.subject === 'SubTask.status')).toBe(true)
  })

  it('子类继承父类 disjoint：SubTask 必须声明 ⊥Agent', () => {
    const spec = seedSpec(0)
    spec.entityTypes.push({
      id: 'SubTask', label: '子任务', parent: 'Task', category: '工作对象', modality: 'shall',
      disjointWith: ['Agent'],
      dataProperties: [
        { id: 'title', label: '标题', datatype: 'string', required: true, modality: 'shall' },
        { id: 'status', label: '状态', datatype: 'string', required: true, enum: ['todo', 'done'], modality: 'shall' },
      ],
    })
    expect(validateSpec(spec).filter((v) => v.code === 'spec:inherit-widen')).toEqual([])
    const spec2 = seedSpec(0)
    spec2.entityTypes.push({
      id: 'SubTask', label: '子任务', parent: 'Task', category: '工作对象', modality: 'shall',
      dataProperties: [
        { id: 'title', label: '标题', datatype: 'string', required: true, modality: 'shall' },
        { id: 'status', label: '状态', datatype: 'string', required: true, enum: ['todo', 'done'], modality: 'shall' },
      ],
    })
    expect(validateSpec(spec2).some((v) => v.code === 'spec:inherit-widen' && v.subject === 'SubTask')).toBe(true)
  })
})

describe('validateInstances（实例数据契约——闭世界）', () => {
  it('种子实例零违规', () => {
    expect(validateInstances(seedSpec(0), seedInstances(0))).toEqual([])
  })

  it('required 缺失即违规（闭世界：缺了=不合规）+ 情态→severity', () => {
    const spec = seedSpec(0)
    const bad = inst({ id: 't1', type: 'Task', data: { title: '缺状态' } })  // status required 缺
    const hits = validateInstances(spec, [bad]).filter((v) => v.code === 'field:required')
    expect(hits.length).toBe(1)
    expect(hits[0].path).toBe('status')
    expect(hits[0].severity).toBe('error')  // status modality=shall
  })

  it('should 级缺 required → warning 不拦截', () => {
    const spec = seedSpec(0)
    // estimate_days modality=should 但非 required；造一个 WikiPage 缺 documents（axiom=should）
    const page = inst({ id: 'w1', type: 'WikiPage', data: { path: 'docs/wiki/x.md' } })
    const hits = validateInstances(spec, [page]).filter((v) => v.code === 'class:required-relation')
    expect(hits.length).toBe(1)
    expect(hits[0].severity).toBe('warning')
  })

  it('enum/pattern/min 拦截脏数据', () => {
    const spec = seedSpec(0)
    const bad = inst({ id: 't1', type: 'Task', data: { title: 'x', status: 'banana', estimate_days: -1 } })
    const codes = validateInstances(spec, [bad]).map((v) => v.code)
    expect(codes).toContain('field:enum')
    expect(codes).toContain('field:range')
    const std = inst({ id: 's1', type: 'Standard', data: { number: '乱写', title: 'x' } })
    expect(validateInstances(spec, [std]).some((v) => v.code === 'field:pattern')).toBe(true)
  })

  it('Domain/Range 拦截荒谬三元组（Task assignedTo Task）', () => {
    const spec = seedSpec(0)
    const t1 = inst({ id: 't1', type: 'Task', data: { title: 'x', status: 'todo' } })
    const t2 = inst({ id: 't2', type: 'Task', data: { title: 'y', status: 'todo' } })
    t1.relations = [{ property: 'assignedTo', target: 't2' }]
    const hits = validateInstances(spec, [t1, t2]).filter((v) => v.code === 'rel:range')
    expect(hits.length).toBe(1)
    expect(hits[0].subject).toBe('t1')
  })

  it('子类实例满足父类 Range（isTypeOrSubclass 判定）', () => {
    const spec = seedSpec(0)
    spec.entityTypes.push({
      id: 'ReviewTask', label: '评审任务', parent: 'Task', category: '工作对象', modality: 'shall',
      disjointWith: ['Agent'],
      dataProperties: [
        { id: 'title', label: '标题', datatype: 'string', required: true, modality: 'shall' },
        { id: 'status', label: '状态', datatype: 'string', required: true, enum: ['todo', 'done'], modality: 'shall' },
      ],
    })
    const rt = inst({ id: 'r1', type: 'ReviewTask', data: { title: 'x', status: 'todo' } })
    const ag = inst({ id: 'a1', type: 'Agent', data: { name: 'fanfan' } })
    const b = inst({ id: 'b1', type: 'Board', data: { slug: 'main' } })
    rt.relations = [{ property: 'assignedTo', target: 'a1' }, { property: 'belongsTo', target: 'b1' }]
    const hits = validateInstances(spec, [rt, ag, b]).filter((v) => v.code.startsWith('rel:'))
    expect(hits).toEqual([])  // ReviewTask ⊑ Task ∈ domain(Task)；Board ∈ range(belongsTo)
  })

  it('dependsOn 成环报 class:acyclic（含自环）', () => {
    const spec = seedSpec(0)
    const mk = (id: string, target: string): OntologyInstance => inst({ id, type: 'Task', data: { title: id, status: 'todo' } })
    const t1 = mk('t1', ''); const t2 = mk('t2', '')
    t1.relations = [{ property: 'dependsOn', target: 't2' }]
    t2.relations = [{ property: 'dependsOn', target: 't1' }]
    expect(validateInstances(spec, [t1, t2]).some((v) => v.code === 'class:acyclic')).toBe(true)
    t2.relations = [{ property: 'dependsOn', target: 't2' }]  // 自环
    expect(validateInstances(spec, [t1, t2]).some((v) => v.code === 'class:acyclic')).toBe(true)
  })

  it('Deliverable 缺 verifiedBy 报 class:required-relation（error）', () => {
    const spec = seedSpec(0)
    const d = inst({ id: 'd1', type: 'Deliverable', data: { path: 'overlay/x.ts' } })
    const hits = validateInstances(spec, [d]).filter((v) => v.code === 'class:required-relation')
    expect(hits.length).toBe(1)
    expect(hits[0].severity).toBe('error')
  })

  it('unique-key：taskRef 重复报 class:unique-key', () => {
    const spec = seedSpec(0)
    const t1 = inst({ id: 't1', type: 'Task', data: { title: 'a', status: 'todo', taskRef: 'K-42' } })
    const t2 = inst({ id: 't2', type: 'Task', data: { title: 'b', status: 'todo', taskRef: 'K-42' } })
    expect(validateInstances(spec, [t1, t2]).some((v) => v.code === 'class:unique-key')).toBe(true)
  })

  it('disjoint 实例双属报 class:disjoint', () => {
    const spec = seedSpec(0)
    // 造一个类型同时继承 Task 和…不可直接双继承；改走类型声明 disjointWith 判定：
    const weird = inst({ id: 'w', type: 'Agent', data: { name: 'a' } })
    const hits = validateInstances(spec, [weird])
    expect(hits.filter((v) => v.code === 'class:disjoint')).toEqual([])  // 单属合法
    // 双属需要 spec 层构造：类型 X 声明 ⊥Y，实例类型链同时含 X 与 Y
    const spec2 = seedSpec(0)
    spec2.entityTypes.find((t) => t.id === 'Agent')!.disjointWith = ['Agent']  // 自不相交（病态但可测）
    expect(validateInstances(spec2, [weird]).some((v) => v.code === 'class:disjoint')).toBe(true)
  })

  it('未知类型/未知属性/悬空目标', () => {
    const spec = seedSpec(0)
    const x = inst({ id: 'x1', type: 'Ghost', data: {} })
    expect(validateInstances(spec, [x]).some((v) => v.code === 'inst:unknown-type')).toBe(true)
    const t = inst({ id: 't1', type: 'Task', data: { title: 'x', status: 'todo', hack: 1 } })
    t.relations = [{ property: 'assignedTo', target: 'nobody' }]
    const codes = validateInstances(spec, [t]).map((v) => v.code)
    expect(codes).toContain('rel:dangling-target')
    expect(codes).toContain('field:unknown-property')
  })

  it('基数超限（assignedTo max=1）', () => {
    const spec = seedSpec(0)
    const a1 = inst({ id: 'a1', type: 'Agent', data: { name: 'x' } })
    const a2 = inst({ id: 'a2', type: 'Agent', data: { name: 'y' } })
    const t = inst({ id: 't1', type: 'Task', data: { title: 'x', status: 'todo' } })
    t.relations = [{ property: 'assignedTo', target: 'a1' }, { property: 'assignedTo', target: 'a2' }]
    expect(validateInstances(spec, [t, a1, a2]).some((v) => v.code === 'rel:cardinality')).toBe(true)
  })

  it('violationSummary 三档计数', () => {
    expect(violationSummary([
      { severity: 'error', code: 'x', subject: 's', detail: '' },
      { severity: 'error', code: 'x', subject: 's', detail: '' },
      { severity: 'warning', code: 'x', subject: 's', detail: '' },
      { severity: 'info', code: 'x', subject: 's', detail: '' },
    ])).toEqual({ error: 2, warning: 1, info: 1 })
  })
})
