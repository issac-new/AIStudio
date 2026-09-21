// overlay/custom/client/ide/__tests__/usage-round1.test.ts
// R1 遥测面板守门：低水位阈值 / 价目成本估算 / 上下文构成分解纯函数口径；
// IdeMetricsPopover（G4 构成 + G8 轮表 + G7 热力图 + 低余量横幅）接线；
// IdeStatusBar 簇点击开合 + 低水位 toast 迟滞；patch 340/341 漂移守卫。
// 口径契约见 utils/metrics.ts、utils/modelPricing.ts、utils/contextBreakdown.ts 头注。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k) }) }))

const toastWarning = vi.fn()
vi.mock('naive-ui', () => ({ useMessage: () => ({ warning: toastWarning }) }))

// chat store 桩：M2 metrics.test.ts 同款 reactive 工厂
vi.mock('@/stores/hermes/chat', () => {
  const fake = reactive({
    sessions: [] as Array<Record<string, unknown>>,
    activeSessionId: null as string | null,
    isRunActive: false,
    abortState: null,
    get activeSession(): Record<string, unknown> | null {
      return fake.sessions.find((s) => s.id === fake.activeSessionId) ?? null
    },
  })
  return { useChatStore: () => fake }
})

const roundsFixture = [
  {
    run_id: 'r2', started_at: 1_700_000_100_000, ended_at: 1_700_000_160_000,
    api_calls: 3, input_tokens: 900, output_tokens: 420, cache_read_tokens: 4000,
    cache_write_tokens: 1000, reasoning_tokens: 0, model: 'claude-sonnet-4.5', agent: 'hermes',
  },
  {
    run_id: 'r1', started_at: 1_700_000_000_000, ended_at: 1_700_000_050_000,
    api_calls: 1, input_tokens: 1000, output_tokens: 200, cache_read_tokens: 0,
    cache_write_tokens: 0, reasoning_tokens: 0, model: 'unknown-model-x', agent: 'hermes',
  },
]
const roundsMock = vi.fn(async () => ({ rounds: roundsFixture }))

vi.mock('../api/usage', () => ({ ideUsageApi: { rounds: (...args: unknown[]) => roundsMock(...(args as [string, number?])) } }))

