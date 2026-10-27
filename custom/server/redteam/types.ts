// overlay[redteam] 红队域类型（百度评测范式轮 §8：以攻促防的算法化）。
//
// v1 定位：离线、确定、可复现的攻击面体检。检测器=S0 规则层（与生产
// ToolResultGuard 同一事实源）；S1 裁判未接线时如实声明，不冒充纵深。

export type AttackCategory =
  | 'A1_direct_override'
  | 'A2_roleplay'
  | 'A3_encoding'
  | 'A4_grooming'
  | 'A5_indirect'
  | 'A6_tool_abuse'
  | 'A7_prompt_leak'
  | 'A8_harmful'
  | 'benign'

export interface AttackSeed {
  id: string
  category: AttackCategory
  /** 攻击向量一句话说明（产品面展示用）。 */
  vector: string
  text: string
  /** 良性难负例：不参与进化，只计误报率。 */
  benign?: boolean
}

export type MutationOperator =
  | 'base64_wrap'
  | 'hex_wrap'
  | 'rot13_wrap'
  | 'unicode_escape'
  | 'zero_width'
  | 'homoglyph'
  | 'leet'
  | 'split_tokens'
  | 'html_comment_nbsp'
  | 'newline_split'
  | 'roleplay_wrap'
  | 'fake_system'

export interface RedteamConfig {
  /** 进化代数（0 表示只跑语料本体）。 */
  generations: number
  /** 每代个体数（不含语料本体）。 */
  population: number
  /** S0 拦截阈值：可疑分 ≥ threshold 判拦截。 */
  threshold: number
  /** 确定性种子：同种子同报告。 */
  seed: number
}

export interface RedteamVariant {
  id: string
  seedId: string
  category: AttackCategory
  generation: number
  /** null=语料本体；否则为产生该个体的算子。 */
  operator: MutationOperator | null
  parentId: string | null
  /** 算子链（父代链路 + 当前算子）。 */
  lineage: string[]
  /** 展示用截断文本（≤240 字符）。 */
  preview: string
  /** 完整文本指纹（去重/复现用，不回原值）。 */
  sha: string
  score: number
  hits: string[]
  detected: boolean
}

/** S1 分层复评：单条 S0 幸存者过 S1 裁判的结论（原文不入账，preview 指纹即可复核）。 */
export interface S1SurvivorVerdict {
  id: string
  preview: string
  via: string
  verdict: 'PASS' | 'REWRITE' | 'CONFIRM' | 'BLOCK' | null
  attackP: number | null
  category: string | null
  severity: number | null
}

/**
 * S1 分层报告（挂账清偿：红队 S1 裁判接线）。
 * 口径：isolated=REWRITE/BLOCK（重处置拦截）；confirmed=CONFIRM（灰区放行+警示）；
 * passed=PASS（完全逃逸）；failOpen=判定端不可用（不计入逃逸率分母，如实披露）。
 * strictEscapeRate=passed/可用；softEscapeRate=(passed+confirmed)/可用。
 */
export interface S1LayerReport {
  evaluatedAt: number
  survivors: S1SurvivorVerdict[]
  isolated: number
  confirmed: number
  passed: number
  failOpen: number
  strictEscapeRate: number | null
  softEscapeRate: number | null
  available: boolean
  unavailableReason?: string
}

export interface RedteamRun {
  id: string
  createdAt: number
  config: RedteamConfig
  detector: 's0-rules'
  s1Wired: boolean
  /** S1 分层复评（POST /runs/:id/s1 按需附上；未复评的旧 run 无此字段）。 */
  s1?: S1LayerReport
  totals: {
    evaluated: number
    detected: number
    evaded: number
    evasionRate: number | null
  }
  benign: {
    total: number
    flagged: number
    falsePositiveRate: number | null
    flaggedSamples: Array<{ seedId: string; preview: string; hits: string[] }>
  }
  byCategory: Array<{ category: AttackCategory; total: number; detected: number; evasionRate: number | null }>
  byOperator: Array<{ operator: MutationOperator | 'seed'; total: number; detected: number; evasionRate: number | null }>
  byGeneration: Array<{ generation: number; evaluated: number; detected: number; evasionRate: number | null; bestScore: number | null }>
  survivors: RedteamVariant[]
  notes: string[]
}

export interface RedteamRunSummary {
  id: string
  createdAt: number
  config: RedteamConfig
  totals: RedteamRun['totals']
  benign: Pick<RedteamRun['benign'], 'total' | 'flagged' | 'falsePositiveRate'>
}
