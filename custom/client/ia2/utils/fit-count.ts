// overlay/custom/client/ia2/utils/fit-count.ts
// 顶栏条「自适应限量显示」纯函数核（2026-10-10 注意力条根治轮）：
// 塞不下的条目不再被 overflow 像素级切半（隐藏滚动条下无任何提示，视觉即坏），
// 改为按容器实测宽度取前缀 + 尾部「+N」汇总 chip。宽度全部由隐藏测量行实测，
// 本模块只做算术——纯函数，jsdom 可全覆盖。

export interface FitCountInput {
  /** 各 chip 实测宽度（含内边距边框，offsetWidth 语义） */
  widths: number[]
  /** 可用宽度（容器 clientWidth 减去同容器内兄弟元素占位）。<=0 视为量不到（jsdom/未挂载）——全部显示，不出 +N */
  available: number
  /** chip 间距 */
  gap: number
  /** 「+N」chip 自身宽度（截断发生才需要为其留位） */
  moreWidth: number
}

/** 前缀和辅助：前 k 个 chip 的总占用（含 chip 间 gap） */
function used(widths: number[], k: number, gap: number): number {
  let sum = 0
  for (let i = 0; i < k; i++) sum += widths[i]
  return sum + gap * Math.max(0, k - 1)
}

/**
 * 能完整放下多少个 chip：
 * - 全放下 → widths.length（不出现 +N）；
 * - 放不下 → 为「+N」chip 预留 moreWidth+gap 后贪心取前缀，至少保 1 个；
 * - available<=0（量不到布局）→ 全显示（渐进增强：真浏览器必有宽度，jsdom 兜底全量）。
 */
export function fitCount({ widths, available, gap, moreWidth }: FitCountInput): number {
  if (widths.length === 0) return 0
  if (available <= 0) return widths.length
  if (used(widths, widths.length, gap) <= available) return widths.length
  const budget = available - moreWidth - gap
  let k = 0
  let acc = 0
  while (k < widths.length) {
    const next = k === 0 ? widths[0] : acc + gap + widths[k]
    if (next > budget) break
    acc = next
    k++
  }
  return Math.max(1, k)
}
