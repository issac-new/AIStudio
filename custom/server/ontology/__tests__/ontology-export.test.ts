// 本体导出守门：JSON-LD/SHACL/Turtle 三格式的结构断言（IRI 唯一、versionIRI、
// sh:property 映射、Turtle 可再解析的文本形态）。
import { describe, expect, it } from 'vitest'
import { toJSONLD, toShaclShapes, toTurtle } from '../ontology-export'
import { seedInstances, seedSpec } from '../ontology-seed'

const NOW = 1_700_000_000_000

describe('toJSONLD', () => {
  it('@graph 含本体头/类/双属性/公理/实例，versionIRI 进链', () => {
    const spec = seedSpec(NOW)
    const insts = seedInstances(NOW)
    const doc = toJSONLD(spec, insts, NOW)
    const graph = doc['@graph'] as Array<Record<string, unknown>>
    const onto = graph.find((n) => n['@type'] === 'owl:Ontology') as Record<string, any>
    expect(onto['owl:versionIRI']['@id']).toBe(spec.versionIri)
    expect(graph.filter((n) => n['@type'] === 'owl:Class')).toHaveLength(spec.entityTypes.length)
    const dataProps = graph.filter((n) => n['@type'] === 'owl:DatatypeProperty')
    expect(dataProps).toHaveLength(spec.entityTypes.reduce((n, t) => n + t.dataProperties.length, 0))
    expect(graph.filter((n) => n['@type'] === 'owl:ObjectProperty')).toHaveLength(spec.objectProperties.length)
    expect(graph.filter((n) => n['@type'] === 'owl:Axiom')).toHaveLength(spec.axioms.length)
    // 实例：Standard 种子的 number 数据属性（键=完整 IRI：ns + 类名.属性名）
    const std = graph.find((n) => n['@id']?.endsWith('i/std-gbt-48000-3')) as Record<string, any>
    expect(std['https://swarm.studio/ns/core#Standard.number']).toBe('GB/T 48000.3-2026')
    // 全图 @id 唯一（IRI 全局唯一要求）
    const ids = graph.map((n) => String(n['@id']))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('toShaclShapes', () => {
  it('每类型一个 NodeShape；required→sh:minCount；enum→sh:in；对象属性→sh:class/or', () => {
    const spec = seedSpec(NOW)
    const doc = toShaclShapes(spec, NOW)
    const graph = doc['@graph'] as Array<Record<string, any>>
    expect(graph.filter((n) => n['@type'] === 'sh:NodeShape')).toHaveLength(spec.entityTypes.length)
    const taskShape = graph.find((n) => String(n['@id']).endsWith('TaskShape'))
    expect(taskShape).toBeTruthy()
    const props = taskShape!['sh:property'] as Array<Record<string, any>>
    const status = props.find((p) => String(p['sh:path']['@id']).endsWith('Task.status'))
    expect(status['sh:minCount']).toBe(1)
    expect((status['sh:in']['@list'] as string[]).join(',')).toBe('triage,todo,scheduled,ready,running,blocked,review,done,archived')
    const assigned = props.find((p) => String(p['sh:path']['@id']).endsWith('assignedTo'))
    expect(assigned['sh:or'].length).toBe(2)  // range 联合（Agent|Human）
    expect(assigned['sh:maxCount']).toBe(1)
    // disjoint → sh:not
    expect(Array.isArray(taskShape!['sh:not'])).toBe(true)
  })

  it('acyclic/unique-key 进 runtimeAxioms 注记（SHACL 核心无构件，如实标注）', () => {
    const doc = toShaclShapes(seedSpec(NOW), NOW)
    const kinds = doc._export.runtimeAxioms.map((r) => r.id)
    expect(kinds).toContain('ax-depends-acyclic')
    expect(kinds).toContain('ax-task-ref-unique')
    expect(kinds).not.toContain('ax-deliverable-gate')  // required-relation 有 minCount 投影
  })
})

describe('toTurtle', () => {
  it('含 prefix/本体头/类与属性三元组，实例段落在尾部', () => {
    const spec = seedSpec(NOW)
    const text = toTurtle(spec, seedInstances(NOW))
    expect(text).toContain('@prefix core: <https://swarm.studio/ns/core#> .')
    expect(text).toContain(`owl:versionIRI <${spec.versionIri}>`)
    expect(text).toContain('core:Task a owl:Class')
    expect(text).toContain('core:assignedTo a owl:ObjectProperty')
    expect(text).toContain('core:i/std-gbt-48000-3 a core:Standard')
    expect(text).toMatch(/core:Task\.status .+ xsd:string/)
  })
})
