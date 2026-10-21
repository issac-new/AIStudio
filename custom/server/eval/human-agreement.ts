// overlay[eval] 裁判×人工一致率校准（2026-10-21 三号调研落地）。
//
// 来源：《LLM 当裁判，到底靠不靠谱？》——精确匹配一致率平均虚高 38.6 个百分点
//（kappa 通胀），裁判验收必须看 Cohen's κ 而非裸一致率；《美团 CatPaw》——人机
// 一致率是裁判 KPI，换裁判模型/提示词须重校准；《OpenAI Evals 拆解》——线上
// 抽检人工标注回流为黄金集。现状盘点：recordHumanVerdict 已把人工改判落库
//（previousValue=覆盖前机判基线，只记第一次不漂移），但没有聚合层回答「这个
// 裁判与人工到底多一致」——本模块补这一层，纯函数，读 attempts 即算。
import type { Attempt } from './types'

export interface AgreementPair {
  key: string
  /** 覆盖前的机判（previousValue）。 */
  machine: 'yes' | 'no'
  /** 人工改判值。 */
  human: 'yes' | 'no'
}

export interface JudgeHumanAgreement {
  /** 人工改判在案的判词总数。 */
  humanOverridden: number
  /** 机判为 unknown 的改判（不进 kappa 分母，单独披露）。 */
  machineUnknown: number
  /** 进 kappa 计算的样本数。 */
  usableCount: number
  /** 裸一致率（κ 的参照面，两者差距=kappa 通胀幅度）。 */
  agreementRate: number | null
  /** Cohen's κ（机会校正后一致率；usableCount<2 或单边退化时 null）。 */
  cohenKappa: number | null
  confusion: { bothYes: number; bothNo: number; machineYesHumanNo: number; machineNoHumanYes: number }
  /** 机判通过、人工否决（假通过——比假失败更危险，单独点名）。 */
  falsePassSamples: string[]
  /** 机判否决、人工通过（假失败——误杀面）。 */
  falseFailSamples: string[]
  /** κ 解读档位（参照惯例：≥0.8 几乎完美 / ≥0.6 可观 / ≥0.4 中等 / <0.4 弱）。 */
  band: 'almost_perfect' | 'substantial' | 'moderate' | 'fair_or_less' | 'insufficient_data' | 'degenerate'
}

/** 从 run 的 attempts 收集（机判, 人工）配对——只认 source=human 且有基线的判词。 */
export function collectAgreementPairs(attempts: Attempt[]): { pairs: AgreementPair[]; machineUnknown: number } {
  const pairs: AgreementPair[] = []
  let machineUnknown = 0
  for (const attempt of attempts) {
    for (const v of attempt.verdicts) {
      if (v.source !== 'human') continue
      const key = `${attempt.taskId}#${attempt.sampleIdx}@${v.assertionId}`
      if (v.previousValue === undefined) continue
      if (v.previousValue === 'unknown') {
        machineUnknown += 1
        continue
      }
      pairs.push({ key, machine: v.previousValue, human: v.value === 'yes' ? 'yes' : v.value === 'no' ? 'no' : v.previousValue })
    }
  }
  return { pairs, machineUnknown }
}

/** Cohen's κ（两评级 × 两类目）；退化（分母 0 或期望一致=1）返回 null。 */
export function cohenKappa(pairs: AgreementPair[]): number | null {
  const n = pairs.length
  if (n < 2) return null
  const yes = pairs.filter((p) => p.machine === 'yes').length
  const humanYes = pairs.filter((p) => p.human === 'yes').length
  const bothYes = pairs.filter((p) => p.machine === 'yes' && p.human === 'yes').length
  const bothNo = pairs.filter((p) => p.machine === 'no' && p.human === 'no').length
  const po = (bothYes + bothNo) / n
  const pe = (yes / n) * (humanYes / n) + ((n - yes) / n) * ((n - humanYes) / n)
  if (pe >= 1 - 1e-9) return null // 单边退化：全体同一类目，κ 无定义
  return (po - pe) / (1 - pe)
}

export function kappaBand(kappa: number | null, usableCount: number): JudgeHumanAgreement['band'] {
  if (usableCount < 2 || kappa === null) return usableCount === 0 ? 'insufficient_data' : 'degenerate'
  if (kappa >= 0.8) return 'almost_perfect'
  if (kappa >= 0.6) return 'substantial'
  if (kappa >= 0.4) return 'moderate'
  return 'fair_or_less'
}

/** 一次性求值：配对 → 裸一致率 + κ + 混淆 + 假通过/假失败样本清单。 */
export function judgeHumanAgreement(attempts: Attempt[]): JudgeHumanAgreement {
  const { pairs, machineUnknown } = collectAgreementPairs(attempts)
  const usableCount = pairs.length
  const bothYes = pairs.filter((p) => p.machine === 'yes' && p.human === 'yes').length
  const bothNo = pairs.filter((p) => p.machine === 'no' && p.human === 'no').length
  const fp = pairs.filter((p) => p.machine === 'yes' && p.human === 'no')
  const ff = pairs.filter((p) => p.machine === 'no' && p.human === 'yes')
  const kappa = cohenKappa(pairs)
  return {
    humanOverridden: usableCount + machineUnknown,
    machineUnknown,
    usableCount,
    agreementRate: usableCount ? (bothYes + bothNo) / usableCount : null,
    cohenKappa: kappa,
    confusion: { bothYes, bothNo, machineYesHumanNo: fp.length, machineNoHumanYes: ff.length },
    falsePassSamples: fp.map((p) => p.key),
    falseFailSamples: ff.map((p) => p.key),
    band: kappaBand(kappa, usableCount),
  }
}
