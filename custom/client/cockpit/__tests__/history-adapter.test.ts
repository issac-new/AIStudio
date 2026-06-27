import { describe, it, expect } from 'vitest'
import { mergeTimeline, deriveAction } from '@/custom/cockpit/adapters/history-adapter'

describe('deriveAction', () => {
  it('status_changed to done → 决策', () => {
    expect(deriveAction('event', { kind: 'status_changed', payload: { to: 'done' } })).toBe('决策')
  })
  it('status_changed to review → 审批', () => {
    expect(deriveAction('event', { kind: 'status_changed', payload: { to: 'review' } })).toBe('审批')
  })
  it('commented event → 补充', () => {
    expect(deriveAction('event', { kind: 'commented' })).toBe('补充')
  })
  it('comment source → 补充', () => {
    expect(deriveAction('comment', {})).toBe('补充')
  })
  it('linked → 关联', () => {
    expect(deriveAction('event', { kind: 'linked' })).toBe('关联')
  })
  it('assigned → 委派', () => {
    expect(deriveAction('event', { kind: 'assigned' })).toBe('委派')
  })
  it('completed → 决策', () => {
    expect(deriveAction('event', { kind: 'completed' })).toBe('决策')
  })
  it('other → 评估', () => {
    expect(deriveAction('event', { kind: 'something' })).toBe('评估')
  })
})

describe('mergeTimeline', () => {
  it('merges items sorted desc by ts, assigns action/title/archived', () => {
    const items = [
      { source: 'event', id: 'evt-1', taskId: 't1', taskTitle: 'T1', taskArchived: false,
        ts: 100, kind: 'status_changed', payload: { to: 'review' } },
      { source: 'comment', id: 'cmt-2', taskId: 't2', taskTitle: 'T2', taskArchived: true,
        ts: 200, author: 'alice', body: '回复内容' },
    ]
    const out = mergeTimeline(items)
    expect(out).toEqual([
      { id: 'h-cmt-2', when: expect.any(String), ts: expect.any(Number), taskId: 't2', source: 'comment', action: '补充', title: '回复内容', archived: true },
      { id: 'h-evt-1', when: expect.any(String), ts: expect.any(Number), taskId: 't1', source: 'event', action: '审批', title: '状态 → review', archived: false },
    ])
  })
})
