// card.body-empty 在办卡正文空检测器（fcd06993 配套实现）
// 守门面：①面缺席/未接线=静默 ②body 有内容（含纯空白视为空）不报
// ③在办卡 body 空报 warn 且点名 assignee ④detectAll 接线。
import { describe, it, expect } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll, detectCardBodyEmpty } from '../detectors'

function snapWith(cards?: ClusterSnapshot['runningCards']['cards']): ClusterSnapshot {
  return {
    ts: Date.now(),
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: true, rows: [] },
    runningCards: { ok: true, cards: cards ?? [] },
    federation: { ok: true, machines: [] },
  } as unknown as ClusterSnapshot
}

describe('detectCardBodyEmpty', () => {
  it('面缺席（undefined）静默', () => {
    const snap = snapWith()
    delete (snap as Partial<ClusterSnapshot>).runningCards
    expect(detectCardBodyEmpty(snap)).toEqual([])
  })

  it('未接线（ok:false）静默', () => {
    const snap = snapWith()
    snap.runningCards = { ok: false, error: 'not wired', cards: [] }
    expect(detectCardBodyEmpty(snap)).toEqual([])
  })

  it('body 有内容不报；空串/纯空白/undefined 报 warn 并点名 assignee', () => {
    const out = detectCardBodyEmpty(snapWith([
      { id: 't_ok', title: '有正文', status: 'running', assignee: 'chen', body: '按缺项清单补 D-3' },
      { id: 't_empty', title: '空正文', status: 'running', assignee: 'lin', body: '' },
      { id: 't_blank', title: '空白正文', status: 'running', assignee: 'hu', body: '   \n  ' },
      { id: 't_undef', title: '无字段', status: 'running', assignee: 'wei' },
    ]))
    expect(out).toHaveLength(3)
    for (const a of out) {
      expect(a.detector).toBe('card.body-empty')
      expect(a.severity).toBe('warn')
    }
    expect(out.map((a) => a.subject)).toEqual(['card:t_empty', 'card:t_blank', 'card:t_undef'])
    expect(out[0].summary).toContain('lin')
  })

  it('detectAll 接线（空正文卡在全局扫描中出现该检测器）', () => {
    const out = detectAll(snapWith([
      { id: 't_x', title: '空正文', status: 'running', assignee: 'chen' },
    ]))
    expect(out.some((a) => a.detector === 'card.body-empty')).toBe(true)
  })
})
