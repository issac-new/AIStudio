// v0.3.1 组合性质守门（上游 v1.29 W6 owl-shacl-combinatorial 本地方言）：
//   OWL 关系：22 个固定种子随机目录（子属性 DAG × 传递 × 互逆随机组合）——独立实现的
//   朴素 oracle（Warshall 传递闭包 + 朴素逆翻转）对照内核 satisfiesExpected 判定，
//   覆盖面单向健全性（oracle 满足 ⇒ 内核必须满足）与 verdict 一致性。
//   同源风险如实声明：oracle 与内核为两套独立实现，但同由一人同轮编写，语义同构
//   风险高于上游跨实现对照（上游同款声明）；v1.30/v1.31.1 修复的两枚缺陷
//   （自环捷径、反向认可）在此有针对性反例。
//   SHACL-lite：组合矩阵抽查（datatype/minCount/maxCount/pattern/allowedValues ×值域），
//   朴素 oracle 逐格对照 profile 判定。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCatalog, buildReasoning } from '../src/core/catalog.js'
import { runSemanticExecutor } from '../src/executors/semantic.js'
import type { ExecutorSpec, GateSpec } from '../src/core/types.js'

// ── 种子随机目录生成（确定性：mulberry32）──
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface GenCatalog {
  concepts: Array<{ iri: string; label: string }>
  properties: Array<{ predicate: string; subPropertyOf?: string[]; inverseOf?: string; transitive?: boolean }>
}

/** 22 个种子各生成一张随机目录：n 概念 + m 谓词（随机 subPropertyOf 边/传递旗/互逆对）。 */
function genCatalog(seed: number): { catalog: GenCatalog; predicates: string[]; concepts: string[] } {
  const r = rng(seed)
  const n = 5 + Math.floor(r() * 4)
  const m = 2 + Math.floor(r() * 4)
  const concepts = Array.from({ length: n }, (_, i) => ({ iri: `x:C${i}`, label: `C${i}` }))
  const predicates: string[] = Array.from({ length: m }, (_, i) => `x:P${i}`)
  const properties: GenCatalog['properties'] = []
  for (const [i, p] of predicates.entries()) {
    const entry: GenCatalog['properties'][number] = { predicate: p }
    if (i > 0 && r() < 0.5) entry.subPropertyOf = [predicates[Math.floor(r() * i)]]
    entry.transitive = r() < 0.4
    properties.push(entry)
  }
  // 互逆对：随机配一对（若谓词数 ≥2）
  if (m >= 2) {
    const i = Math.floor(r() * m)
    let j = Math.floor(r() * m)
    if (j === i) j = (j + 1) % m
    properties[i]!.inverseOf = predicates[j]!
  }
  return { catalog: { concepts, properties }, predicates, concepts: concepts.map((c) => c.iri) }
}

/** 随机观察边集：s/p/o 均随机，p ∈ 目录谓词。 */
function genEdges(seed: number, concepts: string[], predicates: string[], count = 12): Array<{ s: string; p: string; o: string }> {
  const r = rng(seed * 7 + 13)
  return Array.from({ length: count }, () => ({
    s: concepts[Math.floor(r() * concepts.length)]!,
    p: predicates[Math.floor(r() * predicates.length)]!,
    o: concepts[Math.floor(r() * concepts.length)]!,
  }))
}

// ── 朴素 oracle（独立实现：不共用内核的任何推理函数）──
/** oracle 语义满足：期望 (S,P,O) 满足 ⇔ 存在边链 S →…→ O 全部沿 ⊑P 的谓词（Warshall），
 *  或存在 (O,p,S) 且 p ⊑ inv(P)（显式互逆才翻转）。 */
