// 语义目录与 OWL 子集推理（v0.3 R3，上游 ontology.mjs catalogProvider 本地方言）。
// catalog.json：{concepts:[{iri,label,altLabels?,subClassOf?,equivalentClass?,disjointWith?,
//   relations?,constraints?,lifecycle?,exposure?}], properties?:[{predicate,subPropertyOf?,inverseOf?,transitive?}]}
// 内建推理（如实边界：无开世界、无反例推理，非完整 OWL reasoner——上游 ADR-0006 同款声明）：
//   subClassOf 闭包（环 fail-closed）｜equivalentClass 对称物化｜disjointWith 沿包含边向后代传播
//   ｜subsumptionPath BFS 最短包含链｜属性注册表 subPropertyOf/inverseOf/transitive
// 纪律：目录畸形/推理期矛盾（互斥×包含）→ 抛错，调用方转 error 证据（INCONCLUSIVE）。

import { readFileSync } from 'node:fs'

export interface CatalogConcept {
  iri: string
  label: string
  altLabels?: string[]
  subClassOf?: string[]
  equivalentClass?: string[]
  disjointWith?: string[]
  relations?: Array<{ predicate: string; to: string }>
  constraints?: Array<{ id: string; left: string; operator: string; right?: string; value?: unknown; when?: string }>
  lifecycle?: { states: string[]; transitions: string[][] }
  exposure?: 'public' | 'internal'
}

export interface CatalogProperty {
  predicate: string
  subPropertyOf?: string[]
  inverseOf?: string
  transitive?: boolean
}

export interface Catalog {
  concepts: CatalogConcept[]
  properties: CatalogProperty[]
}

function strListOf(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v) || v.length > max) return undefined
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string' || x.length === 0) return undefined
    out.push(x)
  }
  return out
}

/** 容错解析（house style：非法返回 null）。 */
export function parseCatalog(raw: unknown): Catalog | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const rawConcepts = rec.concepts
  if (!Array.isArray(rawConcepts) || rawConcepts.length === 0 || rawConcepts.length > 500) return null
  const concepts: CatalogConcept[] = []
  for (const [i, c] of rawConcepts.entries()) {
    if (typeof c !== 'object' || c === null) return null
    const r = c as Record<string, unknown>
    const iri = typeof r.iri === 'string' && r.iri.length > 0 ? r.iri : null
    const label = typeof r.label === 'string' && r.label.length > 0 ? r.label : null
    if (!iri || !label) return null
    const concept: CatalogConcept = { iri, label }
    const alt = r.altLabels === undefined ? undefined : strListOf(r.altLabels, 20)
    if (r.altLabels !== undefined && alt === undefined) return null
    if (alt) concept.altLabels = alt
    for (const key of ['subClassOf', 'equivalentClass', 'disjointWith'] as const) {
      const list = r[key] === undefined ? undefined : strListOf(r[key], 20)
      if (r[key] !== undefined && list === undefined) return null
      if (list) concept[key] = list
    }
    if (r.relations !== undefined) {
      if (!Array.isArray(r.relations) || r.relations.length > 100) return null
      const rels: CatalogConcept['relations'] = []
      for (const x of r.relations) {
        if (typeof x !== 'object' || x === null) return null
        const p = (x as Record<string, unknown>).predicate
        const to = (x as Record<string, unknown>).to
        if (typeof p !== 'string' || typeof to !== 'string') return null
        rels.push({ predicate: p, to })
      }
      concept.relations = rels
    }
    if (r.lifecycle !== undefined) {
      const lc = r.lifecycle as Record<string, unknown>
      const states = strListOf(lc.states, 50)
      const transitions = Array.isArray(lc.transitions) ? lc.transitions : undefined
      if (!states || !transitions) return null
      const pairs: string[][] = []
      for (const t of transitions) {
        if (!Array.isArray(t) || t.length !== 2 || typeof t[0] !== 'string' || typeof t[1] !== 'string') return null
        pairs.push([t[0], t[1]])
      }
      concept.lifecycle = { states, transitions: pairs }
    }
    if (r.exposure !== undefined) {
      if (r.exposure !== 'public' && r.exposure !== 'internal') return null
      concept.exposure = r.exposure
    }
    if (r.constraints !== undefined) {
      if (!Array.isArray(r.constraints) || r.constraints.length > 50) return null
      const cs: CatalogConcept['constraints'] = []
      for (const x of r.constraints) {
        if (typeof x !== 'object' || x === null) return null
        const cr = x as Record<string, unknown>
        if (typeof cr.id !== 'string' || typeof cr.left !== 'string' || typeof cr.operator !== 'string') return null
        cs.push({ id: cr.id, left: cr.left, operator: cr.operator, right: typeof cr.right === 'string' ? cr.right : undefined, value: cr.value, when: typeof cr.when === 'string' ? cr.when : undefined })
      }
      concept.constraints = cs
    }
    concepts.push(concept)
    if (i > 500) return null
  }
  const properties: CatalogProperty[] = []
  if (rec.properties !== undefined) {
    if (!Array.isArray(rec.properties) || rec.properties.length > 100) return null
    for (const p of rec.properties) {
      if (typeof p !== 'object' || p === null) return null
      const pr = p as Record<string, unknown>
      if (typeof pr.predicate !== 'string') return null
      const prop: CatalogProperty = { predicate: pr.predicate }
      const sup = pr.subPropertyOf === undefined ? undefined : strListOf(pr.subPropertyOf, 10)
      if (pr.subPropertyOf !== undefined && sup === undefined) return null
      if (sup) prop.subPropertyOf = sup
      if (typeof pr.inverseOf === 'string') prop.inverseOf = pr.inverseOf
      if (pr.transitive === true) prop.transitive = true
      properties.push(prop)
    }
  }
  return { concepts, properties }
}

