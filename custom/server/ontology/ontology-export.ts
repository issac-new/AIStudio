/**
 * 本体导出（GB/T 48000.3 方法论产品化：形式化技术栈的对外面）。
 *
 * 国标 4.1 要求 W3C 推荐的描述语言与序列化格式；本产品不自建推理机，但本体
 * 必须能被外部机器消费（文章："无法被任何程序消费，也就无法产生复利"）：
 *   toJSONLD      —— RDF/JSON-LD（类/属性/公理/实例全图，owl:versionIRI 版本链）
 *   toShaclShapes —— SHACL NodeShape（JSON-LD）：字段级声明式约束 → sh:property，
 *                    可被外部 pyshacl 直接消费；acyclic/unique-key 属图级约束，
 *                    SHACL 核心无对应构件，以自定义注记如实标注（应用侧求值）
 *   toTurtle      —— 紧凑 Turtle 文本（人工核对/外部导入用）
 * 直出模式照抄 governance/prov-o.ts（TS 可审计、每字段映射有测试锚点）。
 */
import {
  dataPropLocalName, entityIri, ontologyIri, type OntologyInstance, type OntologySpec,
} from './ontology-types'

const XSD: Record<string, string> = {
  string: 'xsd:string',
  number: 'xsd:decimal',
  integer: 'xsd:integer',
  boolean: 'xsd:boolean',
  date: 'xsd:date',
  datetime: 'xsd:dateTime',
  iri: 'xsd:anyURI',
  json: 'xsd:json',
}

type Json = Record<string, unknown>

export interface ExportMeta {
  generatedAt: string
  specVersion: number
  /** 如实登记：哪些公理未进 SHACL 核心构件（应用侧求值）。 */
  runtimeAxioms: Array<{ id: string; kind: string; note: string }>
}

// ---- JSON-LD（RDF 图） ----

export function toJSONLD(spec: OntologySpec, instances: OntologyInstance[], now = Date.now()): Json & { _export: ExportMeta } {
  const ns = spec.namespace
  const ctx: Json = {
    core: ns,
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    owl: 'http://www.w3.org/2002/07/owl#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
  }
  const graph: Json[] = []
  // 本体头（owl:Ontology + 版本链）
  graph.push({
    '@id': ontologyIri(ns),
    '@type': 'owl:Ontology',
    'rdfs:label': spec.label,
    'owl:versionIRI': { '@id': spec.versionIri },
    ...(spec.priorVersion !== undefined ? { 'owl:priorVersion': { '@id': `${ontologyIri(ns)}/v${spec.priorVersion}` } } : {}),
    'owl:versionInfo': String(spec.version),
  })
  // 实体类型（owl:Class）
  for (const t of spec.entityTypes) {
    graph.push({
      '@id': entityIri(ns, t.id),
      '@type': 'owl:Class',
      'rdfs:label': t.label,
      ...(t.labelEn ? { 'rdfs:label': [t.label, { '@language': 'en', '@value': t.labelEn }] } : {}),
      ...(t.parent ? { 'rdfs:subClassOf': { '@id': entityIri(ns, t.parent) } } : {}),
      ...(t.disjointWith?.length ? { 'owl:disjointWith': t.disjointWith.map((d) => ({ '@id': entityIri(ns, d) })) } : {}),
      ...(t.description ? { 'rdfs:comment': t.description } : {}),
      'core:modality': t.modality,
    })
  }
  // 数据属性（全局 owl:DatatypeProperty，IRI=类名.属性名）
  for (const t of spec.entityTypes) {
    for (const p of t.dataProperties) {
      graph.push({
        '@id': entityIri(ns, dataPropLocalName(t.id, p.id)),
        '@type': 'owl:DatatypeProperty',
        'rdfs:label': p.label,
        'rdfs:domain': { '@id': entityIri(ns, t.id) },
        'rdfs:range': { '@id': XSD[p.datatype] },
        'core:modality': p.modality,
        ...(p.description ? { 'rdfs:comment': p.description } : {}),
      })
    }
  }
  // 对象属性（owl:ObjectProperty + rdfs:domain/range 显式声明）
  for (const p of spec.objectProperties) {
    graph.push({
      '@id': entityIri(ns, p.id),
      '@type': 'owl:ObjectProperty',
      'rdfs:label': p.label,
      'rdfs:domain': p.domain.map((d) => ({ '@id': entityIri(ns, d) })),
      'rdfs:range': p.range.map((r) => ({ '@id': entityIri(ns, r) })),
      ...(p.inverseOf ? { 'owl:inverseOf': { '@id': entityIri(ns, p.inverseOf) } } : {}),
      'core:modality': p.modality,
      ...(p.description ? { 'rdfs:comment': p.description } : {}),
    })
  }
  // 公理（owl:Axiom 注记式——保留声明原貌供消费方实现）
  for (const a of spec.axioms) {
    graph.push({
      '@id': entityIri(ns, a.id),
      '@type': 'owl:Axiom',
      'rdfs:comment': a.message,
      'core:axiomKind': a.kind,
      'core:constraint': a.constraint,
      'core:modality': a.modality,
    })
  }
  // 实例（A-Box）
  for (const inst of instances) {
    const node: Json = {
      '@id': inst.iri ?? entityIri(ns, `i/${inst.id}`),
      '@type': entityIri(ns, inst.type),
      'rdfs:label': inst.label,
    }
    const type = spec.entityTypes.find((t) => t.id === inst.type)
    for (const [k, val] of Object.entries(inst.data ?? {})) {
      if (val === undefined || val === null) continue
      node[entityIri(ns, dataPropLocalName(type?.id ?? inst.type, k))] = val
    }
    for (const rel of inst.relations ?? []) {
      const target = instances.find((x) => x.id === rel.target)
      const key = entityIri(ns, rel.property)
      const prev = node[key]
      const ref = { '@id': target?.iri ?? entityIri(ns, `i/${rel.target}`) }
      node[key] = Array.isArray(prev) ? [...prev, ref] : prev ? [prev, ref] : ref
    }
    graph.push(node)
  }
  return {
    '@context': ctx,
    '@graph': graph,
    _export: { generatedAt: new Date(now).toISOString(), specVersion: spec.version, runtimeAxioms: runtimeAxiomNotes(spec) },
  }
}