function oracleSatisfies(
  edges: Array<{ s: string; p: string; o: string }>,
  props: Map<string, { sub?: string[]; inv?: string; transitive?: boolean }>,
  S: string, P: string, O: string,
): boolean {
  // p ⊑ q：自反 + subPropertyOf 祖先链（朴素递归）
  const subOf = (p: string, q: string, seen = new Set<string>()): boolean => {
    if (p === q) return true
    if (seen.has(p)) return false
    seen.add(p)
    for (const parent of props.get(p)?.sub ?? []) if (subOf(parent, q, seen)) return true
    return false
  }
  // 节点集
  const nodes = new Set<string>()
  for (const e of edges) { nodes.add(e.s); nodes.add(e.o) }
  // 传递闭包只在 P（或其祖先）声明 transitive 时才推导（与内核语义一致：
  // 非传递谓词不链式满足）。Warshall 式不动点——朴素实现故意不同于内核 BFS。
  const transitive = (() => {
    // P 的祖先链上有任一 transitive 即传递（subPropertyOf 继承传递性）
    const walk = (p: string, seen = new Set<string>()): boolean => {
      if (seen.has(p)) return false
      seen.add(p)
      if (props.get(p)?.transitive) return true
      for (const parent of props.get(p)?.sub ?? []) if (walk(parent, seen)) return true
      return false
    }
    return walk(P)
  })()
  const relAll: Array<[string, string]> = edges.filter((e) => subOf(e.p, P)).map((e) => [e.s, e.o] as [string, string])
  const reach = new Set<string>(relAll.map((r) => `${r[0]}>${r[1]}`))
  if (reach.has(`${S}>${O}`)) return true
  if (transitive) {
    // 迭代闭包：新推可达对参与下一轮拼接（join 基于当前 reach 全集，非仅原始边）
    let changed = true
    while (changed) {
      changed = false
      const pairs = [...reach].map((k) => k.split('>') as [string, string])
      for (const [a, b] of pairs) {
        for (const [c, d] of pairs) {
          if (b === c && !reach.has(`${a}>${d}`)) { reach.add(`${a}>${d}`); changed = true }
        }
      }
    }
    if (reach.has(`${S}>${O}`)) return true
  }
  // 互逆反向：显式 inverseOf 声明才翻转
  const inv = props.get(P)?.inv
  if (inv && edges.some((e) => e.s === O && e.o === S && subOf(e.p, inv))) return true
  return false
}

const gateOf = (executors: ExecutorSpec[], evidenceTypes: string[]): GateSpec => ({
  apiVersion: 'qgate/v1alpha1', kind: 'Gate',
  metadata: { id: 'g.t', version: '0.1.0' },
  spec: {
    domain: 'L3', claims: ['c'], triggers: ['task_close'], executors,
    evidence: { required: evidenceTypes }, policy: { failure: 'block', inconclusive: 'block' },
  },
})

