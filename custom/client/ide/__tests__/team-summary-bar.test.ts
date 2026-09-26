// team 汇总条守门（UI-4：六态映射/健康色/stale 判定/空态不渲染）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const streamsMap = new Map<string, Record<string, unknown>>()
const state = { activeSessionId: 's1' as string | null }
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    get activeSessionId() { return state.activeSessionId },
    subagentStreams: streamsMap,
  }),
}))

import IdeTeamSummaryBar from '../components/IdeTeamSummaryBar.vue'

const NOW = Date.now()
function stream(id: string, status: string, updatedAt = NOW): Record<string, unknown> {
  return { sessionId: 's1', subagentId: id, status, updatedAt, startedAt: NOW - 60000 }
}

describe('IdeTeamSummaryBar（汇总条）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    streamsMap.clear()
    state.activeSessionId = 's1'
  })

  it('空/无会话不渲染；有流出行文含计数', () => {
    expect(mount(IdeTeamSummaryBar).find('[data-testid="ide-team-summary-bar"]').exists()).toBe(false)
    streamsMap.set('s1:a', stream('a', 'completed'))
    streamsMap.set('s1:b', stream('b', 'running'))
    const w = mount(IdeTeamSummaryBar)
    expect(w.text()).toContain('2 agents')
    expect(w.text()).toContain('1 running')
    expect(w.text()).toContain('1 done')
  })

  it('六态映射+健康色：failed→红；stale（running 超 5 分钟）→黄；全绿', () => {
    streamsMap.set('s1:a', stream('a', 'completed'))
    streamsMap.set('s1:b', stream('b', 'interrupted'))
    streamsMap.set('s1:c', stream('c', 'cancelled'))
    const red = mount(IdeTeamSummaryBar)
    expect(red.classes()).toContain('is-red')
    expect(red.text()).toContain('2 failed')

    streamsMap.clear()
    streamsMap.set('s1:a', stream('a', 'running', NOW - 6 * 60 * 1000))
    const amber = mount(IdeTeamSummaryBar)
    expect(amber.classes()).toContain('is-amber')
    expect(amber.text()).toContain('1 stale')

    streamsMap.clear()
    streamsMap.set('s1:a', stream('a', 'completed'))
    expect(mount(IdeTeamSummaryBar).classes()).toContain('is-green')
  })
})