function runtimeAxiomNotes(spec: OntologySpec): ExportMeta['runtimeAxioms'] {
  return spec.axioms
    .filter((a) => a.constraint.type === 'acyclic' || a.constraint.type === 'unique-key')
    .map((a) => ({ id: a.id, kind: a.kind, note: `${a.constraint.type} 属图级约束，SHACL 核心构件之外——由本工作台校验器求值（见 validateInstances）` }))
}

// ---- SHACL shapes（数据契约面） ----

export function toShaclShapes(spec: OntologySpec, now = Date.now()): Json & { _export: ExportMeta } {
  const ns = spec.namespace
  const graph: Json[] = []
  for (const t of spec.entityTypes) {
    const props: Json[] = []
    // 数据属性（含继承链——子类 shape 独立完整，外部校验器无须展开继承；
    // seen 守卫防 parent 环死循环，环本身由 validateSpec 报 error）
    const chain: string[] = []
    const seenChain = new Set<string>()
    const byId = new Map(spec.entityTypes.map((x) => [x.id, x]))
    let cur: string | undefined = t.id
    while (cur && !seenChain.has(cur)) {
      seenChain.add(cur)
      chain.unshift(cur)
      cur = byId.get(cur)?.parent
    }
    for (const tid of chain) {
      for (const p of byId.get(tid)?.dataProperties ?? []) {
        const shape: Json = {
          'sh:path': { '@id': entityIri(ns, dataPropLocalName(tid, p.id)) },
          'sh:name': p.label,
          'sh:datatype': { '@id': XSD[p.datatype] },
          'core:modality': p.modality,
        }
        if (p.required) shape['sh:minCount'] = 1
        if (p.enum) shape['sh:in'] = { '@list': p.enum }
        if (p.pattern) shape['sh:pattern'] = p.pattern
        if (p.min !== undefined) shape['sh:minInclusive'] = p.min
        if (p.max !== undefined) shape['sh:maxInclusive'] = p.max
        props.push(shape)
      }
    }
    // 对象属性（sh:class = Range 联合；基数）
    for (const p of spec.objectProperties) {
      if (!p.domain.includes(t.id)) continue
      const rel: Json = {
        'sh:path': { '@id': entityIri(ns, p.id) },
        'sh:name': p.label,
        'core:modality': p.modality,
      }
      if (p.range.length === 1) rel['sh:class'] = { '@id': entityIri(ns, p.range[0]) }
      else if (p.range.length > 1) rel['sh:or'] = p.range.map((r) => ({ 'sh:class': { '@id': entityIri(ns, r) } }))
      if (p.cardinality?.min !== undefined) rel['sh:minCount'] = p.cardinality.min
      if (p.cardinality?.max !== undefined) rel['sh:maxCount'] = p.cardinality.max
      props.push(rel)
    }
    const node: Json = {
      '@id': entityIri(ns, `${t.id}Shape`),
      '@type': 'sh:NodeShape',
      'sh:targetClass': { '@id': entityIri(ns, t.id) },
      'rdfs:label': `${t.label} 形状`,
    }
    if (props.length > 0) node['sh:property'] = props
    // 类不相交（来自类型声明与 disjoint 公理两路，去重）
    const disjoint = new Set<string>([...(t.disjointWith ?? []),
      ...spec.axioms.flatMap((a) => (a.constraint.type === 'disjoint' && a.constraint.classes.includes(t.id)
        ? a.constraint.classes.filter((c) => c !== t.id) : []))])
    if (disjoint.size > 0) {
      node['sh:not'] = [...disjoint].map((d) => ({ 'sh:class': { '@id': entityIri(ns, d) } }))
    }
    graph.push(node)
  }
  return {
    '@context': { sh: 'http://www.w3.org/ns/shacl#', core: ns, rdfs: 'http://www.w3.org/2000/01/rdf-schema#', xsd: 'http://www.w3.org/2001/XMLSchema#' },
    '@graph': graph,
    _export: { generatedAt: new Date(now).toISOString(), specVersion: spec.version, runtimeAxioms: runtimeAxiomNotes(spec) },
  }
}

