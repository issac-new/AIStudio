/**
 * human-gate 单测（run22 复盘②：R-5 环形依赖产品化断根）：
 * 前置批准请求生命周期——创建幂等 / 收件箱聚合形状 / 裁决状态机 / 事件账本回写。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createRequest, decide, listHumanGatePending, mkId } from '../human-gate'

describe('human-gate — HumanGate 发布批准前置请求', () => {
  beforeEach(() => {
    // 清内存态（单测隔离）：经由 decide 把在案单推到终态即从 pending 消失
  })
  it('创建 → pending 可见 + 幂等（runId+cardId 唯一键重发返回在案单）', () => {
    const a = createRequest({ runId: 'r22', cardId: 't_19142fc9', title: 'RFD-001 对外发布', requestedBy: 'fanfan' })
    expect(a.existed).toBe(false)
    expect(a.req.status).toBe('pending')
    const b = createRequest({ runId: 'r22', cardId: 't_19142fc9', title: '重发', requestedBy: 'fanfan' })
    expect(b.existed).toBe(true)
    expect(b.req.id).toBe(a.req.id)
    expect(listHumanGatePending().some(i => i.id === a.req.id)).toBeTruthy()
  })
  it('收件箱形状：id=hgate: 前缀、kind=review、risk=high（发布批准高危档）', () => {
    createRequest({ runId: 'r22', cardId: 't_shape', title: '形状', requestedBy: 'x' })
    const item = listHumanGatePending().find(i => i.id === mkId('r22', 't_shape'))
    expect(item?.kind).toBe('review')
    expect(item?.risk).toBe('high')
    expect(item?.title).toContain('发布 HumanGate')
  })
  it('裁决 approve → 终态 approved + pending 移除；重复裁决返回 null', () => {
    const { req } = createRequest({ runId: 'r22', cardId: 't_dec', title: '裁决', requestedBy: 'x' })
    const done = decide(req.id, 'approve', 'director-human', '发布确认')
    expect(done?.status).toBe('approved')
    expect(done?.decidedBy).toBe('director-human')
    expect(listHumanGatePending().some(i => i.id === req.id)).toBeFalsy()
    expect(decide(req.id, 'reject', 'again')).toBeNull()
  })
  it('不存在的单裁决 → null（不假装成功）', () => {
    expect(decide('hgate:none:none', 'approve', 'x')).toBeNull()
  })
})
