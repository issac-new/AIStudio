// 断点推断纯函数测试：边界事件、长间歇、工作流中途、节奏推测、缺证据保守。
import { describe, it, expect } from 'vitest'
import { DEFAULT_BREAKPOINT_OPTIONS, inferBreakpoint, type BreakpointEvent } from '../breakpoint-adapter'

/** 固定「现在」：2026-11-03 15:00:00 本地时间对应的 epoch ms。 */
const NOW = new Date(2026, 10, 3, 15, 0, 0, 0).getTime()
const nowSec = Math.floor(NOW / 1000)
const ago = (min: number): number => nowSec - Math.round(min * 60)
const ev = (kind: string, minAgo: number): BreakpointEvent => ({ kind, atSec: ago(minAgo) })

describe('断点推断', () => {
  it('无事件 → no_evidence 且不是断点（缺证据不猜成断点）', () => {
    const d = inferBreakpoint([], NOW)
    expect(d.atBreakpoint).toBe(false)
    expect(d.reason).toBe('no_evidence')
    expect(d.nextBreakpointAtMs).toBeNull()
    expect(d.evidence.eventsConsidered).toBe(0)
  })

  it('近期边界事件（3 分钟内完成/阻塞）→ 断点；超窗口则不是', () => {
    const fresh = inferBreakpoint([ev('commented', 40), ev('done', 1)], NOW)
    expect(fresh.atBreakpoint).toBe(true)
    expect(fresh.reason).toBe('recent_boundary')
    expect(fresh.detail).toContain('状态边界')

    const stale = inferBreakpoint([ev('done', 10)], NOW)
    expect(stale.atBreakpoint).toBe(false)
    expect(stale.reason).toBe('mid_flow')
  })

  it('kind 前缀容错：card.done / task:blocked 也认作边界', () => {
    expect(inferBreakpoint([ev('card.done', 1)], NOW).reason).toBe('recent_boundary')
    expect(inferBreakpoint([ev('task:blocked', 2)], NOW).reason).toBe('recent_boundary')
  })

  it('长间歇（20 分钟无事件）→ 断点：用户已停下', () => {
    const d = inferBreakpoint([ev('commented', 35)], NOW)
    expect(d.atBreakpoint).toBe(true)
    expect(d.reason).toBe('lull')
    expect(d.detail).toContain('静默')
  })

  it('工作流中途 → 非断点，并按节奏推测下一断点（钳制上下限）', () => {
    // 每 10 分钟一条评论：最近一条 1 分钟前 → 中位间隔 600s
    const events = [ev('commented', 31), ev('commented', 21), ev('commented', 11), ev('commented', 1)]
    const d = inferBreakpoint(events, NOW)
    expect(d.atBreakpoint).toBe(false)
    expect(d.reason).toBe('mid_flow')
    expect(d.evidence.medianGapSec).toBe(600)
    expect(d.nextBreakpointAtMs).toBe((ago(1) + 600) * 1000)

    // 间隔过密（30s）→ 钳到下限 5 分钟
    const tight = [ev('commented', 1.5), ev('commented', 1), ev('commented', 0.5)]
    const dt = inferBreakpoint(tight, NOW)
    expect(dt.atBreakpoint).toBe(false)
    expect(dt.nextBreakpointAtMs).toBe((ago(0.5) + DEFAULT_BREAKPOINT_OPTIONS.minGapMinutes * 60) * 1000)

    // 间隔过疏（6h）但不满足 lull（因为最后一条很近）→ 钳到上限 120 分钟
    const wide = [{ kind: 'commented', atSec: ago(721) }, { kind: 'commented', atSec: ago(1) }]
    const dw = inferBreakpoint(wide, NOW)
    expect(dw.nextBreakpointAtMs).toBe((ago(1) + DEFAULT_BREAKPOINT_OPTIONS.maxGapMinutes * 60) * 1000)
  })

  it('边界事件后紧接新工作：仍算断点（切换上下文本身就是时机）', () => {
    const d = inferBreakpoint([ev('done', 2), ev('commented', 1)], NOW)
    expect(d.atBreakpoint).toBe(true)
    expect(d.reason).toBe('recent_boundary')
  })

  it('非法时间戳（0/负数/未来过远/NaN）被剔除且不影响结论', () => {
    const dirty: BreakpointEvent[] = [
      { kind: 'done', atSec: 0 },
      { kind: 'done', atSec: -5 },
      { kind: 'done', atSec: nowSec + 3600 },
      { kind: 'done', atSec: Number.NaN },
      ev('commented', 40),
    ]
    const d = inferBreakpoint(dirty, NOW)
    expect(d.evidence.eventsConsidered).toBe(1)
    expect(d.reason).toBe('lull')
  })

  it('自定义阈值生效：把 settle 放宽到 10 分钟则 8 分钟前的边界算断点', () => {
    const d = inferBreakpoint([ev('review', 8)], NOW, { settleMinutes: 10 })
    expect(d.atBreakpoint).toBe(true)
    expect(d.reason).toBe('recent_boundary')
  })
})
