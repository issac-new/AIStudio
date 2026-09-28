// overlay/resume 域：会话续接失败分档（multica §2.5/§3.1 吸收，矩阵 §3.5 P2）。
//
// multica 语义（重试按 failure_reason 分档：平台错可重试 / resume-unsafe 新会话 /
// agent_error 指数退避）：失败不是一锅端——**续接安全性决定下一步**：
// - **safe_retry**：平台错（网络/5xx）——同会话续接重试即可；
// - **new_session**：resume-unsafe（会话态损坏/上下文不一致）——强制新会话（续接会复现错）；
// - **backoff**：agent_error（模型/工具错）——指数退避重试（别打爆）。
export type ResumeClass = 'safe_retry' | 'new_session' | 'backoff'

export interface FailureFacts {
  /** 错误类别（transport/session/model/tool）。 */
  category: string
  /** 是否 resume-unsafe（multica 黑名单判定结果，由调用方给）。 */
  resumeUnsafe?: boolean
  /** 已重试次数（backoff 指数退避用）。 */
  attempts?: number
}

export interface ResumeDecision {
  cls: ResumeClass
  /** 退避毫秒（仅 backoff；2^attempts 秒封顶 60s）。 */
  backoffMs: number | null
  detail: string
}

/** 失败→分档（multica 分档语义：续接安全性优先于错误类别）。 */
export function classifyResume(facts: FailureFacts): ResumeDecision {
  // resume-unsafe 黑名单命中优先（multica：强制新会话，续接会复现错）。
  if (facts.resumeUnsafe) {
    return { cls: 'new_session', backoffMs: null, detail: 'resume-unsafe：会话态不可续接，强制新会话' }
  }
  if (facts.category === 'transport') {
    return { cls: 'safe_retry', backoffMs: null, detail: '平台错（网络/5xx）：同会话续接重试' }
  }
  if (facts.category === 'session') {
    return { cls: 'new_session', backoffMs: null, detail: '会话态错：新会话（续接风险）' }
  }
  // 模型/工具错：指数退避（multica retryDelayForAttempt 语义：2^attempts 秒封顶 60s）。
  const attempts = facts.attempts ?? 0
  return {
    cls: 'backoff',
    backoffMs: Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)),
    detail: `agent_error：指数退避重试（第 ${attempts} 次）`,
  }
}
