// overlay[redteam] 检测器适配（v1=S0 规则层）。
//
// 与生产 ToolResultGuard 共用同一份规则（toolresultguard/rules.ts），
// 不另写第二套正则——否则红队测的不是生产护栏。
import { computeSuspicion } from '../toolresultguard/rules'

export interface DetectionResult {
  score: number
  hits: string[]
  detected: boolean
}

export interface DetectorInfo {
  id: 's0-rules'
  zh: string
  en: string
  s1Wired: boolean
  note: string
}

export const DETECTOR_INFO: DetectorInfo = {
  id: 's0-rules',
  zh: 'S0 规则层（生产 ToolResultGuard 同源）',
  en: 'S0 rule layer (same source as ToolResultGuard)',
  s1Wired: false,
  note: 'S1 裁判需 EVAL_JUDGE_BASE_URL 与判定端在位；v1 未接线，逃逸率只代表规则层拦截能力。',
}

/** 可疑分 ≥ threshold 判拦截。 */
export function s0Detect(text: string, threshold: number): DetectionResult {
  const suspicion = computeSuspicion(text)
  return {
    score: suspicion.score,
    hits: suspicion.hits,
    detected: suspicion.score >= threshold,
  }
}
