// overlay/custom/client/ia2/__tests__/agents-round7.test.ts
// R7-C 守门：agent 名册三源合并（platform 在线态 / assignee 在跑 / 会话挂靠）/
// 名册排序（busy→online→idle→offline）/ FlowNavPanel agents 区接线 / patch 354 漂移。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildAgentRoster, type AgentRosterTask, type AgentRosterSession } from '../adapters/agents'
import type { PlatformInfo } from '../store/platforms'

function pf(name: string, state: string): PlatformInfo {
  return { name, icon: 'radar', state, updated: '' }
}

describe('R7-C agent 名册三源合并（multica roster 语义）', () => {
  it('platform 在线 + assignee 在跑 → busy（叠加两源）', () => {
    const platforms = [pf('codex', 'running')]
    const tasks: AgentRosterTask[] = [{ id: 't1', title: '重构', assignee: 'codex', status: 'running' }]
    const rows = buildAgentRoster(platforms, tasks, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].busyState).toBe('busy')
    expect(rows[0].activeTask).toBe('重构')
    expect(rows[0].source).toBe('platform')
  })

  it('platform 在线无在跑 → online；离线 → offline', () => {
    const rows = buildAgentRoster([pf('codex', 'running'), pf('kimi', 'stopped')], [], [])
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))
    expect(byName['codex'].busyState).toBe('online')
    expect(byName['kimi'].busyState).toBe('offline')
  })

  it('仅 assignee 有 running 任务 → busy；仅会话挂靠无任务 → idle', () => {
    const tasks: AgentRosterTask[] = [{ id: 't1', title: '跑测试', assignee: 'kimi', status: 'running' }]
    const sessions: AgentRosterSession[] = [{ id: 's1', agent: 'minimax' }, { id: 's2', agent: 'minimax' }]
    const rows = buildAgentRoster([], tasks, sessions)
    const byName = Object.fromEntries(rows.map(r => [r.name, r]))
    expect(byName['kimi'].busyState).toBe('busy')
    expect(byName['kimi'].source).toBe('assignee')
    expect(byName['minimax'].busyState).toBe('idle')
    expect(byName['minimax'].sessionCount).toBe(2)
  })

  it('名册排序：busy → online → idle → offline；同档按名', () => {
    const platforms = [pf('a-online', 'running'), pf('z-offline', 'stopped')]
    const tasks: AgentRosterTask[] = [{ id: 't1', title: 'x', assignee: 'b-busy', status: 'running' }]
    const sessions: AgentRosterSession[] = [{ id: 's1', agent: 'c-idle' }]
    const rows = buildAgentRoster(platforms, tasks, sessions)
    expect(rows.map(r => r.busyState)).toEqual(['busy', 'online', 'idle', 'offline'])
  })

  it('名归一：大小写/空格归一后合并', () => {
    const platforms = [pf('Codex', 'running')]
    const tasks: AgentRosterTask[] = [{ id: 't1', title: 'x', assignee: ' codex ', status: 'running' }]
    const rows = buildAgentRoster(platforms, tasks, [])
    expect(rows).toHaveLength(1)
    expect(rows[0].busyState).toBe('busy')
  })
})

describe('R7-C 接线锚点', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('FlowNavPanel agents 区（props.agents + 四态点 + 在跑/会话数）', () => {
    const nav = readFileSync(resolve(overlayRoot, 'custom/client/ia2/components/flow/FlowNavPanel.vue'), 'utf8')
    expect(nav).toContain('props.agents')
    expect(nav).toContain('flow-group-agents')
    expect(nav).toContain('a.activeTask')
    expect(nav).toContain('a.sessionCount')
  })

  it('WorkbenchView agentRoster + useSharedArm platforms retain/release', () => {
    const wb = readFileSync(resolve(overlayRoot, 'custom/client/ia2/views/WorkbenchView.vue'), 'utf8')
    expect(wb).toContain('buildAgentRoster')
    expect(wb).toContain(':agents="agentRoster"')
    const arm = readFileSync(resolve(overlayRoot, 'custom/client/ia2/composables/useSharedArm.ts'), 'utf8')
    expect(arm).toContain('usePlatformsStore().retain()')
    expect(arm).toContain('usePlatformsStore().release()')
  })

  it('patch 354 双语含 groupAgents + agents 键；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/354-client-i18n-ia2-agents.patch'), 'utf8')
    for (const key of ['groupAgents', 'sessions', 'busy', 'offline']) {
      expect(patch).toContain(key)
    }
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('354-client-i18n-ia2-agents.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('354-client-i18n-ia2-agents.patch')
  })
})
