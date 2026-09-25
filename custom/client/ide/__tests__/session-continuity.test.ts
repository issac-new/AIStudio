// 会话连续性四态守门（routa §七#11：active/interrupted/restorable/stale 7 天线）。
import { describe, it, expect } from 'vitest'
import { sessionContinuity } from '../utils/session-continuity'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

describe('四态判定（routa 语义）', () => {
  it('active=连接+未结束；interrupted=断连未结束 7 天内', () => {
    expect(sessionContinuity({ lastEventAt: NOW - 1000, connected: true, ended: false }, NOW).state).toBe('active')
    expect(sessionContinuity({ lastEventAt: NOW - DAY, connected: false, ended: false }, NOW).state).toBe('interrupted')
  })

  it('restorable=已结束 7 天内；stale=超 7 天', () => {
    expect(sessionContinuity({ lastEventAt: NOW - DAY, connected: false, ended: true }, NOW).state).toBe('restorable')
    const stale = sessionContinuity({ lastEventAt: NOW - 8 * DAY, connected: false, ended: true }, NOW)
    expect(stale.state).toBe('stale')
    expect(stale.ageDays).toBe(8)
  })

  it('边界：7 天整仍在窗内（restorable/interrupted）；8 天=stale', () => {
    expect(sessionContinuity({ lastEventAt: NOW - 7 * DAY, connected: false, ended: true }, NOW).state).toBe('restorable')
    expect(sessionContinuity({ lastEventAt: NOW - 7 * DAY, connected: false, ended: false }, NOW).state).toBe('interrupted')
    expect(sessionContinuity({ lastEventAt: NOW - 8 * DAY, connected: false, ended: false }, NOW).state).toBe('stale')
  })
})