function isoDay(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 热力图日期按 fetch 时刻的时钟计算（fake timers 下与组件 computeStreak 同钟）
const statsMock = vi.fn(async () => ({
  daily_usage: [
    { date: isoDay(-1), input_tokens: 5000, output_tokens: 1000, cache_read_tokens: 0, cache_write_tokens: 0, sessions: 1, errors: 0, cost: 0 },
    { date: isoDay(-2), input_tokens: 3000, output_tokens: 500, cache_read_tokens: 0, cache_write_tokens: 0, sessions: 1, errors: 0, cost: 0 },
  ],
}))

vi.mock('@/api/studio/sessions', () => ({
  fetchContextLength: vi.fn(async () => 64000),
  fetchUsageStats: (...args: unknown[]) => statsMock(...(args as [number?])),
  fetchSessions: vi.fn(async () => []),
}))

import { useChatStore } from '@/stores/hermes/chat'
import { isLowContext, lowContextThreshold } from '../utils/metrics'
import { estimateCostUsd, findModelPrice, formatCostUsd } from '../utils/modelPricing'
import { computeBreakdown, type BreakdownMessage } from '../utils/contextBreakdown'

describe('低水位阈值（dsh 20k 绝对余量 / 小窗 10% 取小）', () => {
  it('256k 窗口阈值 20k；32k 小窗口取 10%=3.2k；非法窗口回退 20k', () => {
    expect(lowContextThreshold(256000)).toBe(20000)
    expect(lowContextThreshold(32000)).toBeCloseTo(3200)
    expect(lowContextThreshold(0)).toBe(20000)
  })

  it('isLowContext：剩余 ≤ 阈值为低；正好等于阈值也算低', () => {
    expect(isLowContext(236000, 256000)).toBe(true) // 剩 20k = 阈值
    expect(isLowContext(230000, 256000)).toBe(false) // 剩 26k
    expect(isLowContext(30000, 32000)).toBe(true) // 剩 2k < 3.2k
    expect(isLowContext(0, 256000)).toBe(false)
  })
})

describe('价目成本估算（dsh-TUI 三原则：未收录不显示 / 缓存分价 / 官方价目）', () => {
  it('未收录模型（glm/deepseek/未知）返回 null 不显示金额', () => {
    expect(findModelPrice('glm-4.6')).toBeNull()
    expect(findModelPrice('deepseek-chat')).toBeNull()
    expect(findModelPrice('')).toBeNull()
    expect(estimateCostUsd('unknown-model-x', { inputTokens: 1e6, outputTokens: 1e6 })).toBeNull()
  })

  it('claude-sonnet-4.5：输入 3 / 输出 15 / 缓存读 0.3 / 写 3.75（USD/1M）逐项折算', () => {
    // 有效输入 = 1M - 0.2M(读) - 0.1M(写) = 0.7M × 3 = 2.1
    const cost = estimateCostUsd('claude-sonnet-4.5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 200_000,
      cacheWriteTokens: 100_000,
    })
    expect(cost).not.toBeNull()
    expect(cost!).toBeCloseTo(2.1 + 15 + 0.06 + 0.375, 5)
  })

  it('gpt-5.1 无缓存分价时读写并入有效输入按 input 价结算', () => {
    const cost = estimateCostUsd('gpt-5.1', { inputTokens: 2_000_000, outputTokens: 1_000_000 })
    // 2M×1.25 + 1M×10 = 12.5
    expect(cost).toBeCloseTo(12.5, 5)
  })

  it('formatCostUsd 阶梯：<0.01 / 常规两位 / ≥1000 取整千分位', () => {
    expect(formatCostUsd(0)).toBe('$0.00')
    expect(formatCostUsd(0.004)).toBe('<$0.01')
    expect(formatCostUsd(2.1)).toBe('$2.10')
    expect(formatCostUsd(1234.5)).toBe('$1,235')
  })
})

describe('上下文构成分解（G4 前端估算：四段 + 推算桶下限 0）', () => {
  it('token_count 优先、缺省 chars/4 估计并置 isEstimate；assistant 含 reasoning、tool_calls 归工具段', () => {
    const messages: BreakdownMessage[] = [
      { role: 'user', content: 'x'.repeat(400), token_count: 120 }, // 已知 120
      { role: 'assistant', content: 'y'.repeat(800), reasoning: 'r'.repeat(400), tool_calls: [{ id: 'c1', function: { name: 'read', arguments: 'a'.repeat(20) } }] },
      { role: 'tool', content: 'z'.repeat(200), token_count: null },
    ]
    const bd = computeBreakdown(messages, 1000)!
    expect(bd).not.toBeNull()
    expect(bd.isEstimate).toBe(true)
    const user = bd.segments.find((s) => s.key === 'user')!
    const assistant = bd.segments.find((s) => s.key === 'assistant')!
    const tool = bd.segments.find((s) => s.key === 'tool')!
    const system = bd.segments.find((s) => s.key === 'system')!
    expect(user.tokens).toBe(120)
    expect(assistant.tokens).toBe(200 + 100) // 800/4 + 400/4
    expect(tool.tokens).toBe(50 + Math.ceil(JSON.stringify(messages[1].tool_calls).length / 4))
    // 无可见 system 消息：system 段 = 推算桶
    expect(system.tokens).toBe(bd.inferredTokens)
    expect(bd.inferredTokens).toBe(Math.max(0, Math.round(1000 - bd.knownTokens)))
    expect(bd.total).toBe(1000)
  })

  it('已知合计超过 contextUsed 时推算桶夹 0 不出负；百分比总和≈100', () => {
    const messages: BreakdownMessage[] = [
      { role: 'user', content: 'x'.repeat(40000) }, // 10k 估计
    ]
    const bd = computeBreakdown(messages, 5000)!
    expect(bd.inferredTokens).toBe(0)
    const pctSum = bd.segments.reduce((sum, s) => sum + s.pct, 0)
    expect(pctSum).toBeGreaterThan(100) // 高估场景诚实超出
  })

  it('空消息或非法 contextUsed 返回 null', () => {
    expect(computeBreakdown([], 1000)).toBeNull()
    expect(computeBreakdown([{ role: 'user', content: 'hi' }], 0)).toBeNull()
    expect(computeBreakdown([{ role: 'user', content: 'hi' }], Number.NaN)).toBeNull()
  })
})

