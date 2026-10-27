// overlay[redteam] 检测器适配（v1=S0 规则层；S1 裁判接线=2026-10-27 挂账清偿）。
//
// S0 与生产 ToolResultGuard 共用同一份规则（toolresultguard/rules.ts），
// 不另写第二套正则——否则红队测的不是生产护栏。
// S1 同理复用 toolresultguard 判定链（evaluate：S0 预筛→缓存→熔断→clef 判定，
// TRG_* env 配置）——红队逃逸率由此具备 S0/S0+S1 分层口径；判定端不可用
// fail-open（via=fail-open-*，如实计入不可用桶，不冒充检出）。
import { computeSuspicion } from '../toolresultguard/rules'
import { evaluate, loadConfig } from '../toolresultguard'
import type { EvaluateDeps } from '../toolresultguard/decide'

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
  zh: 'S0 规则层（生产 ToolResultGuard 同源）＋S1 裁判分层复评',
  en: 'S0 rule layer (same source as ToolResultGuard) + S1 judge layered re-eval',
  s1Wired: true,
  note: 'S1 裁判复用 toolresultguard 判定链（TRG_* env，默认 http://127.0.0.1:8000）：'
    + 'judge 不可用即 fail-open 回 S0-only，逃逸率按层如实分层（POST /runs/:id/s1）。',
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

/** S1 单条分层复评结论（attackP/category/severity 来自判定端；via=fail-open-* 即不可用）。 */
export interface S1Detection {
  via: string
  verdict: 'PASS' | 'REWRITE' | 'CONFIRM' | 'BLOCK' | null
  attackP: number | null
  category: string | null
  severity: number | null
}

/**
 * S1 裁判复评（judge 链=toolresultguard 同源生产护栏）。deps 供测试注入 judge；
 * 判定端不可用/超时/熔断由 evaluate 内部 fail-open（via 如实标注，不抛）。
 */
export async function s1Evaluate(text: string, deps?: Partial<EvaluateDeps>): Promise<S1Detection> {
  const config = loadConfig({ enabled: true })
  const decision = await evaluate(
    'tool_result',
    text,
    { toolName: 'redteam.s1', source: 'redteam' },
    { config, ...deps },
  )
  return {
    via: decision.via,
    verdict: decision.verdict,
    attackP: decision.attackP,
    category: decision.category,
    severity: decision.severity,
  }
}

/** via 路径是否属于「判定端不可用」（fail-open/disabled/breaker）——分层账不可用桶。 */
export function s1Unavailable(via: string): boolean {
  return via.startsWith('fail-open') || via === 'disabled'
}
