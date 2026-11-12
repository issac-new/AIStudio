// overlay[expcandidates] 经验作用域判定（单一事实源）。
//
// expcandidates 与 expdual 两域共用同一口径：无 scope=全局；scope 限定而当前维度
// 缺席→排除（不猜）；具体度=限定维数（更具体者优先）。抽到独立文件避免两份实现漂移。
import type { ExpScope } from './exp-types'

export interface ScopeFilter {
  column?: string
  specialist?: string
}

export function scopeAllows(scope: ExpScope | undefined, filter?: ScopeFilter): boolean {
  if (!filter) return true
  if (!scope) return true
  if (Array.isArray(scope.columns) && scope.columns.length > 0) {
    if (!filter.column || !scope.columns.includes(filter.column)) return false
  }
  if (Array.isArray(scope.specialists) && scope.specialists.length > 0) {
    if (!filter.specialist || !scope.specialists.includes(filter.specialist)) return false
  }
  return true
}

export function scopeSpecificity(scope: ExpScope | undefined): number {
  if (!scope) return 0
  return (Array.isArray(scope.columns) && scope.columns.length > 0 ? 1 : 0)
    + (Array.isArray(scope.specialists) && scope.specialists.length > 0 ? 1 : 0)
}
