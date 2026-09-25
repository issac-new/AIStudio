// Goal 自主档守门（qoder：三档停点/不可达与预算同停/majorFork 例外）。
import { describe, it, expect } from 'vitest'
import { shouldStop } from '../goal-autonomy'

const ok = { reachable: true, majorFork: false, budgetExhausted: false }

describe('Goal 自主档（qoder Quest Goal 语义）', () => {
  it('autonomous 一路推进；majorFork 例外停', () => {
    expect(shouldStop('autonomous', ok).stop).toBe(false)
    expect(shouldStop('autonomous', { ...ok, majorFork: true })).toMatchObject({ stop: true })
    expect(shouldStop('autonomous', { ...ok, majorFork: true }).reason).toContain('分叉')
  })

  it('checkin 每步停；assistive 每步停；不可达/预算三档同停', () => {
    expect(shouldStop('checkin', ok).stop).toBe(true)
    expect(shouldStop('assistive', ok).stop).toBe(true)
    expect(shouldStop('autonomous', { ...ok, reachable: false }).reason).toContain('不可达')
    expect(shouldStop('autonomous', { ...ok, budgetExhausted: true }).reason).toContain('预算')
    expect(shouldStop('checkin', { ...ok, budgetExhausted: true }).reason).toContain('预算')  // 预算优先于档位
  })
})