// ---- Turtle（紧凑文本） ----

export function toTurtle(spec: OntologySpec, instances: OntologyInstance[]): string {
  const base = ontologyIri(spec.namespace)
  const lines: string[] = [
    `# ${spec.label}（v${spec.version}${spec.priorVersion !== undefined ? `，priorVersion v${spec.priorVersion}` : ''}）`,
    `# versionIRI <${spec.versionIri}> · 生成于本体工作台（GB/T 48000.3 方法论）`,
    '@prefix core: <' + spec.namespace + '> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '',
    `<${base}> a owl:Ontology ;`,
    `  rdfs:label "${esc(spec.label)}" ;`,
    `  owl:versionIRI <${spec.versionIri}> ;`,
    `  owl:versionInfo "${spec.version}" .`,
    '',
  ]
  for (const t of spec.entityTypes) {
    const parts = [`a owl:Class`, `rdfs:label "${esc(t.label)}"`]
    if (t.parent) parts.push(`rdfs:subClassOf core:${t.parent}`)
    for (const d of t.disjointWith ?? []) parts.push(`owl:disjointWith core:${d}`)
    parts.push(`core:modality "${t.modality}"`)
    lines.push(`core:${t.id} ${parts.join(' ; ')} .`, '')
    for (const p of t.dataProperties) {
      const pp = [`a owl:DatatypeProperty`, `rdfs:label "${esc(p.label)}"`, `rdfs:domain core:${t.id}`, `rdfs:range ${XSD[p.datatype]}`, `core:modality "${p.modality}"`]
      lines.push(`core:${dataPropLocalName(t.id, p.id)} ${pp.join(' ; ')} .`)
    }
    if (t.dataProperties.length > 0) lines.push('')
  }
  for (const p of spec.objectProperties) {
    const parts = [
      'a owl:ObjectProperty', `rdfs:label "${esc(p.label)}"`,
      `rdfs:domain ${p.domain.length === 1 ? `core:${p.domain[0]}` : `[ ${p.domain.map((d) => `owl:unionOf ( core:${d} )`).join(' , ')} ]`}`,
      `rdfs:range ${p.range.length === 1 ? `core:${p.range[0]}` : `[ ${p.range.map((r) => `owl:unionOf ( core:${r} )`).join(' , ')} ]`}`,
      `core:modality "${p.modality}"`,
    ]
    lines.push(`core:${p.id} ${parts.join(' ; ')} .`, '')
  }
  for (const a of spec.axioms) {
    lines.push(`# 公理 ${a.id}（${a.kind}/${a.modality}）：${esc(a.message)}`)
  }
  if (spec.axioms.length > 0) lines.push('')
  for (const inst of instances) {
    const parts = [`a core:${inst.type}`, `rdfs:label "${esc(inst.label)}"`]
    for (const [k, val] of Object.entries(inst.data ?? {})) {
      if (val === undefined || val === null) continue
      parts.push(typeof val === 'number' ? `core:${dataPropLocalName(inst.type, k)} ${val}` : `core:${dataPropLocalName(inst.type, k)} ${turtleValue(val)}`)
    }
    for (const rel of inst.relations ?? []) parts.push(`core:${rel.property} core:i/${rel.target}`)
    lines.push(`core:i/${inst.id} ${parts.join(' ; ')} .`)
  }
  return lines.join('\n')
}

function turtleValue(val: unknown): string {
  if (typeof val === 'boolean') return val ? '"true"^^xsd:boolean' : '"false"^^xsd:boolean'
  return JSON.stringify(String(val))
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export type ExportFormat = 'jsonld' | 'shacl' | 'turtle'

export function exportOntology(spec: OntologySpec, instances: OntologyInstance[], format: ExportFormat, now = Date.now()): { body: string; contentType: string } {
  if (format === 'turtle') return { body: toTurtle(spec, instances), contentType: 'text/turtle; charset=utf-8' }
  if (format === 'shacl') return { body: JSON.stringify(toShaclShapes(spec, now), null, 2), contentType: 'application/ld+json; charset=utf-8' }
  return { body: JSON.stringify(toJSONLD(spec, instances, now), null, 2), contentType: 'application/ld+json; charset=utf-8' }
}
