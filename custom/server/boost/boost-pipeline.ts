// overlay/boost 域：/boost 多代理推理管线（antigravity §四 P2-11 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（/boost 多代理推理管线：并行子任务+断言回灌+多轮独立验证）：
// 难题**多路并行推理**——N 个候选方案并行出、**断言回灌**（每路的断言喂回聚合）、
// **多轮独立验证**（候选交叉验证去伪）。衔接 swarm-fanout（并行派发）与 review
// （独立验证轮）：本层=管线编排判定纯函数。
export interface BoostCandidate {
  candidateId: string
  answer: string
  /** 自带断言（回灌素材）。 */
  assertions: string[]
}

export interface BoostResult {
  /** 胜出候选（断言交叉验证后一致数最高）。 */
  winner: string | null
  /** 回灌断言全集（各路断言聚合——多轮验证素材）。 */
  mergedAssertions: string[]
  verified: boolean
}

/** 多路候选→断言回灌→一致数胜出（antigravity /boost 管线语义）。 */
export function boostPipeline(candidates: readonly BoostCandidate[]): BoostResult {
  if (candidates.length === 0) return { winner: null, mergedAssertions: [], verified: false }
  // 断言回灌：全路断言聚合（去重）。
  const mergedAssertions = [...new Set(candidates.flatMap((c) => c.assertions))]
  // 一致数=答案相同路数（独立验证的最简口径：多路一致即可信）。
  const counts = new Map<string, number>()
  for (const c of candidates) counts.set(c.answer, (counts.get(c.answer) ?? 0) + 1)
  const [topAnswer, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const winner = candidates.find((c) => c.answer === topAnswer)!.candidateId
  // 多轮独立验证口径：多数一致（>1 且过半）才算 verified。
  return { winner, mergedAssertions, verified: topCount > 1 && topCount > candidates.length / 2 }
}
