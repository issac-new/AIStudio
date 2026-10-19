// overlay[eval] S0 相似度规则（百度评测体系轮 B2，2026-10-19）。
//
// 范式来源：《百度 Agent 评测体系技术拆解》§3 三角互证——规则评估器打底：
// 预测与标注的文本相似度（便宜、可复现、无裁判偏差）；「停用词表过滤是必做的
// 前置清洁，避免特殊字符与高频虚词污染相似度指标」。
//
// 口径：ROUGE-L F1 做在字符序列上（中文无分词依赖、确定性、零依赖）；
// 比对对象=证据 transcript vs 任务 expectedBehavior（参照答案）。
// 语义级相似（同义改写）不归 S0 管——那是 S1 裁判的职责（分层不双头）。
import type { Evidence, EvalTask } from './types'

/** 默认停用词表（中英高频虚词/标点类噪声；文章口径「必做的前置清洁」）。 */
export const DEFAULT_STOPWORDS: ReadonlySet<string> = new Set([
  // 中文高频结构虚词
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '与', '及', '或', '等', '为', '对', '从', '被', '把', '让', '向', '按', '以',
  '并', '而', '但', '则', '其', '该', '此', '这些', '那些', '什么', '怎么',
  // 英文高频虚词
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to',
  'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'but', 'not', 'it',
  'this', 'that', 'these', 'those', 'as', 'by', 'from', 'will', 'would',
  'can', 'could', 'should', 'have', 'has', 'had', 'do', 'does', 'did',
])

/** 停用词过滤：逐字符（含英文按词）剔除停用词与空白。空表=显式关闭清洁。 */
export function stripStopwords(text: string, stopwords: ReadonlySet<string>): string {
  if (stopwords.size === 0) return text
  let out = text.replace(/[A-Za-z]+/g, (word) => (stopwords.has(word.toLowerCase()) ? ' ' : word))
  let chars = ''
  for (const ch of out) {
    if (/\s/.test(ch)) continue
    if (stopwords.has(ch)) continue
    chars += ch
  }
  return chars
}

/** 字符级 LCS 长度（ROUGE-L 的公共子序列核；DP O(n·m)，文本截断后实践 <1e4）。 */
function lcsOfChars(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0
  let prev = new Array<number>(n + 1).fill(0)
  let cur = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    const swap = prev
    prev = cur
    cur = swap
    cur.fill(0)
  }
  return prev[n]
}

/** ROUGE-L F1（字符级）：0~1，1=参照完全覆盖于序列意义下。任一侧空 → 0。 */
export function rougeLf1(candidate: string, reference: string): number {
  if (candidate.length === 0 || reference.length === 0) return 0
  const lcs = lcsOfChars(candidate, reference)
  if (lcs === 0) return 0
  const p = lcs / candidate.length
  const r = lcs / reference.length
  return (2 * p * r) / (p + r)
}

export interface SimilarityScoreInput {
  transcript: string
  reference: string
  /** 覆盖默认停用词表；[] = 关闭清洁（显式退出）。 */
  stopwords?: string[]
}

/** 计分入口：停用词清洁 → ROUGE-L F1。导出供测试与判定路径复用。 */
export function similarityScore(input: SimilarityScoreInput): number {
  const table = input.stopwords === undefined ? DEFAULT_STOPWORDS : new Set(input.stopwords)
  const cand = stripStopwords(input.transcript, table)
  const ref = stripStopwords(input.reference, table)
  return rougeLf1(cand, ref)
}

/** S0 判定：得分 ≥ minScore → 'yes'；证据无 transcript → 'unknown'（诚实缺席）。 */
export function similarityVerdict(
  task: EvalTask,
  evidence: Evidence,
  rule: { minScore: number; stopwords?: string[] },
): 'yes' | 'no' | 'unknown' {
  const transcript = evidence.transcript ?? ''
  if (!transcript.trim()) return 'unknown'
  const score = similarityScore({ transcript, reference: task.expectedBehavior, stopwords: rule.stopwords })
  return score >= rule.minScore ? 'yes' : 'no'
}
