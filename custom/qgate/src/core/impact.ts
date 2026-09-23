// Glob 匹配与影响分析（设计 §5.1 impact.ts；P3 起供 plan/status 消费）。
// 自实现 glob→regex（** 跨目录 / * 单段内 / ? 单字符），零依赖。

export function globToRegExp(pattern: string): RegExp {
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // ** ：跨目录。`**/` 与 `/**` 语义按业界惯例折叠。
        let j = i + 2
        if (pattern[j] === '/') j++
        re += '(?:.*)'
        i = j
        continue
      }
      re += '[^/]*'
      i++
      continue
    }
    if (c === '?') {
      re += '[^/]'
      i++
      continue
    }
    if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c
      i++
      continue
    }
    re += c
    i++
  }
  return new RegExp(`^${re}$`)
}

export function globMatch(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path)
}

/** 变更集是否命中门的 appliesWhen：any=任一命中；all=全部命中（设计 types.appliesWhen）。 */
export function appliesToChanged(
  appliesWhen: { changed: { any?: string[]; all?: string[] } } | undefined,
  changedPaths: readonly string[],
): boolean {
  if (!appliesWhen) return true // 未声明 = 全域适用
  const { any, all } = appliesWhen.changed
  if (all && all.length > 0) {
    const everyPatternHit = all.every((p) => changedPaths.some((c) => globMatch(p, c)))
    if (!everyPatternHit) return false
  }
  if (any && any.length > 0) {
    return changedPaths.some((c) => any.some((p) => globMatch(p, c)))
  }
  if (all && all.length > 0) return true // 仅有 all 且已命中
  return false // 空 any/all（解析层已拦，防御）
}

/**
 * 影响分析：变更集 → 适用的门（v0.1 §27）。
 * 输出排序按 domain，保证 plan 输出稳定。
 */
export function selectGates<S extends { spec: { appliesWhen?: { changed: { any?: string[]; all?: string[] } } } }>(
  gates: readonly S[],
  changedPaths: readonly string[],
): S[] {
  return gates.filter((g) => appliesToChanged(g.spec.appliesWhen, changedPaths))
}
