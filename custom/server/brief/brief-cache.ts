// overlay/brief 域：runtime brief 前缀稳定缓存（multica §八 P2 吸收，矩阵 §3.5 P2）。
//
// multica 语义（runtime brief 缓存前缀稳定+服务端 diff）：任务简报（brief）逐轮
// 复述会浪费 token——**稳定前缀缓存**：多轮 brief 的公共前缀只存一份（缓存命中
// 复用），变化段走服务端 diff 增量下发。本模块=前缀稳定纯函数（找公共前缀+
// diff 变更段），缓存 IO 归调用方。
export interface BriefEntry {
  briefId: string
  text: string
  at: number
}

export interface BriefDiff {
  /** 与上一轮的公共前缀（稳定段——缓存可复用）。 */
  stablePrefix: string
  /** 变更段（增量下发部分）。 */
  delta: string
  /** 前缀字符数（缓存收益指标）。 */
  prefixChars: number
}

/** 新 brief 与上一版的前缀 diff（稳定段+变更段）。 */
export function diffBrief(prev: string | null, next: string): BriefDiff {
  if (!prev) {
    return { stablePrefix: '', delta: next, prefixChars: 0 }
  }
  let i = 0
  const max = Math.min(prev.length, next.length)
  while (i < max && prev[i] === next[i]) i += 1
  // 前缀断在词中时回退到词边界（diff 段从完整词起，利于阅读）。
  while (i > 0 && i < next.length && !/\s/.test(next[i - 1]) && !/\s/.test(next[i])) i -= 1
  return {
    stablePrefix: next.slice(0, i),
    delta: next.slice(i),
    prefixChars: i,
  }
}

/** 多轮 brief 链的缓存收益（累计稳定前缀字符——缓存命中的 token 节省）。 */
export function briefChainSavings(briefs: readonly string[]): { totalChars: number; savedChars: number; savedPct: number } {
  let prev: string | null = null
  let totalChars = 0
  let savedChars = 0
  for (const b of briefs) {
    const d = diffBrief(prev, b)
    totalChars += b.length
    savedChars += d.prefixChars
    prev = b
  }
  return {
    totalChars,
    savedChars,
    savedPct: totalChars > 0 ? Math.round((savedChars / totalChars) * 100) : 0,
  }
}
