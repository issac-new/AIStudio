// overlay[toolresultguard] fold.ts · 工具输出折叠（2026-10-23 HarnessPro 吸收轮 HP-4）。
//
// 来源（HarnessPro repo harnesses/*/runtime/hook.py `_compact_text`/`_post_tool_use`）：
// 进化出的 harness 对超长工具输出做两级压缩——先折叠连续重复行
// （`[previous line repeated N more times]`），再头尾截断留中间省略标记，原文落盘
// 可回查（本仓消费方 judge 判分 state 只取折叠视图，不落盘原始件）。
// 纯函数、无副作用；消费方：eval/judge.ts truncateForState（判分输入去重复噪音）。

/** 连续重复行折叠：同一行连出 >2 次 → 保留 1 行 + 折叠标记；恰 2 次全保留（hook.py 同款阈值）。 */
export function foldRepeats(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    let j = i + 1
    while (j < lines.length && lines[j] === lines[i]) j += 1
    const repeats = j - i
    out.push(lines[i])
    if (repeats > 2) out.push(`［上一行重复 ${repeats - 1} 次］`)
    else if (repeats === 2) out.push(lines[i])
    i = j
  }
  return out.join('\n')
}

export interface CompactOptions {
  maxChars: number
  headChars?: number
  tailChars?: number
}

export interface CompactResult {
  text: string
  /** 折叠+截断前原文长度（消费方留痕「压掉了多少」）。 */
  rawChars: number
  /** 重复行折叠节省的字符数（先折叠后截断的两级口径分开记账）。 */
  savedByFold: number
  /** 头尾截断省略的字符数。 */
  omittedByTruncate: number
}

/**
 * 两级压缩：foldRepeats → 头尾截断（保头为主、尾留余量，与 judge truncateForState
 * 的保头语义一致）。短文（折叠后 ≤ maxChars）直通只记 fold 收益。
 */
export function compactOutput(text: string, opts: CompactOptions): CompactResult {
  const rawChars = text.length
  const folded = foldRepeats(text)
  const savedByFold = rawChars - folded.length
  const maxChars = Math.max(1, opts.maxChars)
  if (folded.length <= maxChars) {
    return { text: folded, rawChars, savedByFold, omittedByTruncate: 0 }
  }
  const tail = Math.min(opts.tailChars ?? Math.floor(maxChars / 4), Math.max(0, maxChars - 2))
  const head = Math.max(0, maxChars - tail - 1)
  const omitted = folded.length - head - tail
  const text2 = `${folded.slice(0, head)}\n…［省略 ${omitted} 字符（重复行已折叠，共省 ${savedByFold}）］…\n${folded.slice(folded.length - tail)}`
  return { text: text2, rawChars, savedByFold, omittedByTruncate: omitted }
}
