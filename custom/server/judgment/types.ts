// overlay[judgment] 判定席位 · 类型面（Agnes Harness 吸收批二，2026-11-20）。
//
// 定位：给既有 LLM 判定点包一层「席位」——有限选项、版本化情境键、强制回交、
// 已验证快路径。它不替代原判定核（toolresultguard 的 S0/S1/τ、eval 的多裁判
// 多数决），只决定「这一步该不该付一次模型调用」。
//
// 反目标：不做语义相似度匹配。快路径的键是精确情境键 + 策略版本 + 模型版本；
// 相似度只可用于人工参考，不可用于自动判定（历史先例只拼一行参考的既有纪律）。

/** 判定来源：规则 / 已验证快路径 / 模型 / 人。 */
export type SeatSource = 'rule' | 'fast-path' | 'model' | 'human'

/** 强制回交原因（顺序即优先级，见 seat.ts）。 */
export type HandBackReason =
  | 'user_turn'
  | 'prior_failure'
  | 'consecutive_cap'
  | 'unknown_situation'
  | 'policy_mismatch'

/** 调用方提供的即时事实（不推断，缺省即不触发）。 */
export interface SeatFacts {
  /** 用户刚发言：第一步永远交给慢系统解析意图。 */
  userJustSpoke?: boolean
  /** 上一步失败：失败后的下一步不走近路。 */
  priorStepFailed?: boolean
  /** 已连续自动判定步数（不含本次）。 */
  consecutiveAuto?: number
  /** 调用方判定当前策略与运行时不一致（如热更新未生效）。 */
  policyMismatch?: boolean
}

/** 一次席位请求。 */
export interface SeatRequest {
  /** 精确情境键（调用方归一化：stage + 内容指纹 + 作用域；禁用相似度）。 */
  situationKey: string
  /** 策略版本（阈值/提示词/开关的指纹）。 */
  policyVersion: string
  /** 模型版本（模型名 + 部署标识；换模型必须换版本）。 */
  modelVersion: string
  /** 允许的选项集；快路径命中项必须在此集合内。 */
  options: readonly string[]
  facts?: SeatFacts
}

/** 快路径条目：只有重复验证一致的判定才会 active。 */
export interface FastPathEntry<P = unknown> {
  situationKey: string
  policyVersion: string
  modelVersion: string
  /** 命中时返回的选项（原判定核的结论，如 BLOCK/PASS）。 */
  option: string
  /** 原判定核的置信度（无置信度的判定点用 1）。 */
  confidence: number
  /** 已验证次数（同选项才累加）。 */
  verifiedCount: number
  status: 'candidate' | 'active' | 'revoked'
  createdAt: number
  lastVerifiedAt: number
  revokedAt?: number
  revokedReason?: string
  /** 判定点自定义载荷（如 attackP/category/severity），席位不解释。 */
  payload?: P
}

/** 一次观察：verified=该判定可被当作正确样本（人工确认或确定性复核）。 */
export interface FastPathObservation<P = unknown> {
  option: string
  confidence: number
  verified: boolean
  /** 人工翻案：立即撤回，不再累加。 */
  overturned?: boolean
  payload?: P
  at?: number
}

/** 席位裁决：快路径 / 回交 / 继续走原判定。 */
export type SeatVerdict<P = unknown> =
  | { mode: 'fast-path'; entry: FastPathEntry<P>; reason: string }
  | { mode: 'hand-back'; reason: HandBackReason; detail: string }
  | { mode: 'evaluate'; reason: string }

/** 快路径存储端口：由各判定点按自己的既有存储实现（不新建账本域）。 */
export interface FastPathStore<P = unknown> {
  lookup(request: SeatRequest): FastPathEntry<P> | null
  observe(request: SeatRequest, observation: FastPathObservation<P>): FastPathEntry<P> | null
  revoke(request: SeatRequest, reason: string): void
}

/** 席位策略（默认值集中在 seat.ts，调用方可覆盖）。 */
export interface SeatPolicy {
  /** 连续自动判定上限：达到即强制回交（Agnes 的「连续 3 步」纪律）。 */
  maxConsecutiveAuto?: number
  /** 快路径最低置信度：低于它不走快路径。 */
  minConfidence?: number
  /** 固化所需连续一致次数（默认 3）。 */
  solidifyAfter?: number
  /** 快路径最大有效期（默认 30 天）：超过即失效，必须重新观察。 */
  maxEntryAgeMs?: number
  /** 时钟注入（测试用）。 */
  now?: () => number
}
