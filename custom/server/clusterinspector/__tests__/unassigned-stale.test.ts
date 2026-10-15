// card.unassigned-stale 未认领卡老化检测器（run20 r3 派单断棒实录产品化）
// 守门面：①面缺席=合法空态 ②未过阈值静默 ③秒级 created_at 归一 ④warn/high 升级
// ⑤已认领卡不报（faces 层已滤，此处防漏） ⑥detectAll 接线。
// 实录回归锚：run20 主卡 t_acd67636 ready+assignee 空 2h45m（165min）→ 应 high。
import { describe, it, expect } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll, detectUnassignedStale } from '../detectors'

function snapWith(face?: ClusterSnapshot['unassignedCards']): ClusterSnapshot {
  return {
    ts: Date.now(),
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: true, rows: [] },
    runningCards: { ok: true, cards: [] },
    federation: { ok: true, machines: [] },
    unassignedCards: face,
  } as unknown as ClusterSnapshot
}

const NOW = 1_790_000_000_000

function openCard(over: Record<string, unknown> = {}) {
  return {
    id: 't_acd67636',
    title: 'RFD-001 G2 安全评审退回修订主卡',
    status: 'ready',
    created_at: Math.floor(NOW / 1000) - 60 * 45, // 45min 前（秒级戳）
    ...over,
  }
}

describe('detectUnassignedStale（card.unassigned-stale）', () => {
  it('面缺席=合法空态静默', () => {
    expect(detectUnassignedStale(snapWith(undefined), { nowMs: NOW })).toHaveLength(0)
    expect(detectUnassignedStale(snapWith({ ok: false, cards: [] }), { nowMs: NOW })).toHaveLength(0)
  })

  it('未过阈值静默（建卡 10 分钟）', () => {
    expect(detectUnassignedStale(
      snapWith({ ok: true, cards: [openCard({ created_at: Math.floor(NOW / 1000) - 600 })] }),
      { nowMs: NOW },
    )).toHaveLength(0)
  })

  it('过阈值 warn；3× 阈值 high（实录回归：2h45m 空置）', () => {
    const warn = detectUnassignedStale(
      snapWith({ ok: true, cards: [openCard()] }), // 45min > 30min
      { nowMs: NOW },
    )
    expect(warn).toHaveLength(1)
    expect(warn[0].detector).toBe('card.unassigned-stale')
    expect(warn[0].severity).toBe('warn')

    const high = detectUnassignedStale(
      snapWith({ ok: true, cards: [openCard({ created_at: Math.floor(NOW / 1000) - 60 * 165 })] }), // 2h45m > 3×30min
      { nowMs: NOW },
    )
    expect(high[0].severity).toBe('high')
  })

  it('秒级时间戳归一：新鲜秒戳不恒报', () => {
    expect(detectUnassignedStale(
      snapWith({ ok: true, cards: [openCard({ created_at: Math.floor(NOW / 1000) - 30 })] }),
      { nowMs: NOW },
    )).toHaveLength(0)
  })

  it('detectAll 全量入口接线', () => {
    const out = detectAll(snapWith({ ok: true, cards: [openCard()] }), { nowMs: NOW })
    expect(out.some((a) => a.detector === 'card.unassigned-stale')).toBe(true)
  })
})
