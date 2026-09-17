// overlay/custom/client/matrix-teams/__tests__/accounts-adapter.test.ts
// 账号树投影守门：sender≠stateKey 丢弃、解析失败丢弃、leader 标记、未声明成员、值守归属判定。
import { describe, it, expect } from 'vitest'
import { TEAM_EVENT_TYPES } from '../protocol'
import {
  projectAccounts, undeclaredMembers, dutyAppliesToUser, type RawStateEvent,
} from '../adapters/accounts'

const acc = (userId: string, sender = userId, teams: Array<{ slug: string; profiles: string[] }> = [{ slug: 'main', profiles: ['p1'] }]): RawStateEvent => ({
  type: TEAM_EVENT_TYPES.account,
  stateKey: userId,
  sender,
  content: { displayName: userId.split(':')[0].slice(1), agentTeams: teams.map(t => ({ slug: t.slug, name: t.slug, profiles: t.profiles, defaultProfile: t.profiles[0] })), updatedAt: 1 },
})

describe('projectAccounts', () => {
  it('合法事件投影为 TeamAccountView，标记 isLeader，按 userId 排序', () => {
    const views = projectAccounts([acc('@bob:sv'), acc('@alice:sv')], ['@alice:sv'])
    expect(views.map(v => v.userId)).toEqual(['@alice:sv', '@bob:sv'])
    expect(views[0].isLeader).toBe(true)
    expect(views[1].isLeader).toBe(false)
    expect(views[0].agentTeams[0]).toMatchObject({ slug: 'main', profiles: ['p1'], defaultProfile: 'p1' })
  })
  it('sender≠stateKey（伪造他人条目）与解析失败（缺字段）→ 丢弃', () => {
    const forged = acc('@alice:sv', '@mallory:sv')
    const broken: RawStateEvent = { type: TEAM_EVENT_TYPES.account, stateKey: '@x:sv', sender: '@x:sv', content: { displayName: 'x' } }
    expect(projectAccounts([forged, broken], [])).toEqual([])
  })
  it('非 account 类型事件不参与投影', () => {
    const ev: RawStateEvent = { type: TEAM_EVENT_TYPES.duty, stateKey: '!r:sv', sender: '@l:sv', content: {} }
    expect(projectAccounts([ev], [])).toEqual([])
  })
  it('同 stateKey 多条事件取最后一条（防御，正常由 state 语义保证唯一）', () => {
    const v1 = acc('@a:sv', '@a:sv', [{ slug: 'one', profiles: ['p'] }])
    const v2 = acc('@a:sv', '@a:sv', [{ slug: 'two', profiles: ['p'] }])
    const views = projectAccounts([v1, v2], [])
    expect(views).toHaveLength(1)
    expect(views[0].agentTeams[0].slug).toBe('two')
  })
})

describe('undeclaredMembers', () => {
  it('成员∪leader 减去已声明者，排序去重', () => {
    expect(undeclaredMembers([acc('@alice:sv')], ['@lead:sv'], ['@alice:sv', '@bob:sv', '@lead:sv']))
      .toEqual(['@bob:sv', '@lead:sv'])
  })
})

describe('dutyAppliesToUser', () => {
  const accounts = projectAccounts([acc('@alice:sv', '@alice:sv', [{ slug: 'backend', profiles: ['pa'] }])], [])
  it('account 直配命中', () => {
    expect(dutyAppliesToUser({ assigneeKind: 'account', assigneeId: '@alice:sv', updatedBy: '@l:sv', updatedAt: 1 }, '@alice:sv', accounts)).toBe(true)
    expect(dutyAppliesToUser({ assigneeKind: 'account', assigneeId: '@bob:sv', updatedBy: '@l:sv', updatedAt: 1 }, '@alice:sv', accounts)).toBe(false)
  })
  it('agentTeam 全局 id = <userId>/<slug> 命中该 userId', () => {
    expect(dutyAppliesToUser({ assigneeKind: 'agentTeam', assigneeId: '@alice:sv/backend', updatedBy: '@l:sv', updatedAt: 1 }, '@alice:sv', accounts)).toBe(true)
    expect(dutyAppliesToUser({ assigneeKind: 'agentTeam', assigneeId: '@alice:sv/backend', updatedBy: '@l:sv', updatedAt: 1 }, '@bob:sv', accounts)).toBe(false)
  })
})
