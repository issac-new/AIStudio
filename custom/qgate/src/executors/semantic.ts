// semantic executor（v0.3 R3，上游 semantic-* 九门本地方言，terminology/instance 为纯内建检查）。
// 输入：catalogFile（语义目录，OWL 子集推理见 core/catalog.ts）+ 各检查的观察文件或数据文件。
//   check=alignment   —— 观察的代码符号→IRI 候选映射 vs expectedMap：strict 须等；
//                          subsumed 允许候选为期望概念的子类；多候选两两互斥 → conflict；
//                          requireRuntimeOrigin 下无 runtime 来源一致候选 → runtime-unbound
//   check=consistency —— 目录自检（构建期矛盾已在 buildReasoning 炸出，此处报计数与标签歧义）
//   check=constraint  —— concept 声明的 constraints 在观察案例上执行（diff.ts 断言语义）
//   check=state       —— concept lifecycle 状态机 vs 观察实例转换：unknownState/illegalTransition
//   check=exposure    —— concept exposure 策略 vs 观察公共面：internalConceptExposed/unknownExposedConcept
//   check=instance    —— dataFile 实例类型解析：entityTypes 允许子类特化；互斥/不可比较 → FAIL
//   check=relation    —— 期望关系三元组 vs 观察注解，满足判定含属性语义（子属性/逆/传递）
//   check=terminology —— 目录级 SKOS 完整性：label（含 alt）歧义解析检测
// 纪律：目录/观察缺失或畸形 → error（INCONCLUSIVE）；违规 → FAIL 点名。

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { loadCatalog, type ReasoningCatalog } from '../core/catalog.js'
import { evaluateAssertion, type AssertionSpec } from '../core/diff.js'

export interface SemanticExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
}

