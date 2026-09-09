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

export class PredicateError extends Error {}

/** 点路径取值：'a.b.0.c'。任何一段缺失/越界返回 undefined，不抛。 */
export function getPath(state: unknown, path: string): unknown {
  let cur: unknown = state
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return undefined
      cur = cur[idx]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
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
    case 'and': return expr.exprs.every(e => evaluatePredicate(e, state))
    case 'or': return expr.exprs.some(e => evaluatePredicate(e, state))
    case 'not': return !evaluatePredicate(expr.expr, state)
    case 'truthy': return Boolean(getPath(state, expr.path))
    case 'exists': return getPath(state, expr.path) !== undefined
    default: throw new PredicateError(`Unknown predicate op: ${String((expr as { op: unknown }).op)}`)
  }
}
