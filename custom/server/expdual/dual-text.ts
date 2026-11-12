// overlay[expdual] 文本工具：分词、条件-动作句解析与规范化、极性判定。
//
// 单一事实源：条件-动作的规范形态只在这里定义（TIP 的 text 一律由 condition/action 生成），
// 分类、生命周期、注入三处共用，避免各自拼串造成同义不同形。

/** 条件-动作规范形态（中文口径；论文形如 "under <condition>: <action>"）。 */
export function formatTip(condition: string, action: string): string {
  return `在「${condition.trim()}」条件下：${action.trim()}`
}

export interface ParsedTip {
  condition: string
  action: string
}

/** 从自然语言里解析条件与动作；解析不出返回 null（不猜）。 */
export function parseTip(text: string): ParsedTip | null {
  const raw = text.trim()
  if (!raw) return null
  const patterns: RegExp[] = [
    /^在[「"']?(.+?)[」"']?(?:的)?条件下?[，,:：]\s*(.+)$/,
    /^在(.+?)下[，,:：]\s*(.+)$/,
    /^当(.+?)时[，,:：]\s*(.+)$/,
    /^如果(.+?)[，,]\s*(.+)$/,
    /^若(.+?)[，,]\s*(.+)$/,
    /^under\s+(.+?)\s*:\s*(.+)$/i,
  ]
  for (const re of patterns) {
    const m = re.exec(raw)
    if (!m) continue
    const condition = m[1].trim()
    const action = m[2].trim()
    if (condition && action) return { condition, action }
  }
  return null
}

const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '或', '也', '都', '而', '及', '等', '为', '把', '被', '就', '还', '要', '会',
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'is', 'are', 'be', 'in', 'on', 'for', 'with', 'this', 'that',
])

/** 分词：拉丁词按词、CJK 按二元组；停用词与单字碎片丢弃（查询与规则两侧同一口径）。 */
export function tokenize(text: string): string[] {
  const out: string[] = []
  const lower = text.toLowerCase()
  for (const m of lower.matchAll(/[a-z0-9_][a-z0-9_.-]*/g)) {
    const w = m[0]
    if (w.length > 1 && !STOPWORDS.has(w)) out.push(w)
  }
  for (const run of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const s = run[0]
    if (s.length === 1) {
      if (!STOPWORDS.has(s)) out.push(s)
      continue
    }
    for (let i = 0; i + 1 < s.length; i += 1) {
      const bigram = s.slice(i, i + 2)
      if (STOPWORDS.has(bigram)) continue
      out.push(bigram)
    }
  }
  return out
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text))
}

/** Jaccard 相似度（空集返回 0，不把「都没词」当成相似）。 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

/** 否定标记（避免/不建议等宽泛词不计——它们常是正向技巧的一部分）。 */
const NEGATION = /(不|勿|禁止|不要|无需|不能)/

export function hasNegation(text: string): boolean {
  return NEGATION.test(text)
}

/** 两段文本是否「同动作相反极性」——矛盾检测的结构证据之一。 */
export function oppositePolarity(a: string, b: string): boolean {
  return hasNegation(a) !== hasNegation(b)
}
