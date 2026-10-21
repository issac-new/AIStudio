// overlay[eval] 主观盲测面板（2026-10-21 三号调研落地）。
//
// 来源：《AIGC 智能体怎么测？》第一层——主观盲测是客观量化指标的强制准入
// 门槛：5~10 名评审独立打分、1~5 分制、去最高最低取均值、新旧版本背靠背
// 盲选；《美团 CatPaw》双轨盲评——人工盲测分与裁判分交叉验证，分歧样本进
// 专家仲裁与 Rubric 迭代。定位：开放维度（回答质量/满意度这类机器判不准的
// 面）的人工盲测轨道；分数不写回判词（不污染机判账），只作独立读数与裁判
// 校准的交叉面。纯函数，无 IO。
export interface BlindScore {
  reviewerId: string
  /** 打分（闭区间 [scaleMin, scaleMax]）。 */
  score: number
  /** 评审可见的样本引用（盲：不含版本归属）。 */
  notedAt?: number
}

export interface BlindReviewInput {
  reviewId: string
  /** 盲测对象（run 内样本键或整 run）。 */
  targetRef: string
  scaleMin: number
  scaleMax: number
  scores: BlindScore[]
  /** 截尾策略：minmax=去最高最低取均值（源文口径）；none=全量均值。 */
  trim?: 'none' | 'minmax'
  /** 生效最少评审数（源文 5~10 名；缺省 5）。 */
  minReviewers?: number
}

export interface BlindReviewResult {
  reviewId: string
  targetRef: string
  reviewerCount: number
  /** 参与均分的分数（截尾后）。 */
  kept: number[]
  /** 被截掉的分数（并列极值按个数截）。 */
  dropped: number[]
  trimmedMean: number | null
  /** 未达最少评审数时不给分（宁缺毋滥，如实 insufficient）。 */
  insufficient: boolean
  /** 分歧度=极差/量表宽（≥0.5 提示进专家仲裁）。 */
  spreadRatio: number | null
  /** 并列极值时的截尾说明（可审计）。 */
  note?: string
}

/**
 * 截尾均值：minmax 模式去掉一个最高与一个最低（并列时各去一个=按个数去），
 * 评审数 < 4 时 minmax 自动降级为全量均值（去完就没了）；非法分值剔除在先。
 */
export function blindTrimmedMean(input: BlindReviewInput): BlindReviewResult {
  const minReviewers = Math.max(1, input.minReviewers ?? 5)
  const width = input.scaleMax - input.scaleMin
  const valid = input.scores.filter((s) => Number.isFinite(s.score) && s.score >= input.scaleMin && s.score <= input.scaleMax)
  const sorted = [...valid].map((s) => s.score).sort((a, b) => a - b)
  const insufficient = valid.length < minReviewers
  let kept = sorted
  let dropped: number[] = []
  let note: string | undefined
  if (!insufficient && (input.trim ?? 'minmax') === 'minmax' && sorted.length >= 4) {
    const lo = sorted[0]
    const hi = sorted[sorted.length - 1]
    kept = sorted.slice(1, -1)
    dropped = [lo, hi]
    if (sorted.filter((x) => x === lo).length > 1 || sorted.filter((x) => x === hi).length > 1) {
      note = '极值并列：各截一个（按个数截，不按分值全截）'
    }
  } else if ((input.trim ?? 'minmax') === 'minmax' && sorted.length < 4 && sorted.length >= minReviewers) {
    note = '评审数不足 4：截尾降级为全量均值'
  }
  const mean = kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null
  return {
    reviewId: input.reviewId,
    targetRef: input.targetRef,
    reviewerCount: valid.length,
    kept,
    dropped,
    trimmedMean: insufficient ? null : mean,
    insufficient,
    spreadRatio: sorted.length && width > 0 ? (sorted[sorted.length - 1] - sorted[0]) / width : null,
    note,
  }
}

/**
 * 背靠背盲选（源文口径）：A/B 两版本隐名成对呈现，每人投一票；
 * 平票=无显著偏好（不硬凑胜负）。
 */
export interface BlindChoiceVote {
  reviewerId: string
  /** 'A' | 'B'（呈现侧随机化由调用方负责，此处只收结果）。 */
  choice: 'A' | 'B'
}

export function blindPairChoice(votes: BlindChoiceVote[]): { winner: 'A' | 'B' | 'tie'; aVotes: number; bVotes: number } {
  const aVotes = votes.filter((v) => v.choice === 'A').length
  const bVotes = votes.filter((v) => v.choice === 'B').length
  return { winner: aVotes > bVotes ? 'A' : bVotes > aVotes ? 'B' : 'tie', aVotes, bVotes }
}
