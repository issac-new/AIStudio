// overlay/proactivity：反事实差值预演（2026-11-14 Proactive AI 二轮 P2）。
//
// 范式来源：论文 §4.2.3 Counterfactual Reasoning——干预价值＝「行动世界与弃权世界的
// 期望结果差」（act − abstain）；同一差值兼作解释（「我避免的未来」是信任的最小载体）。
// 硬约束（论文自警）：反事实校准错误直接污染仲裁门 → 只作排序信号不作精确预测；
// 预演耗延迟与时机门冲突 → 快慢分离：预演只在 sync 批处理时做（controller 前置慢通道），
// critical 必达与无预演路径 fail-open 回 SUGGESTION_PROFILE 静态表（D10：主路径降级为 fallback）。
//
// 判定通道复用 eval/clef（问句 → P(yes)）：actBetter＝投递并采纳显著更好吗；
// abstainMiss＝保持沉默会错失值得处理的问题吗。delta＝2·P(actBetter)−1 ∈ [−1,1]。
import { Breaker, TtlCache, clefAsk, type EvalJudgeRequest } from '../eval/clef'
import { loadEvalConfig } from '../eval/types'

export interface PreviewResult {
  /** 干预差值 ∈ [−1,1]：正值=行动优于弃权；仅作排序信号（论文：不作精确预测）。 */
  delta: number
  actOutcome: string
  abstainOutcome: string
  /** 「我避免的未来」一句话解释——随干预落账呈现（信任的最小载体）。 */
  explanation: string
  confidence: 'low' | 'medium' | 'high'
}

/** 预演问句原始概率（clef 缺失/非数值按 unknown 处理；双缺＝预演失败 fail-open）。 */
export interface PreviewProbabilities {
  actBetter?: number
  abstainMiss?: number
}

/** 单候选预演输入（delivery 建议最小投影）。 */
export interface PreviewInput {
  topicKey: string
  kind: string
  target: string
  note: string
}

/** 预演问句构造（纯函数；测试锁定问句模板）。 */
export function buildPreviewQuestions(input: PreviewInput): { actBetter: string; abstainMiss: string; state: string } {
  const state = [
    `建议类型：${input.kind}`,
    `对象：${input.target}`,
    `内容：${input.note}`,
    '背景：多智能体开发平台的主动建议，接收者为看板/项目维护者；判断基于常识与建议内容本身。',
  ].join('\n')
  return {
    state,
    actBetter: '若现在把该建议投递给维护者并大概率被采纳执行，项目状态会显著优于不投递吗？（仅依据内容判断；证据不足=否）',
    abstainMiss: '若此刻保持沉默不投递该建议，会错失一个值得处理的实际问题吗？（仅依据内容判断；证据不足=否）',
  }
}

/** 概率 → 预演结果（纯函数）：双缺＝null（fail-open 由调用方回静态表）。 */
export function interpretPreview(
  p: PreviewProbabilities,
  input: PreviewInput,
): PreviewResult | null {
  if (p.actBetter === undefined) return null
  const act = p.actBetter
  const miss = p.abstainMiss
  const delta = Math.max(-1, Math.min(1, 2 * act - 1))
  // 置信：两问同向（都强）=high；一强一弱或单问=low/medium（分歧=低置信减权，防校准错误污染门）。
  let confidence: PreviewResult['confidence'] = 'low'
  if (miss !== undefined && act >= 0.7 && miss >= 0.7) confidence = 'high'
  else if (act >= 0.7 || (miss !== undefined && miss >= 0.7)) confidence = 'medium'
  const actOutcome = act >= 0.7 ? '投递并采纳的期望结果显著更好' : act <= 0.3 ? '投递收益存疑' : '收益中等'
  const abstainOutcome = miss === undefined ? '沉默代价未知（单问预演）'
    : miss >= 0.7 ? '保持沉默会错失值得处理的问题' : '沉默代价低（问题不紧迫或已被覆盖）'
  return {
    delta,
    actOutcome,
    abstainOutcome,
    explanation: `预演（P(行动更优)=${act.toFixed(2)}${miss !== undefined ? `，P(沉默错失)=${miss.toFixed(2)}` : ''}）：${input.kind}→${input.target}。${abstainOutcome}。`,
    confidence,
  }
}

/** 置信减权后的 benefit 融合（纯函数）：预演差值替换静态分，低置信向静态分回撤一半。 */
export function mergeBenefit(
  staticBenefit: number,
  preview?: PreviewResult,
): { benefit: number; source: 'static' | 'preview' } {
  if (!preview) return { benefit: staticBenefit, source: 'static' }
  const previewBenefit = (preview.delta + 1) / 2 // [−1,1] → [0,1] 与静态分同尺度
  const benefit = preview.confidence === 'high' ? previewBenefit
    : preview.confidence === 'medium' ? 0.7 * previewBenefit + 0.3 * staticBenefit
    : 0.5 * previewBenefit + 0.5 * staticBenefit
  return { benefit: Math.max(0, Math.min(1, benefit)), source: 'preview' }
}

// ── 慢通道编排（controller 前置调用；快通道 syncInterventions 读结果快照） ────

export const ANTICIPATION_PREVIEW_MAX_DEFAULT = 5

export function anticipationPreviewEnabled(): boolean {
  const v = process.env.ANTICIPATION_PREVIEW?.trim().toLowerCase()
  return v !== 'off' && v !== '0' && v !== 'false'
}

export function anticipationPreviewMax(): number {
  const n = Number(process.env.ANTICIPATION_PREVIEW_MAX?.trim())
  return Number.isInteger(n) && n >= 0 && n <= 50 ? n : ANTICIPATION_PREVIEW_MAX_DEFAULT
}

/**
 * 批量预演：对建议列表（按序）做两问 clef 判定，返回 topicKey → PreviewResult。
 * fail-open 语义：单条失败跳过（不进 Map＝调用方回静态表）；整通道不可用＝空 Map。
 * 上限 anticipationPreviewMax() 条（超出不预演——预算即取舍）。
 */
export async function previewSuggestions(
  inputs: PreviewInput[],
  deps?: { ask?: typeof clefAsk },
): Promise<Map<string, PreviewResult>> {
  const out = new Map<string, PreviewResult>()
  if (!anticipationPreviewEnabled()) return out
  if (inputs.length === 0) return out
  const limit = anticipationPreviewMax()
  const batch = inputs.slice(0, limit)
  const config = loadEvalConfig()
  const ask = deps?.ask ?? clefAsk
  const breaker = new Breaker(3, 60_000)
  const cache = new TtlCache<EvalJudgeAnswersShim>(300_000)
  await Promise.all(batch.map(async (input) => {
    if (breaker.isOpen()) return
    const q = buildPreviewQuestions(input)
    const request: EvalJudgeRequest = {
      model: config.judgeModels[0] ?? config.judgeModel,
      state: { text: q.state },
      questions: {
        actBetter: { type: 'noul', instructions: q.actBetter },
        abstainMiss: { type: 'noul', instructions: q.abstainMiss },
      },
    }
    try {
      const key = JSON.stringify(request)
      const cached = cache.get(key)
      const answers = cached ?? await ask(request, config)
      if (!cached) cache.set(key, answers)
      breaker.recordSuccess()
      const result = interpretPreview(
        { actBetter: answers.actBetter, abstainMiss: answers.abstainMiss },
        input,
      )
      if (result) out.set(input.topicKey, result)
    } catch {
      breaker.recordFailure()
    }
  }))
  return out
}

type EvalJudgeAnswersShim = { actBetter?: number; abstainMiss?: number }
