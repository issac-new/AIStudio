// overlay/custom/server/loop/engine/__tests__/squad-leader-round6.test.ts
// R6 squad leader 协调协议守门（multica squad_briefing 语义）：
// 选人（busy>online>idle，offline 不选）/ 每轮必录评估（action/no_action/failed）/
// mention-bus @squad 走 leader 协调（coordinateSquad 优先于直接 enqueue）。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { pickLeader, coordinateSquad, type SquadLeaderDeps } from '../squad-leader'
import { dispatchMention, type MentionBusDeps } from '../mention-bus'
import type { AgentRosterRow } from '@/custom/ia2/adapters/agents'

function row(name: string, busyState: AgentRosterRow['busyState'], activeTask?: string): AgentRosterRow {
  return { name, busyState, activeTask, sessionCount: 0, source: 'platform' }
}

describe('squad leader 选人（multica squad_briefing 语义）', () => {
  it('busy > online > idle；offline 不选；空名册 → null', () => {
    const roster = [row('a-idle', 'idle'), row('b-busy', 'busy', '跑测试'), row('c-online', 'online'), row('d-off', 'offline')]
    expect(pickLeader(roster)?.name).toBe('b-busy')
    expect(pickLeader([row('a-idle', 'idle'), row('c-online', 'online')])?.name).toBe('c-online')
    expect(pickLeader([row('d-off', 'offline')])).toBeNull()
    expect(pickLeader([])).toBeNull()
  })

  it('任务提示命中 activeTask/name 加权', () => {
    const roster = [row('a-online', 'online'), row('b-busy', 'busy', '重构 utils')]
    expect(pickLeader(roster, '重构')?.name).toBe('b-busy')
    expect(pickLeader(roster, 'codex')?.name).toBe('b-busy') // 无人名命中仍按 busy
  })
})

describe('squad leader 协调（每轮必录 action/no_action/failed + 理由）', () => {
  it('可派 → action + 委托 + plan', async () => {
    const deps: SquadLeaderDeps = {
      roster: () => [row('codex', 'busy', '跑测试')],
      delegate: vi.fn(async () => 'run-abcdef123456'),
    }
    const ev = await coordinateSquad('修复登录页', deps)
    expect(ev.action).toBe('action')
    expect(ev.reasoning).toContain('codex')
    expect(ev.plan?.agentName).toBe('codex')
    expect(deps.delegate).toHaveBeenCalledWith('codex', expect.stringContaining('修复登录页'))
  })

  it('无可派（全离线）→ no_action + 名册理由', async () => {
    const deps: SquadLeaderDeps = { roster: () => [row('a', 'offline')], delegate: vi.fn(async () => 'x') }
    const ev = await coordinateSquad('任务', deps)
    expect(ev.action).toBe('no_action')
    expect(ev.reasoning).toContain('离线')
    expect(deps.delegate).not.toHaveBeenCalled()
  })

  it('委托返回空 → failed + plan', async () => {
    const deps: SquadLeaderDeps = { roster: () => [row('codex', 'online')], delegate: vi.fn(async () => null) }
    const ev = await coordinateSquad('任务', deps)
    expect(ev.action).toBe('failed')
    expect(ev.plan?.agentName).toBe('codex')
  })
})

describe('mention-bus @squad 走 leader 协调（coordinateSquad 优先）', () => {
  const isKnown = (n: string) => ['codex', 'kimi'].includes(n.toLowerCase())

  it('@squad + coordinateSquad 注入 → 走 leader（不直接 enqueue）', async () => {
    const coordinateSquad = vi.fn(async () => ({ action: 'action' as const, reasoning: '已委托 codex' }))
    const enqueue = vi.fn(async () => 'run-x')
    const deps: MentionBusDeps = {
      isKnownAgent: isKnown, isRuntimeHealthy: () => true,
      enqueueAgentRun: enqueue, coordinateSquad,
    }
    const r = await dispatchMention('t1', '@squad 派单', deps)
    expect(coordinateSquad).toHaveBeenCalledWith('@squad 派单')
    expect(enqueue).not.toHaveBeenCalled()
    expect(r.triggered).toBe(true)
    expect(r.action).toContain('squad leader')
    expect(r.action).toContain('已委托 codex')
  })

  it('@squad 无 coordinateSquad 注入 → 回退直接 enqueue（向后兼容）', async () => {
    const deps: MentionBusDeps = {
      isKnownAgent: isKnown, isRuntimeHealthy: () => true,
      enqueueAgentRun: vi.fn(async () => 'run-x'),
    }
    const r = await dispatchMention('t1', '@squad 派单', deps)
    expect(r.triggered).toBe(true)
    expect(deps.enqueueAgentRun).toHaveBeenCalled()
  })
})
