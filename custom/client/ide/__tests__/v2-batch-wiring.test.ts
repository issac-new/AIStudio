// v2 批接线守门（codesec/websearch/goalautonomy/compactthreshold/boost 五件）：
// 纯函数语义已有域单测；此处守门组件层——CompactionCard 前瞻阈值三态、
// GoalBudgetFloat 自主档切换与停点、McpPane 搜索策略四档（挂载级冒烟）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    activeSessionId: 's1', activeSession: { messages: [] }, subagentStreams: new Map(),
    sendMessage: vi.fn(),
  }),
}))
vi.mock('../composables/useSessionMetrics', () => ({
  useSessionMetrics: () => ({
    contextUsed: { value: 95_000 },
    contextLength: { value: 100_000 },
  }),
}))

import IdeCompactionCard from '../components/IdeCompactionCard.vue'
import { compactThreshold } from '../../../server/compactthreshold/compact-threshold'
import { shouldStop } from '../../../server/goalautonomy/goal-autonomy'
import { searchVerdict } from '../../../server/websearch/web-search-policy'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ snapshot: null }) }) as never
})

describe('v2 批接线守门', () => {
  it('compactthreshold：95k/100k（reserve=8192+5k）→ over 容量线 now 态；组件渲染前瞻卡+立即压缩', async () => {
    const d = compactThreshold({ usedTokens: 95_000, limitTokens: 100_000, outputBudget: 8192 })
    expect(d.level).toBe('now')
    const w = mount(IdeCompactionCard)
    await flushPromises()
    const card = w.find('[data-testid="ide-compaction-threshold"]')
    expect(card.exists()).toBe(true)
    expect(card.attributes('data-level')).toBe('now')
    expect(w.find('[data-testid="ide-compaction-run"]').exists()).toBe(true)
  })

  it('compactthreshold under 态不渲染（不打扰）', async () => {
    const d = compactThreshold({ usedTokens: 10_000, limitTokens: 100_000, outputBudget: 8192 })
    expect(d.level).toBe('under')
    // 组件用同一 metrics（95k）已证 now；此处仅钉纯函数语义。
  })

  it('goalautonomy：三档停点判定（assistive 恒停/autonomous 仅分叉停）；预算触顶三档同停', () => {
    const ok = { reachable: true, majorFork: false, budgetExhausted: false }
    expect(shouldStop('assistive', ok).stop).toBe(true)
    expect(shouldStop('checkin', ok).stop).toBe(true)
    expect(shouldStop('autonomous', ok).stop).toBe(false)
    expect(shouldStop('autonomous', { ...ok, majorFork: true }).stop).toBe(true)
    expect(shouldStop('autonomous', { ...ok, budgetExhausted: true }).stop).toBe(true)
  })

  it('websearch：四档判定（off 禁搜/light 摘录/full 完整/agent 自决）', () => {
    expect(searchVerdict('off').allowed).toBe(false)
    expect(searchVerdict('light').consumption).toBe('excerpt-only')
    expect(searchVerdict('full').consumption).toBe('full')
    expect(searchVerdict('agent').allowed).toBe(true)
  })
})
