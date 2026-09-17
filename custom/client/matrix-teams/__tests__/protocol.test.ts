// overlay/custom/client/matrix-teams/__tests__/protocol.test.ts
// 协议守门：事件类型常量 + content schema 解析（容错返回 null）+ 防内联漂移。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  TEAM_EVENT_TYPES, TASK_EVENT_TYPES, REGISTRY_ACCOUNT_DATA_TYPE, REGISTRY_ROOM_POWER_LEVELS,
  isSwarmStudioEventType, agentTeamGlobalId, slugify,
  parseAccountContent, parseLeadersContent, parseDutyContent, parseAssignContent, parseReceiptContent,
} from '../protocol'

describe('事件类型常量', () => {
  it('五个事件类型 + account data 类型符合 spec §4.2', () => {
    expect(TEAM_EVENT_TYPES.account).toBe('com.swarmstudio.team.account')
    expect(TEAM_EVENT_TYPES.leaders).toBe('com.swarmstudio.team.leaders')
    expect(TEAM_EVENT_TYPES.duty).toBe('com.swarmstudio.team.duty')
    expect(TASK_EVENT_TYPES.assign).toBe('com.swarmstudio.task.assign')
    expect(TASK_EVENT_TYPES.receipt).toBe('com.swarmstudio.task.receipt')
    expect(REGISTRY_ACCOUNT_DATA_TYPE).toBe('com.swarmstudio.registry')
  })
  it('PL 矩阵符合 spec §4.2（account/receipt=0，leaders/duty/assign=50）', () => {
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TEAM_EVENT_TYPES.account]).toBe(0)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TASK_EVENT_TYPES.receipt]).toBe(0)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TEAM_EVENT_TYPES.leaders]).toBe(50)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TEAM_EVENT_TYPES.duty]).toBe(50)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TASK_EVENT_TYPES.assign]).toBe(50)
  })
  it('isSwarmStudioEventType 按前缀识别', () => {
    expect(isSwarmStudioEventType('com.swarmstudio.team.duty')).toBe(true)
    expect(isSwarmStudioEventType('m.room.message')).toBe(false)
  })
})

describe('id 与 slug', () => {
  it('agentTeamGlobalId = <ownerUserId>/<slug>', () => {
    expect(agentTeamGlobalId('@alice:sv', 'backend')).toBe('@alice:sv/backend')
  })
  it('slugify 小写化并压缩非法字符，空名兜底 team', () => {
    expect(slugify('Back End!')).toBe('back-end')
    expect(slugify('  ')).toBe('team')
  })
})

describe('parseAccountContent', () => {
  const ok = { displayName: 'Alice', agentTeams: [{ slug: 'backend', name: '后端组', profiles: ['alice', 'alice-2'], defaultProfile: 'alice' }], updatedAt: 1 }
  it('合法 content 原样解析', () => {
    expect(parseAccountContent(ok)).toEqual(ok)
  })
  it('缺 displayName / updatedAt / agentTeams 非数组 → null', () => {
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1 })).toBeNull()
    expect(parseAccountContent({ displayName: 'x', agentTeams: [], updatedAt: 't' })).toBeNull()
    expect(parseAccountContent(null)).toBeNull()
    expect(parseAccountContent('str')).toBeNull()
  })
  it('team 内 profiles 混入非字符串 → null（整体拒绝，不静默截断）', () => {
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1, agentTeams: [{ slug: 'a', name: 'a', profiles: ['p', 1] }] })).toBeNull()
  })
  it('超过限幅（>20 teams 或某 team >20 profiles）→ null', () => {
    const teams = Array.from({ length: 21 }, (_, i) => ({ slug: `t${i}`, name: `t${i}`, profiles: ['p'] }))
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1, agentTeams: teams })).toBeNull()
    const wide = { slug: 'a', name: 'a', profiles: Array.from({ length: 21 }, (_, i) => `p${i}`) }
    expect(parseAccountContent({ displayName: 'x', updatedAt: 1, agentTeams: [wide] })).toBeNull()
  })
})

describe('parseLeadersContent / parseDutyContent', () => {
  it('leaders 合法解析，非字符串成员 → null', () => {
    expect(parseLeadersContent({ leaders: ['@a:sv'] })).toEqual({ leaders: ['@a:sv'] })
    expect(parseLeadersContent({ leaders: ['@a:sv', 1] })).toBeNull()
    expect(parseLeadersContent({})).toBeNull()
  })
  it('duty 合法解析；assigneeKind 非法 → null', () => {
    const ok = { assigneeKind: 'agentTeam', assigneeId: '@a:sv/backend', updatedBy: '@l:sv', updatedAt: 2 }
    expect(parseDutyContent(ok)).toEqual(ok)
    expect(parseDutyContent({ ...ok, assigneeKind: 'nope' })).toBeNull()
    expect(parseDutyContent({ ...ok, assigneeId: 5 })).toBeNull()
  })
})

describe('parseAssignContent / parseReceiptContent', () => {
  const assign = { taskId: 'u1', title: 'T', target: { account: '@a:sv', agentTeam: 'backend' }, issuedBy: '@l:sv', issuedAt: 3 }
  it('assign 合法解析（可选项缺省容忍）', () => {
    expect(parseAssignContent(assign)).toEqual(assign)
    expect(parseAssignContent({ ...assign, target: {} })).toBeNull()
    expect(parseAssignContent({ ...assign, taskId: 1 })).toBeNull()
  })
  it('receipt 合法解析；status 非法 → null', () => {
    const ok = { taskId: 'u1', status: 'created', reportedBy: '@a:sv', reportedAt: 4 }
    expect(parseReceiptContent(ok)).toEqual(ok)
    expect(parseReceiptContent({ ...ok, status: 'nope' })).toBeNull()
    expect(parseReceiptContent({ ...ok, taskId: null })).toBeNull()
  })
})

describe('协议守门：matrix-teams 模块内禁止内联事件类型字符串', () => {
  function collect(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...collect(p))
      else if (p.endsWith('.ts') || p.endsWith('.vue')) out.push(p)
    }
    return out
  }
  it('除 protocol.ts 与本测试外，不得出现 com.swarmstudio. 字面量', () => {
    const root = join(__dirname, '..')
    const offenders = collect(root).filter(
      p => !p.endsWith('protocol.ts') && !p.includes('__tests__')
        && readFileSync(p, 'utf8').includes('com.swarmstudio.')
    )
    expect(offenders).toEqual([])
  })
})