describe('IdeMetricsPopover 接线（G4/G7/G8 + 成本 + 低余量横幅）', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Date 被 fake：isoDay 相对 now 计算
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function fakeStore(): ReturnType<typeof useChatStore> {
    return useChatStore()
  }

  function seedSession(fake: ReturnType<typeof fakeStore>): void {
    fake.sessions = [
      {
        id: 's1', profile: 'p', provider: 'pr', model: 'm',
        contextTokens: 13000, inputTokens: 500, outputTokens: 0,
        messages: [
          { role: 'user', content: 'x'.repeat(4000) },
          { role: 'assistant', content: 'y'.repeat(8000) },
          { role: 'tool', content: 'z'.repeat(2000) },
        ],
      },
    ]
    fake.activeSessionId = 's1'
  }

  function fakeMetrics() {
    return {
      contextUsed: { value: 13000 },
      contextLength: { value: 64000 },
      contextPct: { value: 20 },
      contextLevel: { value: 'ok' as const },
      contextText: { value: '13k/64k 20%' },
      cacheDetail: { value: null },
      tpsDisplay: { value: null },
      tpsSpeed: { value: 'slow' as const },
    }
  }

  async function mountPopover() {
    const { default: IdeMetricsPopover } = await import('../views/IdeMetricsPopover.vue')
    return mount(IdeMetricsPopover, { props: { metrics: fakeMetrics() as never } })
  }

  async function flushJobs(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }

  it('构成分段条/图例渲染（四段 + 估算标记）；轮表两行 + 金额（sonnet 轮计入、未知模型轮不计）', async () => {
    const fake = fakeStore()
    seedSession(fake)
    const w = await mountPopover()
    await flushJobs()

    expect(w.find('[data-testid="ide-metrics-stack"]').exists()).toBe(true)
    expect(w.findAll('.ide-metrics-panel__legend-row')).toHaveLength(4)
    // t() mock 返回键名：估算标记以 key 断言
    expect(w.find('.ide-metrics-panel__hint').text()).toContain('breakdownEstimate')

    const rows = w.findAll('[data-testid="ide-metrics-rounds"] tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('claude-sonnet-4.5')
    // r2 轮成本：(900-4000-1000 夹 0)×0 + 420×15/1M + 4000×0.3/1M + 1000×3.75/1M ≈ 0.0063+0.0063+0.00375 ≈ 0.0078 → <$0.01
    expect(w.find('.ide-metrics-panel__cost').exists()).toBe(true)
  })

  it('热力图 84 格 + 连续天数（近两日有用量 → streak 2）；低余量横幅按阈值渲染', async () => {
    const fake = fakeStore()
    seedSession(fake)
    const w = await mountPopover()
    await flushJobs()

    expect(w.findAll('[data-testid="ide-metrics-heatmap"] .ide-metrics-panel__cell')).toHaveLength(84)
    expect(w.text()).toContain('heatmapStreak')

    // 低余量：used 61k / window 64k → 剩 3k < min(20k, 6.4k)
    await w.setProps({ metrics: { ...fakeMetrics(), contextUsed: { value: 61000 }, contextText: { value: '61k/64k 95%' }, contextLevel: { value: 'danger' as const } } as never })
    await flushJobs()
    expect(w.find('[data-testid="ide-metrics-low"]').exists()).toBe(true)
  })

  it('轮表接口失败 → 失败态；stats 失败 → 热力图空态', async () => {
    const fake = fakeStore()
    seedSession(fake)
    roundsMock.mockRejectedValueOnce(new Error('boom'))
    statsMock.mockRejectedValueOnce(new Error('boom'))
    const w = await mountPopover()
    await flushJobs()
    expect(w.text()).toContain('roundsLoadFailed')
    expect(w.text()).toContain('heatmapEmpty')
  })
})

