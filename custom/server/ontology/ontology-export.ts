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
 *
 * 2026-10-21 FIBO 对齐层：显式 IRI 优先（FIBO/Commons 术语），外部词表写
 * owl:imports，术语出处写 dct:source + core:origin/fiboModule/versionIRI。
 */
import {
  dataPropertyIri, entityIri, objectPropertyIri, ontologyIri, typeIri,
  type OntologyInstance, type OntologySpec, type TermProvenance,
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

/** 外部术语出处注记（dct:source 指回真实 IRI；本地术语不写）。 */
function provenanceAnnotations(iri: string, p?: TermProvenance): Json {
  if (!p) return {}
  return {
    'core:origin': p.origin,
    ...(p.origin === 'fibo' || p.origin === 'commons' ? { 'dct:source': { '@id': iri } } : {}),
    ...(p.module ? { 'core:fiboModule': p.module } : {}),
    ...(p.versionIri ? { 'core:fiboVersionIri': p.versionIri } : {}),
    ...(p.maturity ? { 'core:maturity': p.maturity } : {}),
    ...(p.retrievedAt ? { 'core:retrievedAt': p.retrievedAt } : {}),
    ...(p.definitionEn ? { 'core:definitionEn': p.definitionEn } : {}),
    ...(p.note ? { 'core:provenanceNote': p.note } : {}),
  }
}

function jsonLdContext(spec: OntologySpec, extra: Json = {}): Json {
  const ctx: Json = {
    core: spec.namespace,
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    owl: 'http://www.w3.org/2002/07/owl#',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    dct: 'http://purl.org/dc/terms/',
    ...extra,
  }
  for (const v of spec.vocabularies ?? []) {
    if (!(v.prefix in ctx)) ctx[v.prefix] = v.iri
  }
  return ctx
}

// ---- JSON-LD（RDF 图） ----

export function toJSONLD(spec: OntologySpec, instances: OntologyInstance[], now = Date.now()): Json & { _export: ExportMeta } {
  const ns = spec.namespace
  const graph: Json[] = []
  // 本体头（owl:Ontology + 版本链 + 外部词表 import）
  graph.push({
    '@id': ontologyIri(ns),
    '@type': 'owl:Ontology',
    'rdfs:label': spec.label,
    'owl:versionIRI': { '@id': spec.versionIri },
    ...(spec.priorVersion !== undefined ? { 'owl:priorVersion': { '@id': `${ontologyIri(ns)}/v${spec.priorVersion}` } } : {}),
    'owl:versionInfo': String(spec.version),
    ...(spec.vocabularies?.length ? { 'owl:imports': spec.vocabularies.map((v) => ({ '@id': v.iri })) } : {}),
  })
  // 实体类型（owl:Class）
  for (const t of spec.entityTypes) {
    const iri = typeIri(spec, t.id)
    graph.push({
      '@id': iri,
      '@type': 'owl:Class',
      'rdfs:label': t.labelEn ? [t.label, { '@language': 'en', '@value': t.labelEn }] : t.label,
      ...(t.parent ? { 'rdfs:subClassOf': { '@id': typeIri(spec, t.parent) } } : {}),
      ...(t.disjointWith?.length ? { 'owl:disjointWith': t.disjointWith.map((d) => ({ '@id': typeIri(spec, d) })) } : {}),
      ...(t.description ? { 'rdfs:comment': t.description } : {}),
      'core:modality': t.modality,
      ...provenanceAnnotations(iri, t.provenance),
    })
  }
  // 数据属性（全局 owl:DatatypeProperty）
  for (const t of spec.entityTypes) {
    for (const p of t.dataProperties) {
      const iri = dataPropertyIri(spec, t.id, p.id)
      graph.push({
        '@id': iri,
        '@type': 'owl:DatatypeProperty',
        'rdfs:label': p.label,
        'rdfs:domain': { '@id': typeIri(spec, t.id) },
        'rdfs:range': { '@id': XSD[p.datatype] },
        'core:modality': p.modality,
        ...(p.description ? { 'rdfs:comment': p.description } : {}),
        ...provenanceAnnotations(iri, p.provenance),
      })
    }
  }
  // 对象属性（owl:ObjectProperty + rdfs:domain/range 显式声明）
  for (const p of spec.objectProperties) {
    const iri = objectPropertyIri(spec, p.id)
    graph.push({
      '@id': iri,
      '@type': 'owl:ObjectProperty',
      'rdfs:label': p.label,
      'rdfs:domain': p.domain.map((d) => ({ '@id': typeIri(spec, d) })),
      'rdfs:range': p.range.map((r) => ({ '@id': typeIri(spec, r) })),
      ...(p.inverseOf ? { 'owl:inverseOf': { '@id': objectPropertyIri(spec, p.inverseOf) } } : {}),
      'core:modality': p.modality,
      ...(p.description ? { 'rdfs:comment': p.description } : {}),
      ...provenanceAnnotations(iri, p.provenance),
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
      '@type': typeIri(spec, inst.type),
      'rdfs:label': inst.label,
    }
    for (const [k, val] of Object.entries(inst.data ?? {})) {
      if (val === undefined || val === null) continue
      node[dataPropertyIri(spec, inst.type, k)] = val
    }
    for (const rel of inst.relations ?? []) {
      const target = instances.find((x) => x.id === rel.target)
      const key = objectPropertyIri(spec, rel.property)
      const prev = node[key]
      const ref = { '@id': target?.iri ?? entityIri(ns, `i/${rel.target}`) }
      node[key] = Array.isArray(prev) ? [...prev, ref] : prev ? [prev, ref] : ref
    }
    graph.push(node)
  }
  return {
    '@context': jsonLdContext(spec),
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
          'sh:path': { '@id': dataPropertyIri(spec, tid, p.id) },
          'sh:name': p.label,
          'sh:datatype': { '@id': XSD[p.datatype] },
          'core:modality': p.modality,
          ...provenanceAnnotations(dataPropertyIri(spec, tid, p.id), p.provenance),
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
        'sh:path': { '@id': objectPropertyIri(spec, p.id) },
        'sh:name': p.label,
        'core:modality': p.modality,
        ...provenanceAnnotations(objectPropertyIri(spec, p.id), p.provenance),
      }
      if (p.range.length === 1) rel['sh:class'] = { '@id': typeIri(spec, p.range[0]) }
      else if (p.range.length > 1) rel['sh:or'] = p.range.map((r) => ({ 'sh:class': { '@id': typeIri(spec, r) } }))
      if (p.cardinality?.min !== undefined) rel['sh:minCount'] = p.cardinality.min
      if (p.cardinality?.max !== undefined) rel['sh:maxCount'] = p.cardinality.max
      props.push(rel)
    }
    const node: Json = {
      '@id': entityIri(ns, `${t.id}Shape`),
      '@type': 'sh:NodeShape',
      'sh:targetClass': { '@id': typeIri(spec, t.id) },
      'rdfs:label': `${t.label} 形状`,
    }
    if (props.length > 0) node['sh:property'] = props
    // 类不相交（来自类型声明与 disjoint 公理两路，去重）
    const disjoint = new Set<string>([...(t.disjointWith ?? []),
      ...spec.axioms.flatMap((a) => (a.constraint.type === 'disjoint' && a.constraint.classes.includes(t.id)
        ? a.constraint.classes.filter((c) => c !== t.id) : []))])
    if (disjoint.size > 0) {
      node['sh:not'] = [...disjoint].map((d) => ({ 'sh:class': { '@id': typeIri(spec, d) } }))
    }
    graph.push(node)
  }
  return {
    '@context': jsonLdContext(spec, { sh: 'http://www.w3.org/ns/shacl#' }),
    '@graph': graph,
    _export: { generatedAt: new Date(now).toISOString(), specVersion: spec.version, runtimeAxioms: runtimeAxiomNotes(spec) },
  }
}

