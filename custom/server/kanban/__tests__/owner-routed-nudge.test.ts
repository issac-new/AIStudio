/**
 * owner-routed-nudge 单测（run21+run22 两轮错侧催办立案的产品化①）：
 * 路由决策四态——assignee 在位直投 / 空置回落板 team / 双空显式无人 / 卡不存在。
 * 铁律回归：双空态返回 unassigned 而非任何固定接收方（run21 三连误催复测侧、
 * run22 退回单只达组织者两实录的防复发锚）。
 */
import { describe, expect, it } from 'vitest'
import { resolveNudgeTarget, type NudgeCardLike } from '../owner-routed-nudge'

const cards: NudgeCardLike[] = [
  { id: 't_fix_01', assignee: 'hu-csw-channel-wechat', title: 'DEF-BE-S1-01 台架漂移', board: 'hu-channel-wechat' },
  { id: 't_orphan', assignee: '', title: '未认领卡', board: 'qi-test-pay', boardTeam: 'qi-researcher' },
  { id: 't_wild', assignee: null, title: '双空卡', board: 'x-cashier-mp', boardTeam: null },
]

describe('resolveNudgeTarget — 催办路由跟随卡 owner', () => {
  it('assignee 在位 → 直投 assignee（run22 缺项 owner 直派的解析面）', () => {
    const d = resolveNudgeTarget(cards, 't_fix_01')
    expect(d.found && d.route === 'assignee' && d.target === 'hu-csw-channel-wechat').toBeTruthy()
  })
  it('assignee 空置 → 回落板 team 并标可见性注记（建卡未认领=派单断环信号）', () => {
    const d = resolveNudgeTarget(cards, 't_orphan')
    expect(d.found && d.route === 'board-team' && d.target === 'qi-researcher').toBeTruthy()
    expect(d.found && d.note?.includes('建卡未认领')).toBeTruthy()
  })
  it('双空 → 显式 unassigned，绝不改投固定接收方（两轮错侧催办防复发锚）', () => {
    const d = resolveNudgeTarget(cards, 't_wild')
    expect(d.found && d.route === 'unassigned' && d.target === '').toBeTruthy()
  })
  it('卡不存在 → card-not-found', () => {
    expect(resolveNudgeTarget(cards, 't_none')).toEqual({ found: false, reason: 'card-not-found' })
  })
})
