/**
 * autosched+orgloop 纯函数面单测（PR-5/6/7 配套守门）。
 * 覆盖：排期拓扑+在制上限分窗/环依赖拒绝；闸修复状态机合法迁移/非法迁移/终态；
 * （merge-run 的 git 执行面走部署窗口活体验证，此处守纯函数契约——同 PR-0 模式）。
 */
import { describe, expect, it } from 'vitest'
import { compute_schedule } from '../autosched/schedule-generator'
import { canTransition } from '../orgloop/orgloop-controller'

describe('PR-7 compute_schedule', () => {
  const tasks = [
    { id: 'A', estimate_days: 1 },
    { id: 'B', estimate_days: 2 },
    { id: 'C', estimate_days: 0.5, deps: ['A'] },
  ]
  it('拓扑序+窗口生成', () => {
    const { plan, total_days } = compute_schedule(tasks, '2026-10-19', 2)
    expect(plan).toHaveLength(3)
    expect(total_days).toBe(3.5)
    const a = plan.find(p => p.id === 'A')!, c = plan.find(p => p.id === 'C')!
    expect(String(c.window.start) >= String(a.window.start)).toBe(true)
  })
  it('在制上限生效（max_wip=1 串行）', () => {
    const { plan } = compute_schedule(tasks, '2026-10-19', 1)
    // 串行时 B（2 天）窗口终点应晚于并行态
    const b = plan.find(p => p.id === 'B') as { window: { end: string } }
    expect(b.window.end >= '2026-10-21').toBe(true)
  })
  it('环依赖拒绝', () => {
    expect(() => compute_schedule([
      { id: 'X', estimate_days: 1, deps: ['Y'] }, { id: 'Y', estimate_days: 1, deps: ['X'] },
    ], '2026-10-19', 2)).toThrow(/circular/)
  })
})

describe('PR-5 gate-repair 状态机', () => {
  it('合法链路 fail→dispatch→re_review→pass', () => {
    expect(canTransition('fail_registered', 'repair_dispatched')).toBe(true)
    expect(canTransition('repair_dispatched', 're_review')).toBe(true)
    expect(canTransition('re_review', 'pass')).toBe(true)
  })
  it('跳步非法', () => {
    expect(canTransition('fail_registered', 'pass')).toBe(false)
    expect(canTransition('fail_registered', 're_review')).toBe(false)
  })
  it('终态封死+waived 全开', () => {
    expect(canTransition('pass', 'repair_dispatched')).toBe(false)
    expect(canTransition('waived', 're_review')).toBe(false)
    expect(canTransition('fail_registered', 'waived')).toBe(true)
    expect(canTransition('re_review', 'waived')).toBe(true)
  })
})
