// overlay/custom/server/loop/graph/predicate.ts
// PredicateExpr — 声明式谓词（纯 JSON 可序列化，无任意代码求值）
// 用途：条件边 / endCondition / breakCondition / guard —— 所有"可进数据库"的判定逻辑

import type { StateValues } from './types'

export type PredicateExpr =
  | { op: 'cmp'; path: string; cmp: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown }
  | { op: 'and' | 'or'; exprs: PredicateExpr[] }
  | { op: 'not'; expr: PredicateExpr }
  | { op: 'truthy'; path: string }
  | { op: 'exists'; path: string }

/** f3 台账：补 name，便于日志/告警按 name 归类（跨 realm instanceof 不可靠时按 name 兜底） */
export class PredicateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PredicateError'
  }
}

/** f2 台账：点路径取值只读自有属性——原型链（__proto__/constructor/继承键）不命中，
 *  防"可进数据库"的路径探针读到原型对象。任何一段缺失/越界返回 undefined，不抛。 */
export function getPath(state: unknown, path: string): unknown {
  let cur: unknown = state
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return undefined
      cur = cur[idx]
    } else if (typeof cur === 'object') {
      if (!Object.hasOwn(cur as object, seg)) return undefined
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

/** f3 台账：and/or 结构校验——exprs 必须为数组，畸形抛 PredicateError 而非裸 TypeError */
function exprsOf(expr: { op: 'and' | 'or'; exprs?: unknown }): PredicateExpr[] {
  if (!Array.isArray(expr.exprs)) {
    throw new PredicateError(`Malformed "${expr.op}" expression: "exprs" must be an array`)
  }
  return expr.exprs as PredicateExpr[]
}

export function evaluatePredicate(expr: PredicateExpr, state: StateValues): boolean {
  switch (expr.op) {
    case 'cmp': {
      // 先校验比较符合法性（畸形表达式要抛错），再做取值短路
      switch (expr.cmp) {
        case 'eq': case 'ne': case 'gt': case 'gte': case 'lt': case 'lte': break
        default: throw new PredicateError(`Unknown cmp operator: ${String(expr.cmp)}`)
      }
      const actual = getPath(state, expr.path)
      if (actual === undefined) return false
      switch (expr.cmp) {
        case 'eq': return actual === expr.value
        case 'ne': return actual !== expr.value
        case 'gt': return (actual as number) > (expr.value as number)
        case 'gte': return (actual as number) >= (expr.value as number)
        case 'lt': return (actual as number) < (expr.value as number)
        case 'lte': return (actual as number) <= (expr.value as number)
      }
      return false
    }
    case 'and': return exprsOf(expr).every(e => evaluatePredicate(e, state))
    case 'or': return exprsOf(expr).some(e => evaluatePredicate(e, state))
    case 'not': {
      // f3 台账：not 结构校验——expr 必须是谓词对象，畸形抛 PredicateError
      if (typeof expr.expr !== 'object' || expr.expr === null) {
        throw new PredicateError('Malformed "not" expression: "expr" must be a predicate object')
      }
      return !evaluatePredicate(expr.expr, state)
    }
    case 'truthy': return Boolean(getPath(state, expr.path))
    case 'exists': return getPath(state, expr.path) !== undefined
    default: throw new PredicateError(`Unknown predicate op: ${String((expr as { op: unknown }).op)}`)
  }
}
