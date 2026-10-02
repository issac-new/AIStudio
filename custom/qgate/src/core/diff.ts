// 结构化深比较（v0.3 R1/R2，上游 diff.mjs/assertions.mjs 本地方言）：
// jsonPointerDiff —— expected vs observed 的 JSON Pointer 级差异（missing/unexpected/mismatch），
//   ignorePaths 支持 `*` 段通配（按段前缀匹配，上游语义：只豁免声明的路径，不做全局模糊）。
// getPath / compareLiteral —— 观察案例内的点路径取值与断言算子（property/semantic-constraint 共用）。
// 纪律：解析畸形一律抛错，由调用方转 error 证据（INCONCLUSIVE，不是 PASS）。

export interface DiffEntry {
  pointer: string
  kind: 'missing' | 'unexpected' | 'mismatch'
  detail: string
}

function segmentMatches(pattern: string, segment: string): boolean {
  return pattern === '*' || pattern === segment
}

function ignored(pointer: string, ignorePaths: readonly string[]): boolean {
  // 前导 / 产生的空段剥掉，与模式段对齐（/b/c ↔ /b/*）
  const segs = pointer.split('/').slice(1)
  for (const raw of ignorePaths) {
    const pat = raw.replace(/^\//, '').split('/')
    if (pat.length > segs.length) continue
    let ok = true
    for (let i = 0; i < pat.length; i++) {
      if (!segmentMatches(pat[i], segs[i])) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function walk(expected: unknown, observed: unknown, pointer: string, out: DiffEntry[]): void {
  if (expected === undefined && observed === undefined) return
  if (expected === undefined) { out.push({ pointer, kind: 'unexpected', detail: `unexpected (got ${typeOf(observed)})` }); return }
  if (observed === undefined) { out.push({ pointer, kind: 'missing', detail: `missing (expected ${typeOf(expected)})` }); return }
  const te = typeOf(expected)
  const to = typeOf(observed)
  if (te !== to) {
    out.push({ pointer, kind: 'mismatch', detail: `type mismatch: expected ${te}, got ${to}` })
    return
  }
  if (te === 'object') {
    const keys = new Set([...Object.keys(expected as object), ...Object.keys(observed as object)])
    for (const k of keys) walk((expected as Record<string, unknown>)[k], (observed as Record<string, unknown>)[k], `${pointer}/${k}`, out)
    return
  }
  if (te === 'array') {
    const ea = expected as unknown[]
    const oa = observed as unknown[]
    const n = Math.max(ea.length, oa.length)
    for (let i = 0; i < n; i++) walk(ea[i], oa[i], `${pointer}/${i}`, out)
    return
  }
  if (expected !== observed) {
    out.push({ pointer, kind: 'mismatch', detail: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(observed)}` })
  }
}

/** JSON Pointer 深比较。根差异（非对象对非对象）也会被报告为 `/` 上的 mismatch。 */
export function jsonPointerDiff(expected: unknown, observed: unknown, ignorePaths: readonly string[] = []): DiffEntry[] {
  const out: DiffEntry[] = []
  walk(expected, observed, '', out)
  return out.filter((e) => !ignored(e.pointer, ignorePaths))
}

/** 观察对象内的点路径取值：`a.b.0.c`；缺失返回 undefined。 */
export function getPath(obj: unknown, path: string): unknown {
  if (!path || path === '.') return obj
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const i = Number(seg)
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return undefined
      cur = cur[i]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

export type AssertionOperator = 'eq' | 'neq' | 'le' | 'lt' | 'ge' | 'gt'

export const ASSERTION_OPERATORS: readonly AssertionOperator[] = ['eq', 'neq', 'le', 'lt', 'ge', 'gt']

export interface AssertionSpec {
  /** 语义目录概念约束可携带 id（behavior property 断言无此字段）。 */
  id?: string
  left: string
  operator: AssertionOperator
  right?: string
  value?: unknown
  when?: string
}

/** 断言求值：返回 true=满足 / false=违例 / 'skip'=when 条件不满足（上游 invariant 语义）。 */
export function evaluateAssertion(a: AssertionSpec, caseData: unknown): boolean | 'skip' {
  if (a.when !== undefined && getPath(caseData, a.when) !== true) return 'skip'
  const lhs = getPath(caseData, a.left)
  let rhs: unknown
  if (a.right !== undefined) rhs = getPath(caseData, a.right)
  else rhs = a.value
  const ln = typeof lhs === 'number' ? lhs : undefined
  const rn = typeof rhs === 'number' ? rhs : undefined
  switch (a.operator) {
    case 'eq': return lhs === rhs
    case 'neq': return lhs !== rhs
    case 'le': case 'lt': case 'ge': case 'gt': {
      if (ln === undefined || rn === undefined) return false
      if (a.operator === 'le') return ln <= rn
      if (a.operator === 'lt') return ln < rn
      if (a.operator === 'ge') return ln >= rn
      return ln > rn
    }
  }
}

/** 深相等（快路径：jsonPointerDiff 为空即相等）。 */
export function deepEqual(expected: unknown, observed: unknown): boolean {
  return jsonPointerDiff(expected, observed).length === 0
}
