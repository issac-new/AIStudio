// overlay/custom/client/matrix-teams/__tests__/protocol-v2.test.ts
// ══ M-A 协议 v2 增量用例·team 侧（草稿未跑；应用=整文件拷入 __tests__/）══
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  TASK_EVENT_TYPES, AGENT_PROFILE_EVENT_TYPE, REGISTRY_ROOM_POWER_LEVELS,
  parseAssignContent, parseReceiptContent, parseAgentProfileContent, parseAgentMessageContent,
} from '../protocol'

describe('assign 扩展字段（M-A 计划 T3-6）', () => {
  const ok = {
    taskId: 't-1', title: '拆解子任务', issuedBy: '@alice:matrix.test', issuedAt: 1,
    target: { account: '@bob:matrix.test' },
  }
  it('capability 正例（module:payment）/ phase 正例解析', () => {
    const c = parseAssignContent({
      ...ok, capability: ['module:payment', 'test'], phase: 'P3',
      parentId: 'c-001', dependsOn: ['t-0'], dueAt: 12345,
    })
    expect(c?.capability).toEqual(['module:payment', 'test'])
    expect(c?.phase).toBe('P3')
    expect(c?.parentId).toBe('c-001')
    expect(c?.dependsOn).toEqual(['t-0'])
    expect(c?.dueAt).toBe(12345)
  })
  it('capability 坏例（大写 / 超 64 / 超 10 项）→ null', () => {
    expect(parseAssignContent({ ...ok, capability: ['Module:Pay'] })).toBeNull()
    expect(parseAssignContent({ ...ok, capability: ['x'.repeat(65)] })).toBeNull()
    expect(parseAssignContent({ ...ok, capability: Array.from({ length: 11 }, () => 'ok') })).toBeNull()
  })
  it('phase 非 P1-P6 / dependsOn 超 20 项 / parentId 超 128 → null', () => {
    expect(parseAssignContent({ ...ok, phase: 'P9' })).toBeNull()
    expect(parseAssignContent({ ...ok, dependsOn: Array.from({ length: 21 }, (_, i) => `t-${i}`) })).toBeNull()
    expect(parseAssignContent({ ...ok, parentId: 'x'.repeat(129) })).toBeNull()
  })
  it('全缺省仍解析（向后兼容，v1 事件不断）', () => {
    expect(parseAssignContent(ok)?.taskId).toBe('t-1')
  })
})

describe('ReceiptStatus 扩 waiting-human（M-A 计划 T3-7）', () => {
  it('waiting-human 合法；其余字符串 → null', () => {
    const base = { taskId: 't-1', reportedBy: '@bob-agent:matrix.test', reportedAt: 1 }
    expect(parseReceiptContent({ ...base, status: 'waiting-human' })?.status).toBe('waiting-human')
    expect(parseReceiptContent({ ...base, status: 'paused' })).toBeNull()
  })
})

describe('parseAgentProfileContent（M-A 计划 T3-8）', () => {
  const ok = {
    schemaVersion: 2,
    agents: [{
      agentId: 'req-analyst', agentType: 'requirement-analysis',
      capabilities: ['req-analysis', 'module:payment'], maxParallel: 2,
      needsHumanConfirm: ['publish'], permissions: ['repo:read', 'test:run'],
      lastReportAt: 9,
    }],
    updatedBy: '@alice-agent:matrix.test', updatedAt: 10,
  }
  it('合法解析；PL=50；类型常量正确', () => {
    expect(parseAgentProfileContent(ok)).toEqual(ok)
    expect(REGISTRY_ROOM_POWER_LEVELS.events[AGENT_PROFILE_EVENT_TYPE]).toBe(50)
    expect(AGENT_PROFILE_EVENT_TYPE).toBe('com.swarmstudio.agent.profile')
  })
  it('agents 超 20 / maxParallel 非正整数 / schemaVersion 1（无 v1 历史，不双认）→ null', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ agentId: `a${i}`, agentType: 't', capabilities: [] }))
    expect(parseAgentProfileContent({ ...ok, agents: many })).toBeNull()
    expect(parseAgentProfileContent({ ...ok, agents: [{ ...ok.agents[0], maxParallel: 0 }] })).toBeNull()
    expect(parseAgentProfileContent({ ...ok, agents: [{ ...ok.agents[0], maxParallel: 1.5 }] })).toBeNull()
    expect(parseAgentProfileContent({ ...ok, schemaVersion: 1 })).toBeNull()
  })
})

describe('parseAgentMessageContent（M-A 计划 T3-9）', () => {
  it('合法解析；text 超 4000 / 缺 agentId → null', () => {
    expect(parseAgentMessageContent({ agentId: 'coder', agentType: 'coding', text: 'diff 已生成' }))
      .toEqual({ agentId: 'coder', agentType: 'coding', text: 'diff 已生成' })
    expect(parseAgentMessageContent({ agentId: 'coder', agentType: 'coding', text: 'x'.repeat(4001) })).toBeNull()
    expect(parseAgentMessageContent({ agentType: 'coding', text: 't' })).toBeNull()
  })
  it('message 事件类型常量 + PL=0', () => {
    expect(TASK_EVENT_TYPES.message).toBe('com.swarmstudio.agent.message')
    expect(REGISTRY_ROOM_POWER_LEVELS.events[TASK_EVENT_TYPES.message]).toBe(0)
  })
})

describe('协议守门：agent.* 事件类型字符串禁止内联（M-A 计划 T3-10）', () => {
  function collect(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) out.push(...collect(p))
      else if (p.endsWith('.ts') || p.endsWith('.vue')) out.push(p)
    }
    return out
  }
  it('除 protocol.ts 与测试外，模块内不得出现 com.swarmstudio.agent. 字面量', () => {
    const root = join(__dirname, '..')
    const offenders = collect(root).filter(
      p => !p.endsWith('protocol.ts') && !p.includes('__tests__')
        && readFileSync(p, 'utf8').includes('com.swarmstudio.agent.'),
    )
    expect(offenders).toEqual([])
  })
})
