// overlay/custom/client/skillgov/utils/filter.ts
// 技能扫描结果筛选（2026-10-19 P2-7）：纯函数，视图与守门测试同源。
// 危险优先序由视图的 sorted 保证；本函数只做「判定档位 + 名称/目录搜索」。
export interface ScanFilterRow {
  name: string
  dir: string
  verdict: string
}

export type ScanVerdictFilter = 'all' | 'safe' | 'caution' | 'dangerous'

export function filterScanRows<T extends ScanFilterRow>(
  rows: readonly T[],
  query: string,
  verdict: ScanVerdictFilter,
): T[] {
  const q = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (verdict !== 'all' && row.verdict !== verdict) return false
    return !q || row.name.toLowerCase().includes(q) || row.dir.toLowerCase().includes(q)
  })
}
