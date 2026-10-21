// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/ide-context-pane.test.ts
// 上下文透视页签守门（context-insights P1）：统计汇总/组成分区同源渲染/压缩留痕内嵌/
// 每轮表/档案互链 + fail-soft（无遥测、台账空、台账错）。数据面由 mock 提供，
// 真实端点守门在 server 侧（tokens/__tests__）与 api 层。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const chat = vi.hoisted(() => ({
  activeSessionId: 'sess-ctx-1' as string | null,
  activeSession: { messages: [
    { role: 'system', content: 'sys', token_count: 100 },
    { role: 'user', content: '问一句', token_count: 200 },
    { role: 'assistant', content: '答一句', token_count: 400, reasoning: null },
    { role: 'tool', content: 'tool-out', token_count: 300 },
  ] },
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chat }))

const metrics = vi.hoisted(() => ({ contextUsed: { value: 1000 }, contextLength: { value: 8000 } }))
vi.mock('../composables/useSessionMetrics', () => ({ useSessionMetrics: () => metrics }))

const setSidePaneTab = vi.hoisted(() => vi.fn())
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ setSidePaneTab }) }))

const roundsResult = vi.hoisted(() => ({
  rounds: [
    { run_id: 'r1', started_at: 1, ended_at: 2, api_calls: 1, input_tokens: 300, output_tokens: 100, cache_read_tokens: 100, cache_write_tokens: 0, reasoning_tokens: 0, model: 'known-model', agent: 'main' },
    { run_id: 'r2', started_at: 3, ended_at: 5, api_calls: 1, input_tokens: 200, output_tokens: 50, cache_read_tokens: 0, cache_write_tokens: 50, reasoning_tokens: 0, model: 'unknown-model', agent: 'main' },
  ],
}))

const trendResult = vi.hoisted(() => ({
  ok: true,
  available: true,
  usageAligned: 'run' as const,
  isEstimate: false,
  truncated: false,
  charsPerToken: 4,
  steps: [
    { seq: 3, turn: 1, runId: 'r1', buckets: { system: 100, user: 200, assistant: 300, tool: 0 }, total: 600, usage: { input: 300, output: 100, cacheRead: 100, cacheWrite: 0, model: 'known-model' } },
    { seq: 5, turn: 2, runId: 'r2', buckets: { system: 100, user: 200, assistant: 400, tool: 400 }, total: 1100, usage: { input: 200, output: 50, cacheRead: 0, cacheWrite: 50, model: 'unknown-model' } },
  ],
  events: [{ kind: 'compaction' as const, throughMessageId: 3, foldedMessages: 2 }],
}))

vi.mock('../api/usage', () => ({
  ideUsageApi: {
    rounds: vi.fn(async () => roundsResult),
    contextTrend: vi.fn(async () => trendResult),
  },
}))

vi.mock('../utils/modelPricing', () => ({
  estimateCostUsd: vi.fn((model: string) => (model === 'known-model' ? 0.002 : null)),
  formatCostUsd: (c: number) => `$${c.toFixed(3)}`,
}))

const authFetch = vi.hoisted(() => vi.fn(async (path: string) => {
  if (path.startsWith('/api/ide/compaction-trace/')) return { ok: true, status: 200, json: async () => ({ snapshot: null }) }
  return { ok: false, status: 404, json: async () => ({}) }
}))
vi.mock('../utils/auth-fetch', () => ({ authFetch }))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))

import IdeContextPane from '../views/IdeContextPane.vue'
import { ideUsageApi } from '../api/usage'

beforeEach(() => {
  vi.clearAllMocks()
  chat.activeSessionId = 'sess-ctx-1'
  metrics.contextUsed.value = 1000
  metrics.contextLength.value = 8000
  roundsResult.rounds = [
    { run_id: 'r1', started_at: 1, ended_at: 2, api_calls: 1, input_tokens: 300, output_tokens: 100, cache_read_tokens: 100, cache_write_tokens: 0, reasoning_tokens: 0, model: 'known-model', agent: 'main' },
    { run_id: 'r2', started_at: 3, ended_at: 5, api_calls: 1, input_tokens: 200, output_tokens: 50, cache_read_tokens: 0, cache_write_tokens: 50, reasoning_tokens: 0, model: 'unknown-model', agent: 'main' },
  ]
})

function mountPane() {
  return mount(IdeContextPane)
}

describe('IdeContextPane 金路径', () => {
  it('统计汇总渲染轮数/tokens/命中率（口径=台账行）', async () => {
    const w = mountPane()
    await flushPromises()
    // 命中率 = 100/(300+100+0 + 200+0+50) = 100/650 ≈ 15%
    expect(w.find('[data-testid="ide-ctxpane-stats-rounds"]').text()).toBe('2')
    expect(w.find('[data-testid="ide-ctxpane-stats-hit"]').text()).toBe('15%')
    // 计费 tokens 口径同 roundsSummary：Σ(in+cacheWrite+out+cacheRead) = (300+0+100+100)+(200+50+50+0) = 800
    expect(w.find('[data-testid="ide-ctxpane-stats-tokens"]').text()).toContain('800')
  })

  it('当前组成四段渲染且与 IdeContextBar 同源（computeBreakdown）', async () => {
    const w = mountPane()
    await flushPromises()
    // 已知 1000 全归因：user200/assistant400/tool300/system100，无推算
    expect(w.find('[data-testid="ide-ctxpane-seg-user"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-seg-assistant"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-seg-tool"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-seg-system"]').exists()).toBe(true)
  })

  it('每轮表倒序两行；未收录价目费用列显示 —', async () => {
    const w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-ctxpane-round-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-round-0"]').exists()).toBe(true)
    // round-1（unknown-model）费用未收录 → —；round-0（known-model）→ $0.002
    expect(w.find('[data-testid="ide-ctxpane-round-1"]').text()).toContain('—')
    expect(w.find('[data-testid="ide-ctxpane-round-0"]').text()).toContain('$0.002')
  })

  it('档案互链：点击切 ctxarchive 页签', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-ctxpane-archive-link"]').trigger('click')
    expect(setSidePaneTab).toHaveBeenCalledWith('ctxarchive')
  })

  it('趋势条带渲染两柱，压缩标记落在首个 seq≥压点的柱上', async () => {
    const w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-ctxpane-trend-bar-3"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-trend-bar-5"]').exists()).toBe(true)
    // 压点 throughMessageId=3 → 标记柱 seq=3
    expect(w.find('[data-testid="ide-ctxpane-trend-bar-3"]').classes()).toContain('is-marked')
    expect(w.find('[data-testid="ide-ctxpane-trend-bar-5"]').classes()).not.toContain('is-marked')
  })
})

describe('IdeContextPane fail-soft', () => {
  it('无遥测（contextUsed=0）：组成分区显示无遥测，不显示 0%', async () => {
    metrics.contextUsed.value = 0
    const w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-ctxpane-comp-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-seg-user"]').exists()).toBe(false)
  })

  it('台账空：统计汇总空态而非编造 0', async () => {
    roundsResult.rounds = []
    const w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-ctxpane-stats-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-ctxpane-stats-rounds"]').exists()).toBe(false)
  })

  it('台账不可用：错误态可见不阻断', async () => {
    vi.mocked(ideUsageApi.rounds).mockRejectedValueOnce(new Error('down'))
    const w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-ctxpane-stats-error"]').exists()).toBe(true)
  })
})