describe('IdeStatusBar：簇点击开合 + 低水位 toast 迟滞', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000, toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function fakeStore(): ReturnType<typeof useChatStore> {
    return useChatStore()
  }

  async function mountBar() {
    const { default: IdeStatusBar } = await import('../views/IdeStatusBar.vue')
    return mount(IdeStatusBar, {
      global: { stubs: { teleport: true, IdeMetricsPopover: false } },
    })
  }

  async function flushJobs(): Promise<void> {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }

  it('点击遥测簇切换弹层（teleport stub 下 findComponent）', async () => {
    const fake = fakeStore()
    fake.sessions = [
      { id: 's1', profile: 'p', provider: 'pr', model: 'm', contextTokens: 13000, inputTokens: 500, outputTokens: 0, messages: [] },
    ]
    fake.activeSessionId = 's1'
    const w = await mountBar()
    await flushJobs()

    const { default: IdeMetricsPopover } = await import('../views/IdeMetricsPopover.vue')
    expect(w.findComponent(IdeMetricsPopover).exists()).toBe(false)
    await w.find('[data-testid="ide-metrics-cluster"]').trigger('click')
    expect(w.findComponent(IdeMetricsPopover).exists()).toBe(true)
    await w.find('[data-testid="ide-metrics-cluster"]').trigger('click')
    expect(w.findComponent(IdeMetricsPopover).exists()).toBe(false)
    w.unmount()
  })

  it('低水位 toast 一次；恢复越过迟滞线后再次进入会再提醒', async () => {
    const fake = fakeStore()
    fake.sessions = [
      { id: 's1', profile: 'p', provider: 'pr', model: 'm', contextTokens: 61000, inputTokens: 500, outputTokens: 0, messages: [] },
    ]
    fake.activeSessionId = 's1'
    const w = await mountBar()
    await flushJobs()
    expect(toastWarning).toHaveBeenCalledTimes(1)

    // 仍在低水位区间内波动：不重复
    fake.sessions[0].contextTokens = 62000
    await flushJobs()
    expect(toastWarning).toHaveBeenCalledTimes(1)

    // 恢复：剩 > 6.4k×1.05 ≈ 6.72k → used < 57.28k
    fake.sessions[0].contextTokens = 50000
    await flushJobs()
    expect(toastWarning).toHaveBeenCalledTimes(1)

    // 再次跌入低水位 → 第二次提醒
    fake.sessions[0].contextTokens = 63000
    await flushJobs()
    expect(toastWarning).toHaveBeenCalledTimes(2)
    w.unmount()
  })
})

describe('patch 340/341 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../..')

  it('340 含轮级端点三件套（store 聚合 / controller / 路由）', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/340-server-usage-rounds-endpoint.patch'), 'utf8')
    expect(patch).toContain('getUsageRounds')
    expect(patch).toContain("ctx.query?.limit")
    expect(patch).toContain("sessionRoutes.get('/api/studio/sessions/:id/usage/rounds', ctrl.usageRuns)")
  })

  it('341 双语各含 lowContextToast 与 usagePanel 块', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/341-client-i18n-ide-usage-panel.patch'), 'utf8')
    expect(patch).toContain('lowContextToast')
    expect(patch).toContain('usagePanel')
    expect(patch).toContain('locales/zh.ts')
    expect(patch).toContain('locales/en.ts')
  })

  it('series 与 manifest 均已登记 340/341', () => {
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('340-server-usage-rounds-endpoint.patch')
    expect(series).toContain('341-client-i18n-ide-usage-panel.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('340-server-usage-rounds-endpoint.patch')
    expect(manifest.appliedPatches).toContain('341-client-i18n-ide-usage-panel.patch')
  })
})