function readJson(file: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

export function runSemanticExecutor(executor: ExecutorSpec, input: SemanticExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-semantic`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'ontology-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const done = (result: Evidence['result'], summary: string, paths?: string[]): Evidence => {
    ev.result = result
    ev.execution = result === 'error' ? 'wired' : 'exercised'
    ev.summary = summary.slice(0, 400)
    if (paths) ev.provenance.affectedPaths = paths.slice(0, 100)
    ev.provenance.endedAt = Date.now()
    return ev
  }
  const rel = (p: string | undefined): string | undefined => (p ? join(input.workspace, p) : undefined)

  const check = executor.check
  if (!check) return done('error', 'semantic executor requires check (alignment|consistency|constraint|state|exposure|instance|relation|terminology|profile)')

  // consistency / terminology 不需要观察文件；其余按需
  let reasoning: ReasoningCatalog | null = null
  const catalogPath = join(input.workspace, executor.catalogFile ?? join('.qgate', 'registers', 'catalog.json'))
  // catalog 要求面：instance 分支全程依赖 byIri/subsumedBy/disjointOf（无处可空），
  // 仅 profile 允许无 catalog（targetClass 路由有 reasoning 空守卫）——漏收 instance
  // 会让下方 reasoning! 解引用抛 TypeError 炸整个 run（而非产出 error 证据）。
  const needCatalog = check === 'profile' ? !!executor.catalogFile : true
  if (needCatalog) {
    if (!existsSync(catalogPath)) return done('error', `semantic catalog missing: ${executor.catalogFile ?? '.qgate/registers/catalog.json'}`)
    const loaded = loadCatalog(catalogPath)
    if ('error' in loaded) return done('error', `semantic catalog invalid: ${loaded.error}`)
    reasoning = loaded.reasoning
  }

  const observed = (): { value: Record<string, unknown> } | { error: string } => {
    const f = rel(executor.observedFile)
    if (!f) return { error: `semantic ${check} requires observedFile` }
    if (!existsSync(f)) return { error: `observation missing: ${executor.observedFile}` }
    const o = readJson(f)
    if ('error' in o) return { error: `observation malformed: ${o.error}` }
    return { value: o.value as Record<string, unknown> }
  }

  if (check === 'consistency') {
    const r = reasoning!
    let inferredDisjoint = 0
    for (const a of r.catalog.concepts) {
      for (const b of r.catalog.concepts) {
        if (a.iri < b.iri && r.disjointOf(a.iri, b.iri)) inferredDisjoint++
      }
    }
    const declaredDisjoint = r.catalog.concepts.reduce((n, c) => n + (c.disjointWith?.length ?? 0), 0)
    return done('pass', `catalog consistent: ${r.catalog.concepts.length} concepts, ${declaredDisjoint} declared / ${inferredDisjoint} inferred (propagated) disjoint pairs, ${r.catalog.properties.length} properties`)
  }

  if (check === 'terminology') {
    const r = reasoning!
    const ambiguous: string[] = []
    for (const [label, iris] of r.labelIndex) {
      if (iris.size > 1) ambiguous.push(`"${label}" → ${[...iris].join(', ')}`)
    }
    if (ambiguous.length > 0) return done('fail', `terminology ambiguity: ${ambiguous.length} label(s) resolve to multiple concepts: ${ambiguous.slice(0, 5).join(' | ')}`, ambiguous)
    return done('pass', `terminology unambiguous: ${r.labelIndex.size} distinct labels resolve uniquely across ${r.catalog.concepts.length} concepts`)
  }

  if (check === 'alignment') {
    const o = observed()
    if ('error' in o) return done('error', o.error)
    const mappings = Array.isArray(o.value.mappings) ? o.value.mappings.filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null) : undefined
    if (!mappings) return done('error', 'observation lacks mappings[]')
    const expectedMap = executor.expectedMap ?? []
    if (expectedMap.length === 0) return done('error', 'semantic alignment requires expectedMap[]')
    const expBySymbol = new Map(expectedMap.map((m) => [m.symbol, m.iri]))
    const problems: string[] = []
    for (const m of mappings) {
      const symbol = typeof m.symbol === 'string' ? m.symbol : '(?)'
      const expectedIri = expBySymbol.get(symbol)
      if (!expectedIri) { problems.push(`${symbol}: not in expectedMap (undeclared mapping)`); continue }
      const candidates = Array.isArray(m.candidates) ? (m.candidates as unknown[]).filter((c): c is string => typeof c === 'string') : []
      if (candidates.length === 0) { problems.push(`${symbol}: no candidates observed`); continue }
      const origin = m.origin
      const runtimeCandidates = origin === 'runtime' ? candidates : []
      // 互斥冲突：多候选两两互斥（含沿继承传播）
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          if (reasoning!.disjointOf(candidates[i], candidates[j])) {
            problems.push(`${symbol}: candidates ${candidates[i]} ⊥ ${candidates[j]} are disjoint`)
          }
        }
      }
      const ok = (c: string): boolean => {
        if (!reasoning!.byIri.has(c)) { problems.push(`${symbol}: candidate ${c} unknown to catalog`); return false }
        if (executor.matchMode === 'subsumed') return reasoning!.subsumedBy(c, expectedIri)
        return c === expectedIri
      }
      const anyOk = candidates.some(ok)
      if (!anyOk) problems.push(`${symbol}: no candidate matches expected ${expectedIri}${executor.matchMode === 'subsumed' ? ' (subsumed)' : ' (strict)'}; got ${candidates.join(',')}`)
      if (executor.requireRuntimeOrigin && !runtimeCandidates.some(ok)) {
        problems.push(`${symbol}: runtime-unbound (no runtime-origin candidate matches ${expectedIri})`)
      }
    }
    if (problems.length > 0) return done('fail', `semantic alignment violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${mappings.length} symbol mappings aligned (mode=${executor.matchMode ?? 'strict'}${executor.requireRuntimeOrigin ? ', runtime-bound' : ''})`)
  }

  if (check === 'constraint') {
    const conceptIri = executor.concept
    if (!conceptIri) return done('error', 'semantic constraint requires concept')
    const concept = reasoning!.byIri.get(conceptIri)
    if (!concept) return done('error', `unknown concept: ${conceptIri}`)
    if (!concept.constraints || concept.constraints.length === 0) return done('error', `concept ${conceptIri} declares no constraints`)
    const o = observed()
    if ('error' in o) return done('error', o.error)
    const cases = Array.isArray(o.value.cases) ? o.value.cases : undefined
    if (!cases) return done('error', 'observation lacks cases[]')
    const violations: string[] = []
    for (const [i, c] of cases.entries()) {
      for (const con of concept.constraints as AssertionSpec[]) {
        const verdict = evaluateAssertion(con, c)
        if (verdict === false) violations.push(`case[${i}] ${con.id}: ${con.left} ${con.operator} ${con.right ?? JSON.stringify(con.value)}`)
      }
    }
    if (violations.length > 0) return done('fail', `constraint violations (${violations.length}): ${violations.slice(0, 6).join(' | ')}`, violations)
    return done('pass', `${concept.constraints.length} constraints hold over ${cases.length} observed cases (${conceptIri})`)
  }

  if (check === 'state') {
    const conceptIri = executor.concept
    if (!conceptIri) return done('error', 'semantic state requires concept')
    const concept = reasoning!.byIri.get(conceptIri)
    if (!concept) return done('error', `unknown concept: ${conceptIri}`)
    if (!concept.lifecycle) return done('error', `concept ${conceptIri} declares no lifecycle`)
    const o = observed()
    if ('error' in o) return done('error', o.error)
    const transitions = Array.isArray(o.value.transitions) ? o.value.transitions.filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null) : undefined
    if (!transitions) return done('error', 'observation lacks transitions[]')
    const allowed = new Set(concept.lifecycle.transitions.map((t) => `${t[0]}→${t[1]}`))
    const problems: string[] = []
    for (const [i, t] of transitions.entries()) {
      const from = String(t.from)
      const to = String(t.to)
      if (!concept.lifecycle.states.includes(from)) problems.push(`transitions[${i}]: unknownState ${from}`)
      if (!concept.lifecycle.states.includes(to)) problems.push(`transitions[${i}]: unknownState ${to}`)
      if (concept.lifecycle.states.includes(from) && concept.lifecycle.states.includes(to) && !allowed.has(`${from}→${to}`)) {
        problems.push(`transitions[${i}]: illegalTransition ${from}→${to} (instance ${String(t.instance ?? '?')})`)
      }
    }
    if (problems.length > 0) return done('fail', `state machine violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${transitions.length} observed transitions legal under ${conceptIri} lifecycle (${concept.lifecycle.states.length} states)`)
  }

  if (check === 'exposure') {
    const o = observed()
    if ('error' in o) return done('error', o.error)
    const exposed = Array.isArray(o.value.exposed) ? (o.value.exposed as unknown[]).filter((e): e is string => typeof e === 'string') : undefined
    if (!exposed) return done('error', 'observation lacks exposed[]')
    const internalByChoice = new Map<string, string>()
    let declared = 0
    for (const c of reasoning!.catalog.concepts) {
      if (c.exposure) { declared++; if (c.exposure === 'internal') internalByChoice.set(c.iri, c.label) }
    }
    if (declared === 0) return done('error', 'catalog declares no exposure policies')
    const problems: string[] = []
    for (const iri of exposed) {
      if (!reasoning!.byIri.has(iri)) { problems.push(`unknownExposedConcept: ${iri}`); continue }
      if (internalByChoice.has(iri)) problems.push(`internalConceptExposed: ${iri} (${internalByChoice.get(iri)})`)
    }
    if (problems.length > 0) return done('fail', `exposure violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${exposed.length} exposed concepts respect ${declared} exposure declarations`)
  }

  if (check === 'instance') {
    const dataPath = rel(executor.dataFile)
    if (!dataPath || !existsSync(dataPath)) return done('error', `instance data file missing: ${executor.dataFile}`)
    const d = readJson(dataPath)
    if ('error' in d) return done('error', `instance data malformed: ${d.error}`)
    const dv = d.value as Record<string, unknown>
    const records = Array.isArray(dv.records) ? dv.records.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null) : undefined
    if (!records) return done('error', 'instance data lacks records[]')
    const entityTypes = executor.expectedMap ?? []
    if (entityTypes.length === 0) return done('error', 'semantic instance requires expectedMap[] as entityTypes {symbol: entity, iri: expected type}')
    const problems: string[] = []
    const typesOf = new Map<string, string[]>()
    for (const r of records) {
      const id = typeof r.id === 'string' ? r.id : '(?)'
      const types = Array.isArray(r.types) ? (r.types as unknown[]).filter((t): t is string => typeof t === 'string') : []
      if (types.length === 0) { problems.push(`${id}: no types`); continue }
      for (const t of types) {
        if (!reasoning!.byIri.has(t)) problems.push(`${id}: unknown type ${t}`)
      }
      typesOf.set(id, types)
      const expected = entityTypes.find((e) => e.symbol === id)?.iri
      if (expected) {
        if (!reasoning!.byIri.has(expected)) problems.push(`${id}: expected type ${expected} unknown to catalog`)
        else if (!types.some((t) => reasoning!.subsumedBy(t, expected))) {
          problems.push(`${id}: typed ${types.join(',')} not subsumed by expected ${expected}`)
        }
      }
    }
    // 同实体多类型：互斥 → disjointInstances；无共同祖先可比 → ambiguousInstanceType
    for (const [id, types] of typesOf) {
      if (types.length < 2) continue
      let disjoint = false
      for (let i = 0; i < types.length && !disjoint; i++) {
        for (let j = i + 1; j < types.length; j++) {
          if (reasoning!.disjointOf(types[i], types[j])) { disjoint = true; break }
        }
      }
      if (disjoint) { problems.push(`${id}: disjointInstances ${types.join(' ⊥ ')}`); continue }
      const common = reasoning!.ancestorsOf(types[0])
      for (const t of types.slice(1)) {
        for (const a of [...common]) if (!reasoning!.ancestorsOf(t).has(a)) common.delete(a)
      }
      if (common.size === 0) problems.push(`${id}: ambiguousInstanceType ${types.join(', ')} (no common ancestor)`)
    }
    if (problems.length > 0) return done('fail', `instance typing violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${records.length} instances typed consistently`)
  }

  if (check === 'relation') {
    const expected = executor.relations ?? []
    if (expected.length === 0) return done('error', 'semantic relation requires relations[] (expected triples)')
    const o = observed()
    if ('error' in o) return done('error', o.error)
    const observedRel = Array.isArray(o.value.relations) ? o.value.relations.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null) : undefined
    if (!observedRel) return done('error', 'observation lacks relations[]')
    const problems: string[] = []
    for (const e of expected) {
      for (const side of [e.subject, e.object]) {
        if (!reasoning!.byIri.has(side)) problems.push(`unknownConcept: ${side}`)
      }
    }
    // 满足判定（v0.3.1 重构+收紧，上游 v1.30 F03 + v1.29 W6 本地方言根治）：
    // 期望 (S,P,O) 被观察边集满足当且仅当——
    //   ① 同向直边：存在观察边 (S,p,O) 且 p ∈ closure(P)（子属性闭包）；
    //   ② 互逆反向（F03 根治）：存在观察边 (O,p,S) 且 p ∈ closure(inv(P))——逆属性必须
    //      显式声明 inverseOf 才翻转论元方向；对称语义须显式声明 P.inverseOf=P。
    //      旧实现接受同方向逆谓词 (S, inv(P), O)，语义不成立（逆翻转的是方向不是谓词位），已废除；
    //   ③ 传递（W6 根治）：P 传递时，沿 closure(P) 谓词的观察边做真可达闭包（从 S 出边
    //      BFS，S 须真实环回才算可达自身）——旧实现只找单中转且须存在横跨 S→O 的单条
    //      观察三元组，多跳 A→B→C→D 漏报 missingRelation。
    const edges = observedRel.map((r) => ({ s: String(r.subject), p: String(r.predicate), o: String(r.object) }))
    const satisfiesExpected = (S: string, P: string, O: string): boolean => {
      // 观察谓词 p ⊑ P（子属性闭包含期望谓词）：propertyClosure(p).has(P)
      if (edges.some((e) => e.s === S && e.o === O && reasoning!.propertyClosure(e.p).has(P))) return true
      const inv = reasoning!.inverseOf(P)
      if (inv && edges.some((e) => e.s === O && e.o === S && reasoning!.propertyClosure(e.p).has(inv))) return true
      if (reasoning!.isTransitive(P)) {
        const adjacency = new Map<string, string[]>()
        for (const e of edges) {
          if (!reasoning!.propertyClosure(e.p).has(P)) continue
          const list = adjacency.get(e.s) ?? []
          list.push(e.o)
          adjacency.set(e.s, list)
        }
        const visited = new Set<string>()
        const queue = [...(adjacency.get(S) ?? [])]
        while (queue.length > 0) {
          const cur = queue.shift()!
          if (visited.has(cur)) continue
          visited.add(cur)
          if (cur === O) return true
          queue.push(...(adjacency.get(cur) ?? []))
        }
      }
      return false
    }
    for (const e of expected) {
      if (!satisfiesExpected(e.subject, e.predicate, e.object)) {
        problems.push(`missingRelation: ${e.subject} --${e.predicate}--> ${e.object}`)
      }
    }
    const declaredPredicates = new Set<string>([
      ...reasoning!.catalog.properties.map((p) => p.predicate),
      ...reasoning!.catalog.concepts.flatMap((c) => (c.relations ?? []).map((r) => r.predicate)),
    ])
    for (const r of observedRel) {
      const p = String(r.predicate)
      if (!declaredPredicates.has(p)) problems.push(`undeclaredRelation: predicate ${p} not in catalog (must not exceed declared semantics)`)
    }
    if (problems.length > 0) return done('fail', `relation violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${expected.length} expected relations satisfied by ${observedRel.length} observations (incl. property semantics)`)
  }

  if (check === 'profile') {
    // SHACL-lite（R8，上游 semantic-profile 本地方言）：shapesFile 声明字段形状
    // （datatype/minCount/maxCount/pattern/allowedValues/min/max），dataFile 逐记录核验；
    // targetClass 深度匹配（概念子类路由，无 catalog 时跳过路由）。
    const shapesPath = rel(executor.shapesFile)
    const dataPath = rel(executor.dataFile)
    if (!shapesPath || !dataPath) return done('error', 'semantic profile requires shapesFile and dataFile')
    if (!existsSync(shapesPath)) return done('error', `shapes file missing: ${executor.shapesFile}`)
    if (!existsSync(dataPath)) return done('error', `records file missing: ${executor.dataFile}`)
    const sh = readJson(shapesPath)
    if ('error' in sh) return done('error', `shapes malformed: ${sh.error}`)
    const dd = readJson(dataPath)
    if ('error' in dd) return done('error', `records malformed: ${dd.error}`)
    const shapes = sh.value as Record<string, unknown>
    const fields = typeof shapes.fields === 'object' && shapes.fields !== null ? (shapes.fields as Record<string, unknown>) : null
    if (!fields) return done('error', 'shapes file lacks fields{}')
    const recordsRaw = (dd.value as Record<string, unknown>).records
    const records = Array.isArray(recordsRaw) ? recordsRaw.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null) : null
    if (!records) return done('error', 'records file lacks records[]')
    // targetClass 路由：声明且 catalog 在档时，记录须声明 types 且被 targetClass 包含
    const targetClass = typeof shapes.targetClass === 'string' ? shapes.targetClass : null
    if (targetClass && reasoning) {
      for (const [i, r] of records.entries()) {
        const types = Array.isArray(r.types) ? (r.types as unknown[]).filter((t): t is string => typeof t === 'string') : []
        if (types.length === 0) return done('error', `records[${i}]: targetClass routing requires types[]`)
        if (!types.some((t) => reasoning!.subsumedBy(t, targetClass))) {
          return done('fail', `records[${i}]: typed ${types.join(',')} not subsumed by targetClass ${targetClass}`)
        }
      }
    }
    const problems: string[] = []
    const datatypeOf = (v: unknown): string => {
      if (v === null) return 'null'
      if (Array.isArray(v)) return 'array'
      if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number'
      return typeof v
    }
    for (const [i, r] of records.entries()) {
      const rid = typeof r.id === 'string' ? r.id : `record[${i}]`
      for (const [field, shapeRaw] of Object.entries(fields)) {
        if (typeof shapeRaw !== 'object' || shapeRaw === null) return done('error', `shapes.fields.${field}: must be an object`)
        const shape = shapeRaw as Record<string, unknown>
        const value = r[field]
        const count = Array.isArray(value) ? value.length : value === undefined ? 0 : 1
        if (typeof shape.minCount === 'number' && count < shape.minCount) { problems.push(`${rid}.${field}: minCount ${shape.minCount} unmet (${count})`); continue }
        if (typeof shape.maxCount === 'number' && count > shape.maxCount) { problems.push(`${rid}.${field}: maxCount ${shape.maxCount} exceeded (${count})`); continue }
        if (value === undefined) continue
        const values = Array.isArray(value) ? value : [value]
        for (const v of values) {
          if (typeof shape.datatype === 'string') {
            const dt = shape.datatype
            const actual = datatypeOf(v)
            const ok = dt === actual || (dt === 'number' && actual === 'integer')
            if (!ok) { problems.push(`${rid}.${field}: datatype ${dt} expected, got ${actual}`); continue }
          }
          if (typeof shape.pattern === 'string') {
            // 用户可编辑 shapes：非法正则须降级为 error 证据，不得抛 SyntaxError 炸整个 run
            let re: RegExp
            try {
              re = new RegExp(shape.pattern, 'u')
            } catch (e) {
              return done('error', `shapes.fields.${field}.pattern invalid: /${shape.pattern}/ (${(e as Error).message})`)
            }
            if (typeof v !== 'string' || !re.test(v)) {
              problems.push(`${rid}.${field}: pattern /${shape.pattern}/ unmatched (${typeof v === 'string' ? v.slice(0, 24) : typeof v})`)
            }
          }
          if (Array.isArray(shape.allowedValues) && !shape.allowedValues.includes(v as never)) {
            problems.push(`${rid}.${field}: value not in allowedValues`)
          }
          if (typeof v === 'number') {
            if (typeof shape.min === 'number' && v < shape.min) problems.push(`${rid}.${field}: ${v} < min ${shape.min}`)
            if (typeof shape.max === 'number' && v > shape.max) problems.push(`${rid}.${field}: ${v} > max ${shape.max}`)
          }
        }
      }
    }
    if (problems.length > 0) return done('fail', `profile violations (${problems.length}): ${problems.slice(0, 6).join(' | ')}`, problems)
    return done('pass', `${records.length} record(s) conform to ${Object.keys(fields).length}-field shape${targetClass ? ` (targetClass ${targetClass})` : ''}`)
  }

  return done('error', `unknown semantic check: ${String(check)}`)
}
