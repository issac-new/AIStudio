// review.fail-stall 复审环老化检测器（run20 22:34 复审链断棒实录产品化）
// 守门面：①缺席面=合法空态 ②未过阈值静默 ③秒级时间戳归一（防 blocked-stale
// 同型的秒/毫秒错位恒报——run20 实录回归锚）④阈值 warn/2× high 升级
// ⑤detectAll 全量入口接线（防漏接线空转）。
import { describe, it, expect } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll, detectReviewFailStall } from '../detectors'

function snapWith(face?: ClusterSnapshot['failedVerdictCards']): ClusterSnapshot {
  return {
    ts: Date.now(),
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: true, rows: [] },
    runningCards: { ok: true, cards: [] },
    federation: { ok: true, machines: [] },
    failedVerdictCards: face,
  } as unknown as ClusterSnapshot
}

const NOW = 1_790_000_000_000

function failCard(over: Record<string, unknown> = {}) {
  return {
    id: 't_f5cc53c5',
    assignee: 'secops-auditor',
    title: 'RFD-001 安全评审',
    status: 'done',
    result: 'SECURITY-GATE-FAIL（附缺项）',
    // 卡表时间戳=epoch 秒（10 位）——run20 实测形态
    updated_at: Math.floor(NOW / 1000) - 60 * 60 * 3,
    ...over,
  }
}

describe('detectReviewFailStall（review.fail-stall）', () => {
  it('面缺席=合法空态静默', () => {
    expect(detectReviewFailStall(snapWith(undefined), { nowMs: NOW })).toHaveLength(0)
    expect(detectReviewFailStall(snapWith({ ok: false, cards: [] }), { nowMs: NOW })).toHaveLength(0)
  })

  it('未过阈值静默（刚判 FAIL 1 小时）', () => {
    const snap = snapWith({
      ok: true,
      cards: [failCard({ updated_at: Math.floor(NOW / 1000) - 3_600 })],
    })
    expect(detectReviewFailStall(snap, { nowMs: NOW })).toHaveLength(0)
  })

  it('秒级时间戳归一：新鲜秒戳不恒报（回归锚——错位会把 1970 年当更新时间）', () => {
    const snap = snapWith({
      ok: true,
      cards: [failCard({ updated_at: Math.floor(NOW / 1000) - 30 })],
    })
    expect(detectReviewFailStall(snap, { nowMs: NOW })).toHaveLength(0)
  })

  it('过阈值=warn、2× 阈值=high', () => {
    const warn = detectReviewFailStall(
      snapWith({ ok: true, cards: [failCard()] }), // 3h 静默 > 2h 阈值
      { nowMs: NOW },
    )
    expect(warn).toHaveLength(1)
    expect(warn[0].detector).toBe('review.fail-stall')
    expect(warn[0].severity).toBe('warn')
    expect(warn[0].subject).toBe('card:t_f5cc53c5')

    const high = detectReviewFailStall(
      snapWith({ ok: true, cards: [failCard({ updated_at: Math.floor(NOW / 1000) - 60 * 60 * 5 })] }), // 5h > 2×2h
      { nowMs: NOW },
    )
    expect(high[0].severity).toBe('high')
  })

  it('detectAll 全量入口接线（防漏接线空转）', () => {
    const out = detectAll(
      snapWith({ ok: true, cards: [failCard()] }),
      { nowMs: NOW },
    )
    expect(out.some((a) => a.detector === 'review.fail-stall')).toBe(true)
  })
})