describe('OWL 关系组合 oracle（22 固定种子 × 随机目录/边集）', () => {
  it('内核判定与朴素 oracle 逐期望三元组一致；oracle 满足 ⇒ 内核满足（单向健全性）', async () => {
    for (let seed = 1; seed <= 22; seed++) {
      const { catalog, predicates, concepts } = genCatalog(seed)
      const edges = genEdges(seed, concepts, predicates)
      const parsed = parseCatalog(catalog)
      expect(parsed, `seed ${seed}: catalog must parse`).not.toBeNull()
      const reasoning = buildReasoning(parsed!)
      const props = new Map(catalog.properties.map((p) => [p.predicate, { sub: p.subPropertyOf, inv: p.inverseOf, transitive: p.transitive }]))

      // 全组合期望三元组：S/O 遍历概念对、P 遍历谓词（抽样对角+随机对，控制规模）
      const ws = mkdtempSync(join(tmpdir(), 'qgate-comb-'))
      try {
        writeFileSync(join(ws, 'catalog.json'), JSON.stringify(catalog))
        // 观察文件协议字段名是 subject/predicate/object（genEdges 的 s/p/o 是生成器内部形）
        writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: edges.map((e) => ({ subject: e.s, predicate: e.p, object: e.o })) }))
        const expectations: Array<{ subject: string; predicate: string; object: string }> = []
        for (const S of concepts) {
          for (const O of concepts) {
            for (const P of predicates) {
              if (S === O && !reasoning.isTransitive(P)) continue // 自环期望只对传递谓词有意义
              expectations.push({ subject: S, predicate: P, object: O })
            }
          }
        }
        // affectedPaths 截断 100 条，不能作全量 missing 集——逐期望单独跑内核判定
        //（慢但穷尽：每 seed ≤ 7×7×5=245 次纯计算，无 IO）。
        for (const e of expectations) {
          const oracle = oracleSatisfies(edges, props, e.subject, e.predicate, e.object)
          const exec: ExecutorSpec = { id: 's', type: 'semantic', check: 'relation', catalogFile: 'catalog.json', observedFile: 'r.json', relations: [e], evidenceType: 'x' }
          const ev = await runSemanticExecutor(exec, { runId: 'r', gateId: 'g', workspace: ws })
          const kernelMissing = (ev.provenance.affectedPaths ?? []).some((m) => m.includes('missingRelation'))
          const kernelOk = ev.result === 'pass' && !kernelMissing
          const oracleOk = oracle
          expect([`seed ${seed}: ${e.subject} --${e.predicate}--> ${e.object} kernel=${kernelOk} oracle=${oracleOk}`, kernelOk === oracleOk]).toEqual([`seed ${seed}: ${e.subject} --${e.predicate}--> ${e.object} kernel=${kernelOk} oracle=${oracleOk}`, true])
        }
        void gateOf
      } finally { rmSync(ws, { recursive: true, force: true }) }
    }
  })

  it('针对性反例：互逆同方向不接受（F03 镜像）；传递自环须真环回（W6 镜像）', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'qgate-comb2-'))
    try {
      const catalog = {
        concepts: [{ iri: 'x:A', label: 'A' }, { iri: 'x:B', label: 'B' }],
        properties: [{ predicate: 'x:p', inverseOf: 'x:q' }, { predicate: 'x:q' }],
      }
      writeFileSync(join(ws, 'catalog.json'), JSON.stringify(catalog))
      // F03 镜像：观察 (A, q, B)——q 是 p 的逆，但方向没翻转，不能当 (A,p,B) 满足
      writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [{ subject: 'x:A', predicate: 'x:q', object: 'x:B' }] }))
      const e1: ExecutorSpec = { id: 's', type: 'semantic', check: 'relation', catalogFile: 'catalog.json', observedFile: 'r.json', relations: [{ subject: 'x:A', predicate: 'x:p', object: 'x:B' }], evidenceType: 'x' }
      const ev1 = await runSemanticExecutor(e1, { runId: 'r', gateId: 'g', workspace: ws })
      expect(ev1.result).toBe('fail')
      expect(ev1.summary).toContain('missingRelation')
      // 正向翻转 (B, q, A) 才满足 (A,p,B)
      writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [{ subject: 'x:B', predicate: 'x:q', object: 'x:A' }] }))
      const ev2 = await runSemanticExecutor(e1, { runId: 'r2', gateId: 'g', workspace: ws })
      expect(ev2.result).toBe('pass')

      // W6 镜像：传递谓词 r；期望 (A,r,A)。只有 A→B 边时不可达（visited 不预置起点），
      // 加 B→A 边后真环回可达。
      const cat3 = {
        concepts: [{ iri: 'x:A', label: 'A' }, { iri: 'x:B', label: 'B' }],
        properties: [{ predicate: 'x:r', transitive: true }],
      }
      writeFileSync(join(ws, 'catalog.json'), JSON.stringify(cat3))
      const e3: ExecutorSpec = { id: 's', type: 'semantic', check: 'relation', catalogFile: 'catalog.json', observedFile: 'r.json', relations: [{ subject: 'x:A', predicate: 'x:r', object: 'x:A' }], evidenceType: 'x' }
      writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [{ subject: 'x:A', predicate: 'x:r', object: 'x:B' }] }))
      const ev3 = await runSemanticExecutor(e3, { runId: 'r3', gateId: 'g', workspace: ws })
      expect(ev3.result).toBe('fail')
      writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [
        { subject: 'x:A', predicate: 'x:r', object: 'x:B' },
        { subject: 'x:B', predicate: 'x:r', object: 'x:A' },
      ] }))
      const ev4 = await runSemanticExecutor(e3, { runId: 'r4', gateId: 'g', workspace: ws })
      expect(ev4.result).toBe('pass')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('SHACL-lite 组合矩阵（datatype × 值域抽查，朴素 oracle 对照）', () => {
  it('datatype/pattern/allowedValues 组合抽查：oracle 逐格对照 profile 判定', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'qgate-shacl-'))
    try {
      const shapes = {
        fields: {
          id: { datatype: 'string' },
          count: { datatype: 'number', min: 0, max: 10 },
          code: { pattern: '^[A-Z]{3}$' },
          state: { allowedValues: ['open', 'closed'] },
        },
      }
      writeFileSync(join(ws, 'shapes.json'), JSON.stringify(shapes))
      const cases: Array<{ rec: Record<string, unknown>; oracleViolations: string[] }> = [
        { rec: { id: 'a', count: 5, code: 'ABC', state: 'open' }, oracleViolations: [] },
        { rec: { id: 123 }, oracleViolations: ['id'] },                    // datatype 不符
        { rec: { id: 'a', count: 11 }, oracleViolations: ['count'] },      // max 越界
        { rec: { id: 'a', count: -1 }, oracleViolations: ['count'] },      // min 越界
        { rec: { id: 'a', code: 'abc' }, oracleViolations: ['code'] },     // pattern 不符
        { rec: { id: 'a', state: 'blocked' }, oracleViolations: ['state'] }, // 枚举外
        { rec: { id: 'a', count: 'x' }, oracleViolations: ['count'] },     // datatype number 收到字符串
      ]
      for (const [i, c] of cases.entries()) {
        writeFileSync(join(ws, 'data.json'), JSON.stringify({ records: [c.rec] }))
        const exec: ExecutorSpec = { id: 's', type: 'semantic', check: 'profile', shapesFile: 'shapes.json', dataFile: 'data.json', evidenceType: 'x' }
        const ev = await runSemanticExecutor(exec, { runId: `r${i}`, gateId: 'g', workspace: ws })
        if (c.oracleViolations.length === 0) {
          expect(ev.result, `case ${i} should pass`).toBe('pass')
        } else {
          expect(ev.result, `case ${i} should fail`).toBe('fail')
          for (const field of c.oracleViolations) expect(ev.summary, `case ${i} names ${field}`).toContain(field)
        }
      }
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})
