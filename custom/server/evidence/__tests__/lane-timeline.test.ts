// 泳道履历时间线守门（routa：时序/交接 label/小结计数）。
import { describe, it, expect } from 'vitest'
import { laneTimeline, laneSummary, type LaneEvent } from '../lane-timeline'

const ev = (over: Partial<LaneEvent> = {}): LaneEvent => ({
  laneId: 'L1', kind: 'session', ref: 's1', at: 100, ...over,
})

describe('laneTimeline（时序正序+label）', () => {
  it('按 at 正序；handoff label 带去向', () => {
    const rows = laneTimeline([
      ev({ at: 200, ref: 's2' }),
      ev({ at: 100 }),
      ev({ kind: 'handoff', ref: 'h1', peerLane: 'L2', at: 150 }),
    ])
    expect(rows.map((r) => r.at)).toEqual([100, 150, 200])
    expect(rows[1].label).toBe('L1 → L2 (h1)')
    expect(rows[0].label).toBe('L1 session s1')
  })
})

describe('laneSummary（泳道小结）', () => {
  it('会话数/出向/入向交接分计', () => {
    const events = [
      ev({ kind: 'session' }),
      ev({ kind: 'session', ref: 's2', at: 300 }),
      ev({ kind: 'handoff', ref: 'h1', peerLane: 'L2', at: 400 }),
      ev({ laneId: 'L2', kind: 'handoff', ref: 'h2', peerLane: 'L1', at: 500 }),
    ]
    expect(laneSummary(events, 'L1')).toEqual({ laneId: 'L1', sessions: 2, handoffsOut: 1, handoffsIn: 1 })
    expect(laneSummary(events, 'L2')).toEqual({ laneId: 'L2', sessions: 0, handoffsOut: 1, handoffsIn: 1 })
  })
})
