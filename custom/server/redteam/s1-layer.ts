// overlay[redteam] S1 分层口径（纯函数，2026-10-27 活体走查抓漏后抽出）。
//
// 缺陷背景：判定端离线时 evaluate 走 fail-open，返回 verdict='PASS' 且 via='fail-open-*'。
// 若直接按 verdict 统计，同一批样本会同时计入「逃逸」与「不可用」，两个数加起来超过总数
// （首版实测 passed=8 + failOpen=7 > 8 个幸存者）。正确口径：先剔不可用，再在可用里分档。
import { s1Unavailable } from './detector'
import type { S1LayerReport, S1SurvivorVerdict } from './types'

export function summarizeS1Layer(verdicts: S1SurvivorVerdict[], evaluatedAt = Date.now()): S1LayerReport {
  const usable = verdicts.filter((v) => !s1Unavailable(v.via))
  const failOpen = verdicts.length - usable.length
  const isolated = usable.filter((v) => v.verdict === 'REWRITE' || v.verdict === 'BLOCK').length
  const confirmed = usable.filter((v) => v.verdict === 'CONFIRM').length
  const passed = usable.filter((v) => v.verdict === 'PASS').length
  const rate = (part: number): number | null => (usable.length === 0 ? null : part / usable.length)
  const available = usable.length > 0
  return {
    evaluatedAt,
    survivors: verdicts,
    isolated,
    confirmed,
    passed,
    failOpen,
    strictEscapeRate: rate(passed),
    softEscapeRate: rate(passed + confirmed),
    available,
    ...(available ? {} : { unavailableReason: '判定端不可用（TRG_BASE_URL 未起或连续失败熔断），全部 fail-open 回 S0-only' }),
  }
}