/** 推理就绪目录：构建期核验 + 物化索引。构建期发现结构矛盾即抛（fail-closed）。 */
export interface ReasoningCatalog {
  catalog: Catalog
  byIri: Map<string, CatalogConcept>
  /** label/altLabel（小写）→ iri 集合。 */
  labelIndex: Map<string, Set<string>>
  /** 子类闭包（含自身）。 */
  ancestorsOf: (iri: string) => Set<string>
  /** 互斥闭包（沿包含边传播后的 disjoint 集）。 */
  disjointOf: (a: string, b: string) => boolean
  /** a 是否被 b 包含（a=b 或 a 是 b 的子类/等价）。 */
  subsumedBy: (a: string, b: string) => boolean
  /** 属性语义：谓词闭包（自身+父属性）。 */
  propertyClosure: (predicate: string) => Set<string>
  inverseOf: (predicate: string) => string | undefined
  isTransitive: (predicate: string) => boolean
}

export function buildReasoning(catalog: Catalog): ReasoningCatalog {
  const byIri = new Map<string, CatalogConcept>()
  for (const c of catalog.concepts) {
    if (byIri.has(c.iri)) throw new Error(`catalog: duplicate iri ${c.iri}`)
    byIri.set(c.iri, c)
  }
  // equivalentClass 对称物化（单边声明即双向）
  const parents = new Map<string, Set<string>>()
  for (const c of catalog.concepts) {
    // 父集不含自身（闭包计算时再补自身）——含自身会让 DFS 环检测误报自环
    const set = new Set<string>()
    for (const p of c.subClassOf ?? []) set.add(p)
    for (const e of c.equivalentClass ?? []) if (e !== c.iri) set.add(e)
    for (const p of set) {
      if (!byIri.has(p)) throw new Error(`catalog: ${c.iri} references unknown concept ${p}`)
    }
    parents.set(c.iri, set)
  }
  // 等价类双向：A eq B ⇒ B 的父集并上 A
  for (const c of catalog.concepts) {
    for (const e of c.equivalentClass ?? []) {
      parents.get(e)?.add(c.iri)
    }
  }
  // 子类闭包（DFS + 在路径集上查环：环 fail-closed——上游同款结构错误）
  const closureCache = new Map<string, Set<string>>()
  const computing = new Set<string>()
  const ancestorsOf = (iri: string): Set<string> => {
    const cached = closureCache.get(iri)
    if (cached) return cached
    if (computing.has(iri)) throw new Error(`catalog: subClassOf cycle through ${iri}`)
    computing.add(iri)
    const out = new Set<string>([iri])
    try {
      for (const p of parents.get(iri) ?? []) {
        for (const a of ancestorsOf(p)) out.add(a)
      }
    } finally {
      computing.delete(iri)
    }
    closureCache.set(iri, out)
    return out
  }
  // 全量预走一遍把环在构建期炸出
  for (const c of catalog.concepts) ancestorsOf(c.iri)

  // disjoint 沿包含边向后代传播：A disjoint B ⇒ A 的后代与 B 的后代互斥
  const disjointPairs = new Set<string>()
  const addDisjoint = (a: string, b: string): void => {
    disjointPairs.add(`${a}\u0000${b}`)
    disjointPairs.add(`${b}\u0000${a}`)
  }
  for (const c of catalog.concepts) {
    for (const d of c.disjointWith ?? []) {
      if (!byIri.has(d)) throw new Error(`catalog: ${c.iri} disjointWith unknown concept ${d}`)
      // 后代集合：谁的本体闭包含 c / d
      for (const x of catalog.concepts) {
        if (ancestorsOf(x.iri).has(c.iri)) {
          for (const y of catalog.concepts) {
            if (ancestorsOf(y.iri).has(d)) addDisjoint(x.iri, y.iri)
          }
        }
      }
    }
  }
  // 互斥 × 包含矛盾：包含关系把互斥对折到同一路径
  for (const c of catalog.concepts) {
    for (const other of ancestorsOf(c.iri)) {
      if (disjointPairs.has(`${c.iri}\u0000${other}`)) {
        throw new Error(`catalog: ${c.iri} is both subsumed by and disjoint with ${other}`)
      }
    }
  }
  const disjointOf = (a: string, b: string): boolean => disjointPairs.has(`${a}\u0000${b}`)
  const subsumedBy = (a: string, b: string): boolean => ancestorsOf(a).has(b)

  const labelIndex = new Map<string, Set<string>>()
  const indexLabel = (label: string, iri: string): void => {
    const key = label.toLowerCase()
    let set = labelIndex.get(key)
    if (!set) { set = new Set(); labelIndex.set(key, set) }
    set.add(iri)
  }
  for (const c of catalog.concepts) {
    indexLabel(c.label, c.iri)
    for (const a of c.altLabels ?? []) indexLabel(a, c.iri)
  }

  const propByPredicate = new Map(catalog.properties.map((p) => [p.predicate, p]))
  const propertyClosure = (predicate: string): Set<string> => {
    const out = new Set<string>([predicate])
    const stack = [...(propByPredicate.get(predicate)?.subPropertyOf ?? [])]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (out.has(cur)) continue
      out.add(cur)
      for (const p of propByPredicate.get(cur)?.subPropertyOf ?? []) stack.push(p)
    }
    return out
  }
  const inverseOf = (predicate: string): string | undefined => propByPredicate.get(predicate)?.inverseOf
  // 传递性继承（v0.3.1，组合 oracle 逮住的内核缺陷）：subPropertyOf 继承属性公理——
  // 子谓词的祖先链上有任一 transitive 即传递（P1 ⊑ P0(传递) ⇒ P1 传递）。
  // 旧实现只看自身旗标，子属性链式推导被静默丢失。
  const isTransitive = (predicate: string): boolean => propertyClosure(predicate).has(
    [...propertyClosure(predicate)].find((p) => propByPredicate.get(p)?.transitive === true) ?? ''
  )

  return { catalog, byIri, labelIndex, ancestorsOf, disjointOf, subsumedBy, propertyClosure, inverseOf, isTransitive }
}

/** 读文件并构建推理目录；任何失败返回 error 字符串（调用方给 error 证据）。 */
export function loadCatalog(file: string): { reasoning: ReasoningCatalog } | { error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { error: `catalog malformed: ${(e as Error).message}` }
  }
  const catalog = parseCatalog(raw)
  if (!catalog) return { error: 'catalog schema invalid (tolerant parse returned null)' }
  try {
    return { reasoning: buildReasoning(catalog) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
