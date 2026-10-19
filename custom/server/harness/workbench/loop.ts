// overlay/custom/server/harness/workbench/loop.ts
// 改进闭环的纯函数层：摘要、diff、无真值行为对比、晋级门禁。
// 这里不读盘、不写库，便于单测覆盖全部分支；副作用在 service/apply。
import { createHash } from 'crypto'
import type {
  BehaviorContrast, Champion, GateBlocker, ProbeMetrics, PromotionGateReport,
  Proposal, QualityVerdict, Variant,
} from './types'

export const MAX_VARIANTS = 8
export const DEFAULT_BUDGET_CAP_USD = 5

/**
 * 源文 core/context.py:419 的防泄漏标记：harness/经验文件不得携带评测器自己的判词，
 * 否则它会被当成"证据"喂给后续任务，等于把答案写进提示词。逐字对齐。
 */
export const GRADER_VERDICT_MARKERS: readonly string[] = [
  'deterministic_eval_summary',
  'deterministic_eval_result',
  'judge_scope_and_deterministic_status',
  'Judge findings on the rendered result',
  '"passed_count"',
  '"pass_rate"',
  '"test_pass_rate"',
]

export function findGraderMarkers(content: string): string[] {
  const body = String(content ?? '')
  return GRADER_VERDICT_MARKERS.filter((m) => body.includes(m))
}

/** 源文还会扫文件路径：文件名里带判词 marker 同样视为泄漏。 marker 里带引号的按去引号后匹配。 */
export function findGraderMarkersInPath(rel: string): string[] {
  const body = String(rel ?? '')
  return GRADER_VERDICT_MARKERS.filter((m) => {
    const token = m.replace(/^"|"$/g, '')
    return body.includes(m) || body.includes(token)
  })
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function variantSetDigest(variants: Variant[]): string {
  const parts = variants
    .map((v) => `${v.id}:${v.digest}`)
    .sort()
    .join('\n')
  return sha256(parts)
}

/** 行级摘要：只数增删，不生成完整 patch（完整 diff 由前端按内容自行展示）。 */
export function diffSummary(base: string, next: string): Variant['diffSummary'] {
  const a = base.split('\n')
  const b = next.split('\n')
  // LCS 表在 2k 行内可用；超长按逐行等位比较，避免治理页被大文件拖死。
  if (a.length * b.length > 4_000_000) {
    let same = 0
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i += 1) if (a[i] === b[i]) same += 1
    return { added: Math.max(0, b.length - same), removed: Math.max(0, a.length - same), unchanged: same }
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const unchanged = dp[a.length][b.length]
  return {
    added: Math.max(0, b.length - unchanged),
    removed: Math.max(0, a.length - unchanged),
    unchanged,
  }
}

function pctDelta(base: number | null | undefined, cand: number | null | undefined): number | null {
  if (base == null || cand == null || base === 0) return null
  return (cand - base) / base
}

function numDelta(base: number | null | undefined, cand: number | null | undefined): number | null {
  if (base == null || cand == null) return null
  return cand - base
}

/**
 * 行为对比（源文：不依赖标准答案，用执行差异）。
 * 质量判定只在结果层证据充足时给 improved/regressed/neutral；否则 unknown。
 * 过程层读数（Token/成本/步数/时延）只描述差异，不单独宣称变好。
 */
export function behaviorContrast(base: ProbeMetrics, cand: ProbeMetrics): BehaviorContrast {
  const reasons: string[] = []
  const regressionFailed = cand.regression ? cand.regression.failed : null
  let quality: QualityVerdict = 'unknown'

  if (cand.riskVeto) {
    quality = 'regressed'
    reasons.push('候选运行触发风险一票否决')
  } else if (regressionFailed != null && regressionFailed > 0) {
    quality = 'regressed'
    reasons.push(`历史回归失败 ${regressionFailed} 项`)
  } else if (!cand.judgeOnline) {
    quality = 'unknown'
    reasons.push('判定端离线，结果层不可用')
  } else if (cand.unknownRatio != null && cand.unknownRatio > 0.5) {
    quality = 'unknown'
    reasons.push(`未知判词占比 ${(cand.unknownRatio * 100).toFixed(0)}%，结果层不足以判定`)
  } else {
    const baseRate = base.passAt1 ?? base.passAtK
    const candRate = cand.passAt1 ?? cand.passAtK
    if (baseRate == null || candRate == null) {
      quality = 'unknown'
      reasons.push('基线或候选缺少通过率，无法判定质量')
    } else {
      const delta = candRate - baseRate
      if (delta > 0.01) {
        quality = 'improved'
        reasons.push(`通过率提升 ${(delta * 100).toFixed(1)} 个百分点`)
      } else if (delta < -0.01) {
        quality = 'regressed'
        reasons.push(`通过率下降 ${(Math.abs(delta) * 100).toFixed(1)} 个百分点`)
      } else {
        quality = 'neutral'
        reasons.push('通过率与基线持平')
      }
    }
  }

  return {
    quality,
    reasons,
    passAt1Delta: numDelta(base.passAt1, cand.passAt1),
    passAtKDelta: numDelta(base.passAtK, cand.passAtK),
    resultPassRateDelta: numDelta(base.resultPassRate, cand.resultPassRate),
    trajectoryPassRateDelta: numDelta(base.trajectoryPassRate, cand.trajectoryPassRate),
    unknownRatioDelta: numDelta(base.unknownRatio, cand.unknownRatio),
    tokenDeltaPct: pctDelta(base.tokens, cand.tokens),
    costDeltaPct: pctDelta(base.costUsd, cand.costUsd),
    stepDeltaPct: pctDelta(base.steps, cand.steps),
    latencyDeltaPct: pctDelta(base.latencyMs, cand.latencyMs),
    regressionFailed,
  }
}

/**
 * 候选多样性（源文 tree.diversity）：逐行 Jaccard。K 个候选塌成同一份内容时，
 * 并行探索等于花 K 份钱只试了一种改法——必须在晋级前提示。
 */
export function candidateDiversity(variants: Variant[]): { n: number; nDistinct: number; meanLineJaccard: number } {
  const n = variants.length
  const nDistinct = new Set(variants.map((v) => v.digest)).size
  if (n < 2) return { n, nDistinct, meanLineJaccard: 1 }
  const sets = variants.map((v) => new Set(v.content.split('\n').filter((line) => line.trim()).map((line) => line.trim())))
  const sims: number[] = []
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = sets[i]
      const b = sets[j]
      const union = new Set([...a, ...b])
      let inter = 0
      for (const line of a) if (b.has(line)) inter += 1
      sims.push(union.size === 0 ? 1 : inter / union.size)
    }
  }
  return { n, nDistinct, meanLineJaccard: Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4)) }
}

