// overlay/custom/server/harness/workbench/loop-review.ts
// 审阅结论（2026-11-26 Palantir 架构吸收轮）：纯函数，只读披露，不参与晋级判定。
// 来源：Palantir AIP Evolve 的提案视图要求同时给出验证结果、输出对比、支撑证据与置信评估；
// 本仓的晋级门此前只返回通过、阻断与告警，审阅人看不到「结论有多可信、受什么限制」。
// 纪律：置信档由固定规则推出，每条限制都指得到具体读数；不做加权评分（权重无法复核）。
import type { ProbeMetrics, Proposal, ReviewAssessment, SelectionBiasAudit } from './types'
import { composedVariant } from './loop-core'
import { evaluatorDiff } from './loop-joint-evidence'

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

/**
 * 基线与候选是否在同一评估条件下评测：先比试卷编号，再逐字段比试卷指纹与裁判指纹。
 * 任一侧缺指纹记未知，不按相同处理（历史探针没有带出指纹，推定相同没有依据）。
 */
export function evaluatorComparabilityOf(
  baseline: Pick<ProbeMetrics, 'setId' | 'evaluator'> | null | undefined,
  candidate: Pick<ProbeMetrics, 'setId' | 'evaluator'>,
): Pick<ReviewAssessment, 'evaluatorComparability' | 'evaluatorChangedFields'> {
  const changed: string[] = []
  if (baseline?.setId && candidate.setId && baseline.setId !== candidate.setId) changed.push('setId')
  const diff = evaluatorDiff(baseline?.evaluator ?? null, candidate.evaluator ?? null)
  changed.push(...diff.changed)
  if (changed.length > 0) return { evaluatorComparability: 'changed', evaluatorChangedFields: changed }
  const unknown = diff.unknown.length > 0 || !baseline?.setId || !candidate.setId
  return { evaluatorComparability: unknown ? 'unknown' : 'same', evaluatorChangedFields: [] }
}

/**
 * 审阅结论。置信档四档的规则：
 *   未知＝选中候选没有已记录的探测；
 *   不足＝读数本身不够（质量判定未知、采样少于 3 次、基线与候选的评估条件不同），任一出现即是；
 *   有限＝读数可用但验证不完整（噪声未标定、未绑定留出或回归、算力归因与反事实缺席、执行证迹缺席、
 *          评估条件无法比较、批准人与提出人相同、多候选择优有偏差风险、缺耗时读数），任一出现即是；
 *   充分＝没有任何限制。
 * 已经是阻断项的事实（质量倒退、回归失败、成本缺失）不在这里重复。
 */
export function reviewAssessment(input: {
  proposal: Proposal
  selectionBias: SelectionBiasAudit | undefined
  noiseDelta: number | null
}): ReviewAssessment {
  const { proposal, selectionBias } = input
  const noiseDelta = input.noiseDelta ?? null
  const selected = composedVariant(proposal)
  const probe = selected
    ? proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded' && p.evidence)
    : undefined
  const ev = probe?.evidence ?? null
  if (!ev) {
    return {
      confidence: 'unknown',
      evaluatorComparability: 'unknown',
      evaluatorChangedFields: [],
      strengths: [],
      limitations: ['选中候选没有已记录的探测读数，无法评估结论的可信度'],
    }
  }
  const comparability = evaluatorComparabilityOf(proposal.baseline ?? null, ev)
  // hard＝读数本身不够；soft＝读数可用但验证不完整
  const hard: string[] = []
  const soft: string[] = []
  const strengths: string[] = []

  if ((probe?.contrast?.quality ?? 'unknown') === 'unknown') hard.push('选中候选的结果层质量判定未知：结果层证据不足')
  const k = ev.k ?? 1
  if (ev.statisticallyInsufficient || k < 3) hard.push(`评测采样 k=${k}（少于 3 次）：无法区分运气与能力`)
  if (comparability.evaluatorComparability === 'changed') {
    hard.push(`基线与候选的评估条件不同（${comparability.evaluatorChangedFields.join('、')}）：两次通过率不能直接比较`)
  } else if (comparability.evaluatorComparability === 'unknown') {
    soft.push('基线与候选的评估条件无法比较：缺试卷或裁判指纹')
  } else {
    strengths.push('基线与候选在同一评估条件下评测')
  }

  if (noiseDelta == null) soft.push('噪声带未标定：增益无法与评测噪声区分')
  else strengths.push(`噪声带已标定（δ=${pct(noiseDelta)}）`)

  if (proposal.heldout) strengths.push(`已绑定密封留出读数（${proposal.heldout.n} 题，通过率 ${pct(proposal.heldout.passRate)}）`)
  else soft.push('未绑定密封留出读数：没有独立于优化集的验证数据')

  if (ev.regression) {
    if (ev.regression.failed === 0) strengths.push(`历史回归 ${ev.regression.total} 项全部通过`)
  } else {
    soft.push('未绑定历史回归运行')
  }

  // 与晋级门同一个「有意义增益」口径：噪声带未标定时看任何正增益，标定后须超过 δ
  const gain = probe?.contrast?.passAt1Delta ?? null
  const meaningful = gain != null && gain > 0 && (noiseDelta == null || gain > noiseDelta)
  if (meaningful && !ev.equalBudgetBaseline) soft.push('未绑定等预算基线：无法区分改进与额外算力')
  if (meaningful && !ev.counterfactual) soft.push('未绑定反事实变体运行：检验不了协议级捷径')
  const trace = ev.executionTrace ?? null
  if (meaningful && (!trace || trace.status !== 'observed')) soft.push('未采集到执行证迹：无法证明候选引入的机制真的运行过')
  if (trace && trace.status === 'observed' && trace.markers.length > 0 && trace.hit.length > 0) {
    strengths.push(`执行证迹：候选引入的标记在探测轨迹里命中 ${trace.hit.length}/${trace.markers.length}`)
  }

  const approver = (proposal.approval?.actor ?? '').trim()
  const creator = (proposal.createdBy ?? '').trim()
  if (approver && creator && approver === creator) soft.push('批准人与提出人是同一人：这次批准不构成独立复核')

  switch (selectionBias?.verdict) {
    case 'single_candidate':
    case 'heldout_confirms':
    case 'robust':
      strengths.push(selectionBias.note)
      break
    case 'selection_dominated':
    case 'top2_within_noise':
    case 'heldout_gap':
      soft.push(`多候选择优存在偏差风险：${selectionBias.note}`)
      break
    default:
      break
  }

  // 成本与耗时的变化此前只在候选表里；审阅结论一并写明（2026-11-27）。现行规则只在增益超出噪声带时裁决成本，不裁决耗时。
  const costDelta = probe?.contrast?.costDeltaPct ?? null
  if (costDelta != null && costDelta < 0) strengths.push(`单次调用成本相对基线下降 ${(Math.abs(costDelta) * 100).toFixed(1)}%`)
  const latencyDelta = probe?.contrast?.latencyDeltaPct ?? null
  if (latencyDelta != null && latencyDelta < 0) strengths.push(`执行耗时相对基线下降 ${(Math.abs(latencyDelta) * 100).toFixed(1)}%`)
  else if (latencyDelta != null && latencyDelta > 0) soft.push(`执行耗时相对基线上升 ${(latencyDelta * 100).toFixed(1)}%：现行规则不拦耗时回退`)
  else if (latencyDelta == null) soft.push('没有耗时读数：无法判断执行时间的变化')

  const confidence = hard.length > 0 ? 'insufficient' : soft.length > 0 ? 'limited' : 'sufficient'
  return { confidence, ...comparability, strengths, limitations: [...hard, ...soft] }
}
