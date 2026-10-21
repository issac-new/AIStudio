// @vitest-environment jsdom
// UsageInsightsExtension 守门（P4）：热力图网格/KPI/会话卡三块 + fail-soft。
// store 用真 Pinia 形状的最小桩（dailyUsage/cacheHitRate 已是 computed 出参形态）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const storeState = vi.hoisted(() => ({
  dailyUsage: [] as Array<{ date: string; visualTokens: number; sessions: number }>,
  cacheHitRate: null as number | null,
}))
vi.mock('@/stores/hermes/usage', () => ({
  useUsageStore: () => storeState,
}))

const cardsResult = vi.hoisted(() => ({
  ok: true,
  available: true,
  cards: [
    { sessionId: 's-1', title: '会话一', agent: 'main', model: 'm', hasParent: false, messageCount: 3, toolCallCount: 1, billedTokens: 900, cacheHitPercent: 60, costUsd: 0.5, lastActive: 2, isArchived: false },
    { sessionId: 's-2', title: '子会话', agent: 'sub', model: 'm', hasParent: true, messageCount: 1, toolCallCount: 0, billedTokens: 300, cacheHitPercent: null, costUsd: 0.1, lastActive: 1, isArchived: true },
  ],
}))
vi.mock('@/api/client', () => ({
  request: vi.fn(async () => cardsResult),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))

import UsageInsightsExtension from '../components/UsageInsightsExtension.vue'

function todayKey(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

beforeEach(() => {
  vi.clearAllMocks()
  storeState.dailyUsage = []
  storeState.cacheHitRate = null
  cardsResult.cards = [
    { sessionId: 's-1', title: '会话一', agent: 'main', model: 'm', hasParent: false, messageCount: 3, toolCallCount: 1, billedTokens: 900, cacheHitPercent: 60, costUsd: 0.5, lastActive: 2, isArchived: false },
    { sessionId: 's-2', title: '子会话', agent: 'sub', model: 'm', hasParent: true, messageCount: 1, toolCallCount: 0, billedTokens: 300, cacheHitPercent: null, costUsd: 0.1, lastActive: 1, isArchived: true },
  ]
})

describe('UsageInsightsExtension', () => {
  it('热力图：84 天网格按本期日数据分档', async () => {
    storeState.dailyUsage = [
      { date: todayKey(0), visualTokens: 1000, sessions: 2 },
      { date: todayKey(2), visualTokens: 200, sessions: 1 },
    ]
    const w = mount(UsageInsightsExtension)
    await flushPromises()
    const cells = w.findAll('.uie__cell')
    expect(cells).toHaveLength(84)
    // 今日 1000=峰值 → l4；前天 200/1000=20% → l1；无数据日 → l0
    expect(cells.at(-1)!.classes()).toContain('is-l4')
  })

  it('缓存命中率 KPI 直读 store', async () => {
    storeState.cacheHitRate = 66.6
    const w = mount(UsageInsightsExtension)
    await flushPromises()
    expect(w.find('[data-testid="uie-cache-kpi"]').text()).toContain('67%')
  })

  it('会话卡渲染两张：子会话标记/归档标记/命中空显示 —', async () => {
    const w = mount(UsageInsightsExtension)
    await flushPromises()
    expect(w.find('[data-testid="uie-session-s-1"]').exists()).toBe(true)
    const s2 = w.find('[data-testid="uie-session-s-2"]')
    expect(s2.exists()).toBe(true)
    expect(s2.text()).toContain('子')
    expect(s2.text()).toContain('档')
    expect(s2.text()).toContain('—')
  })

  it('fail-soft：无日数据/无命中率/会话卡接口失败各自空态', async () => {
    cardsResult.cards = []
    const { request } = await import('@/api/client')
    vi.mocked(request).mockRejectedValueOnce(new Error('down'))
    const w = mount(UsageInsightsExtension)
    await flushPromises()
    expect(w.find('[data-testid="uie-heatmap"]').text()).toContain('本期无按日数据')
    expect(w.find('[data-testid="uie-cache-kpi"]').text()).toContain('—')
    expect(w.find('[data-testid="uie-sessions-error"]').exists()).toBe(true)
  })
})