// ---- Turtle（紧凑文本） ----

/** 本工作台 IRI 用 core: 前缀，外部 IRI 用 <IRI>（可读且不失真）。 */
function turtleRef(iri: string, ns: string): string {
  return iri.startsWith(ns) ? `core:${iri.slice(ns.length)}` : `<${iri}>`
}

export function toTurtle(spec: OntologySpec, instances: OntologyInstance[]): string {
  const base = ontologyIri(spec.namespace)
  const lines: string[] = [
    `# ${spec.label}（v${spec.version}${spec.priorVersion !== undefined ? `，priorVersion v${spec.priorVersion}` : ''}）`,
    `# versionIRI <${spec.versionIri}> · 生成于本体工作台（GB/T 48000.3 方法论）`,
    '@prefix core: <' + spec.namespace + '> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    '@prefix dct: <http://purl.org/dc/terms/> .',
    ...(spec.vocabularies ?? []).map((v) => `@prefix ${v.prefix}: <${v.iri}> .`),
    '',
  ]
  const header = [
    'a owl:Ontology',
    `rdfs:label "${esc(spec.label)}"`,
    `owl:versionIRI <${spec.versionIri}>`,
    `owl:versionInfo "${spec.version}"`,
    ...(spec.vocabularies ?? []).map((v) => `owl:imports <${v.iri}>`),
  ]
  lines.push(`<${base}> ${header.join(' ;\n  ')} .`, '')
  for (const t of spec.entityTypes) {
    const iri = typeIri(spec, t.id)
    const parts = [`a owl:Class`, `rdfs:label "${esc(t.labelEn ?? t.label)}"`]
    if (t.parent) parts.push(`rdfs:subClassOf ${turtleRef(typeIri(spec, t.parent), spec.namespace)}`)
    for (const d of t.disjointWith ?? []) parts.push(`owl:disjointWith ${turtleRef(typeIri(spec, d), spec.namespace)}`)
    parts.push(`core:modality "${t.modality}"`)
    if (t.provenance) {
      parts.push(`core:origin "${t.provenance.origin}"`)
      if (t.provenance.definitionEn) parts.push(`core:definitionEn "${esc(t.provenance.definitionEn)}"`)
      if (t.provenance.module) parts.push(`core:fiboModule "${esc(t.provenance.module)}"`)
      if (t.provenance.versionIri) parts.push(`core:fiboVersionIri <${t.provenance.versionIri}>`)
      if (t.provenance.maturity) parts.push(`core:maturity "${esc(t.provenance.maturity)}"`)
      if (t.provenance.origin === 'fibo' || t.provenance.origin === 'commons') parts.push(`dct:source <${iri}>`)
    }
    lines.push(`${turtleRef(iri, spec.namespace)} ${parts.join(' ; ')} .`, '')
    for (const p of t.dataProperties) {
      const pp = [
        `a owl:DatatypeProperty`, `rdfs:label "${esc(p.label)}"`,
        `rdfs:domain ${turtleRef(typeIri(spec, t.id), spec.namespace)}`,
        `rdfs:range ${XSD[p.datatype]}`, `core:modality "${p.modality}"`,
      ]
      const pir = dataPropertyIri(spec, t.id, p.id)
      if (p.provenance) {
        pp.push(`core:origin "${p.provenance.origin}"`)
        if (p.provenance.note) pp.push(`core:provenanceNote "${esc(p.provenance.note)}"`)
      }
      lines.push(`${turtleRef(pir, spec.namespace)} ${pp.join(' ; ')} .`)
    }
    if (t.dataProperties.length > 0) lines.push('')
  }
  for (const p of spec.objectProperties) {
    const iri = objectPropertyIri(spec, p.id)
    const parts = [
      'a owl:ObjectProperty', `rdfs:label "${esc(p.label)}"`,
      `rdfs:domain ${p.domain.length === 1 ? turtleRef(typeIri(spec, p.domain[0]), spec.namespace) : `[ ${p.domain.map((d) => `owl:unionOf ( ${turtleRef(typeIri(spec, d), spec.namespace)} )`).join(' , ')} ]`}`,
      `rdfs:range ${p.range.length === 1 ? turtleRef(typeIri(spec, p.range[0]), spec.namespace) : `[ ${p.range.map((r) => `owl:unionOf ( ${turtleRef(typeIri(spec, r), spec.namespace)} )`).join(' , ')} ]`}`,
      `core:modality "${p.modality}"`,
    ]
    if (p.provenance) {
      parts.push(`core:origin "${p.provenance.origin}"`)
      if (p.provenance.definitionEn) parts.push(`core:definitionEn "${esc(p.provenance.definitionEn)}"`)
      if (p.provenance.module) parts.push(`core:fiboModule "${esc(p.provenance.module)}"`)
      if (p.provenance.versionIri) parts.push(`core:fiboVersionIri <${p.provenance.versionIri}>`)
      if (p.provenance.origin === 'fibo' || p.provenance.origin === 'commons') parts.push(`dct:source <${iri}>`)
    }
    lines.push(`${turtleRef(iri, spec.namespace)} ${parts.join(' ; ')} .`, '')
  }
  for (const a of spec.axioms) {
    lines.push(`# 公理 ${a.id}（${a.kind}/${a.modality}）：${esc(a.message)}`)
  }
  if (spec.axioms.length > 0) lines.push('')
  for (const inst of instances) {
    const parts = [`a ${turtleRef(typeIri(spec, inst.type), spec.namespace)}`, `rdfs:label "${esc(inst.label)}"`]
    for (const [k, val] of Object.entries(inst.data ?? {})) {
      if (val === undefined || val === null) continue
      const key = turtleRef(dataPropertyIri(spec, inst.type, k), spec.namespace)
      parts.push(typeof val === 'number' ? `${key} ${val}` : `${key} ${turtleValue(val)}`)
    }
    for (const rel of inst.relations ?? []) {
      parts.push(`${turtleRef(objectPropertyIri(spec, rel.property), spec.namespace)} ${turtleRef(entityIri(spec.namespace, `i/${rel.target}`), spec.namespace)}`)
    }
    lines.push(`${turtleRef(inst.iri ?? entityIri(spec.namespace, `i/${inst.id}`), spec.namespace)} ${parts.join(' ; ')} .`)
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