/** 组合选中的候选：variantId 明确选择；合并内容必须与某个候选摘要一致（否则无探测证据）。 */
export function composedVariant(proposal: Proposal): Variant | null {
  const c = proposal.composition
  if (!c) return null
  if (c.variantId) return proposal.variants.find((v) => v.id === c.variantId) ?? null
  if (c.mergedContent != null) {
    const digest = sha256(c.mergedContent)
    return proposal.variants.find((v) => v.digest === digest) ?? null
  }
  return null
}

export function probeCost(proposal: Proposal): { total: number; complete: boolean; missing: string[] } {
  let total = 0
  const missing: string[] = []
  for (const probe of proposal.probes) {
    if (probe.status !== 'recorded' || !probe.evidence) {
      missing.push(probe.id)
      continue
    }
    if (probe.evidence.costUsd == null) {
      missing.push(probe.id)
      continue
    }
    total += probe.evidence.costUsd
  }
  return { total, complete: missing.length === 0 && proposal.probes.length > 0, missing }
}

export interface PromotionGateInput {
  proposal: Proposal
  currentChampion: Champion | null
  applyRequested: boolean
  applyEnvEnabled: boolean
  targetDigestNow?: string | null
  targetExists?: boolean
}

/** 晋级门禁：缺证据不放行（源文「回归」与「--max-usd」的硬约束）。 */
export function evaluatePromotion(input: PromotionGateInput): PromotionGateReport {
  const { proposal } = input
  const blockers: GateBlocker[] = []
  const warnings: GateBlocker[] = []

  if (proposal.status !== 'composed') {
    blockers.push({ code: 'not_composed', message: '提案尚未完成组合（compose）' })
  }

  if (!proposal.approval) {
    blockers.push({ code: 'approval_missing', message: '缺少人工批准' })
  } else if (proposal.approval.decision !== 'approved') {
    blockers.push({ code: 'approval_rejected', message: '提案已被驳回' })
  } else if (proposal.approval.variantSetDigest !== variantSetDigest(proposal.variants)) {
    blockers.push({ code: 'approval_stale', message: '批准后候选集合发生变化，批准已失效' })
  }

  const selected = composedVariant(proposal)
  if (!selected) {
    blockers.push({ code: 'composition_unprobed', message: '组合结果没有对应的候选探测证据' })
  } else {
    const probe = proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded')
    if (!probe || !probe.evidence) {
      blockers.push({ code: 'composition_unprobed', message: '选中的候选缺少已记录的探测' })
    } else {
      const contrast = probe.contrast
      if (!contrast || contrast.quality === 'unknown') {
        warnings.push({ code: 'quality_unknown', message: '选中候选的结果层证据不足，请人工复核' })
      } else if (contrast.quality === 'regressed') {
        blockers.push({ code: 'quality_regressed', message: '选中候选相对基线出现倒退' })
      }
      if (!probe.evidence.regression) {
        blockers.push({ code: 'regression_missing', message: '选中候选未绑定历史回归运行（回归样本库）' })
      } else if (probe.evidence.regression.failed > 0) {
        blockers.push({
          code: 'regression_failed',
          message: `选中候选的历史回归失败 ${probe.evidence.regression.failed} 项`,
        })
      }
      if (probe.evidence.statisticallyInsufficient) {
        warnings.push({ code: 'statistical_insufficient', message: '评测采样 k<2，统计上不足' })
      }
    }
  }

  const missingProbe = proposal.variants.filter((v) => !proposal.probes.some((p) => p.variantId === v.id && p.status === 'recorded'))
  if (missingProbe.length > 0) {
    warnings.push({
      code: 'probes_incomplete',
      message: `${missingProbe.length} 个候选尚未绑定真实评测运行（非选中候选可缺失）`,
    })
  }

  const selectedProbeForCost = selected ? proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded') : null
  if (selectedProbeForCost?.evidence?.costUsd == null) {
    blockers.push({ code: 'cost_missing', message: '选中候选的探测缺少成本读数' })
  } else {
    const cost = probeCost(proposal)
    if (cost.total > proposal.budgetCapUsd) {
      blockers.push({
        code: 'budget_exceeded',
        message: `探测总成本 ${cost.total.toFixed(2)} 超提案上限 ${proposal.budgetCapUsd.toFixed(2)}`,
      })
    }
  }

  const champion = input.currentChampion
  if (champion && champion.proposalId !== proposal.id && champion.promotedAt > proposal.createdAt) {
    blockers.push({ code: 'champion_drift', message: '该面已有更新的冠军，请基于新基线重开提案' })
  }

  const diversity = candidateDiversity(proposal.variants)
  if (proposal.mode === 'parallel' && proposal.variants.length < 2) {
    warnings.push({ code: 'parallel_single_candidate', message: '并行探索只有 1 个候选，等价单步，不构成搜索' })
  }
  if (proposal.variants.length > 1 && (diversity.nDistinct < proposal.variants.length || diversity.meanLineJaccard > 0.9)) {
    warnings.push({
      code: 'candidate_collapse',
      message: `候选取样塌缩（去重后 ${diversity.nDistinct}/${proposal.variants.length}，逐行相似度 ${(diversity.meanLineJaccard * 100).toFixed(0)}%），探索预算可能被浪费`,
    })
  }

  if (input.applyRequested) {
    const surfaceManaged = ['system_prompt', 'skills'].includes(proposal.surfaceKey)
    if (!surfaceManaged) {
      blockers.push({ code: 'surface_not_managed', message: '该面为建议模式，不支持直接写盘' })
    } else if (!input.applyEnvEnabled) {
      blockers.push({ code: 'apply_env_disabled', message: '写盘未启用：需设置 HARNESS2_APPLY=1' })
    } else if (!proposal.targetPath) {
      blockers.push({ code: 'target_missing', message: '提案未指定目标文件' })
    } else if (input.targetExists === false) {
      blockers.push({ code: 'target_missing', message: '目标文件不存在（不创建新文件）' })
    } else if (input.targetDigestNow != null && proposal.base && input.targetDigestNow !== proposal.base.digest) {
      blockers.push({ code: 'target_drift', message: '目标文件在提案后被外部修改，写盘会覆盖他人改动' })
    }
  }

  return { ok: blockers.length === 0, blockers, warnings }
}

/** 提案是否已具备提交条件（服务层用；纯函数便于测试）。 */
export function submitReadiness(proposal: Proposal): GateBlocker[] {
  const blockers: GateBlocker[] = []
  if (!proposal.title.trim()) blockers.push({ code: 'title_missing', message: '缺少标题' })
  if (!proposal.hypothesis.trim()) blockers.push({ code: 'hypothesis_missing', message: '缺少改进假设' })
  if (proposal.variants.length === 0) blockers.push({ code: 'variants_missing', message: '至少需要一个候选修改' })
  if (proposal.evidenceRefs.length === 0) blockers.push({ code: 'evidence_missing', message: '至少需要一条证据引用（任务/审计/评测运行）' })
  if (!proposal.baseline) blockers.push({ code: 'baseline_missing', message: '缺少基线评测运行' })
  return blockers
}
