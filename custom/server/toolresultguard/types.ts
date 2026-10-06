// overlay[toolresultguard] P1a · 类型面（2026-10-06 五文轮，文 5 安全围栏设计）。
//
// 定位：输入侧（stage=input）与工具结果回注侧（stage=tool_result）两拦截点的
// 判定内核。分层沿用文 5：S0 确定性规则（正则可疑度预筛）→ S1 判别式快判
// （本地 Clef，SystemOne 协议）→ 四态裁决（PASS/REWRITE/CONFIRM/BLOCK）。
// S2 灰区 LLM 复核不在 v1（P1b 及实测延迟数据后再定，如实声明）。

/** 判定发生在哪条进入路径上。 */
export type GuardStage = 'input' | 'tool_result'

/**
 * 四态裁决（文 5 §3.4）。
 * - input 侧消费 blocked 布尔（BLOCK=拒跑，其余放行）。
 * - tool_result 侧消费动作：REWRITE=隔离改写后回注，CONFIRM=原文回注加警示标记，
 *   PASS=原样，BLOCK=v1 并入 REWRITE（隔离即最重处置，不再有"拒注整个结果"的
 *   更重档——工具结果不能整个吞掉，agent 需要知道工具返回了东西）。
 */
export type GuardVerdict = 'PASS' | 'REWRITE' | 'CONFIRM' | 'BLOCK'

/** S1 快判的问句答案（SystemOne 响应 answers 字段的子集，结构化提取）。 */
export interface JudgeAnswers {
  /** is_attack（noul）的 p(true) ∈ [0,1] */
  attackP: number
  /** attack_category（choice）命中项，无则 null */
  category: string | null
  /** severity（score）期望值（0 起，按档数归一） */
  severity: number
}

/** 一次判定的完整结论（含留痕所需全部字段）。 */
export interface GuardDecision {
  stage: GuardStage
  verdict: GuardVerdict
  /** 判定路径：s0-clean / cache / s1 / fail-open-error / fail-open-breaker / disabled */
  via: string
  /** S0 可疑度（命中规则权重和） */
  score0: number
  /** S1 p(attack)；未走 S1 时为 null */
  attackP: number | null
  category: string | null
  severity: number | null
  /** 仅 REWRITE：隔离后替换内容 */
  rewrittenContent: string | null
  /** 仅 CONFIRM：回注时前置的警示行 */
  warningLine: string | null
  reason: string
  latencyMs: number | null
  contentSha: string
}

/** 运行配置（env 可覆盖；测试可注入）。默认值即文档 §P1a 的三条纪律。 */
export interface GuardConfig {
  /** 总开关。默认 false（S3 纪律：新面默认关，装机零行为变化） */
  enabled: boolean
  /** S1 端点（本地 clef_mlx.py serve） */
  baseUrl: string
  model: string
  /** S1 超时（fail-open 上限） */
  timeoutMs: number
  /** 高置信攻击阈值（≥ 即 REWRITE/BLOCK） */
  tauHigh: number
  /** 高置信安全阈值（≤ 即 PASS） */
  tauLow: number
  /** S0 可疑度门（低于它不付 S1 延迟） */
  s0Gate: number
  /** state 内容截断（字符；~4k token 纪律） */
  maxStateChars: number
  /** 判定缓存 TTL */
  cacheTtlMs: number
  /** 连续失败 N 次后熔断窗口 */
  breakerThreshold: number
  breakerCooldownMs: number
}

export const DEFAULT_CONFIG: GuardConfig = {
  enabled: false,
  baseUrl: 'http://127.0.0.1:8000',
  // 主力 = clef-flash-4bit（9B，M1 Pro 实测 287tok 3.3-3.6s / 守卫 schema 646tok 8.8s）；
  // clef-4bit 27B 为备件（13-163s，仅异步低频场景手动切）
  model: 'clef-flash-4bit',
  // 2026-10-06 定 12000：flash 上守卫 schema 实测 8.8s，3s 会全部超时 fail-open；
  // 12s 让 S1 真正可达，仅 S0 命中的可疑内容才付这个延迟
  timeoutMs: 12000,
  tauHigh: 0.85,
  tauLow: 0.25,
  s0Gate: 1,
  maxStateChars: 6000,
  cacheTtlMs: 10 * 60_000,
  breakerThreshold: 5,
  breakerCooldownMs: 120_000,
}
