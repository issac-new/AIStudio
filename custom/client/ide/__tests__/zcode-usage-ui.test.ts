// overlay/custom/client/ide/__tests__/zcode-usage-ui.test.ts
// 本机 zcode 用量账本轮守门（2026-10-21 dsh-context 数据面吸收）：
//   价目：GLM/DeepSeek 等新补录行 + 订阅 provider 判定 + 旧未收录回归锚
//   IdeCliSessions：用量徽渲染 / 账单展开（逐轮 TTFT + 工具时间线 + 成本与
//                   订阅说明）/ 用量端点失败 fail-soft（列表不受影响）
//   IdeMetricsPopover：本机 zcode 账本分区（KPI/按模型表订阅徽/全链路构成/
//                   时间窗切换重拉）
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k) }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ warning: vi.fn() }) }))

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

vi.mock('../api/usage', () => ({ ideUsageApi: { rounds: vi.fn(async () => ({ rounds: [] })) } }))
vi.mock('@/api/studio/sessions', () => ({
  fetchContextLength: vi.fn(async () => 64000),
  fetchUsageStats: vi.fn(async () => ({ daily_usage: [], model_usage: [] })),
  fetchSessions: vi.fn(async () => []),
}))

// ── zcode 用量端点 mock（账本轮被测面）──
const summaryMock = vi.fn(async (days: number) => ({
  days,
  fromMs: null,
  kpi: {
    sessions: 42, turns: 100, modelCalls: 900, modelErrors: 3, toolCalls: 700, toolErrors: 5,
    turnErrors: 2, cacheHitRate: 0.9, activeMs: 3_600_000,
    inputTokens: 1_000_000, outputTokens: 200_000, reasoningTokens: 100_000,
    cacheWriteTokens: 100_000, cacheReadTokens: 9_000_000, billedTokens: 10_400_000,
  },
  byDay: [
    { day: '2026-10-20', billedTokens: 5_000_000, modelCalls: 400 },
    { day: '2026-10-21', billedTokens: 5_400_000, modelCalls: 500 },
  ],
  byModel: [
    { provider: 'bigmodel-api', model: 'GLM-5.3', calls: 500, errors: 0, inputTokens: 500_000, outputTokens: 100_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 5_000_000, billedTokens: 6_600_000 },
    { provider: 'account:bigmodel-individual-coding-plan', model: 'GLM-5.3', calls: 100, errors: 0, inputTokens: 100_000, outputTokens: 20_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 1_000_000, billedTokens: 1_120_000 },
    { provider: 'deepseek', model: 'deepseek-flash', calls: 300, errors: 3, inputTokens: 400_000, outputTokens: 80_000, reasoningTokens: 0, cacheWriteTokens: 100_000, cacheReadTokens: 3_000_000, billedTokens: 3_580_000 },
  ],
  byAgent: [
    { agent: 'zcode-agent', calls: 800, billedTokens: 9_000_000 },
    { agent: 'zcode-general-purpose', calls: 100, billedTokens: 1_400_000 },
  ],
  bySource: [
    { source: 'main_turn', calls: 800, billedTokens: 9_000_000 },
    { source: 'subagent', calls: 100, billedTokens: 1_400_000 },
  ],
}))

const zcSessionsMock = vi.fn(async () => ({
  sessions: [
    {
      id: 'sess_a1', title: '修复构建', directory: '/Users/x/lab/proj', taskType: 'interactive',
      parentId: null, isSubagent: false, timeCreated: 0, timeUpdated: Date.now() - 3_600_000,
      turns: 12, modelCalls: 88, toolCalls: 70, turnErrors: 1, firstAt: 0, lastAt: Date.now() - 3_600_000,
      inputTokens: 900_000, outputTokens: 90_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 8_000_000, billedTokens: 8_990_000,
    },
  ],
}))

const zcRoundsMock = vi.fn(async () => ({
  rounds: [
    {
      turnId: 't1', status: 'completed', startedAt: Date.now() - 600_000, completedAt: Date.now() - 500_000,
      durationMs: 100_000, ttftMs: 1_293, modelRequestCount: 2, toolCallCount: 4, toolErrorCount: 0,
      errorType: '', errorCode: '',
      models: [
        { provider: 'bigmodel-api', model: 'GLM-5.3', calls: 2, inputTokens: 100_000, outputTokens: 10_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 1_000_000, billedTokens: 1_110_000 },
      ],
    },
    {
      turnId: 't2', status: 'error', startedAt: Date.now() - 60_000, completedAt: null,
      durationMs: 9_401, ttftMs: null, modelRequestCount: 1, toolCallCount: 0, toolErrorCount: 0,
      errorType: 'provider_error', errorCode: 'E502',
      models: [
        { provider: 'account:bigmodel-individual-coding-plan', model: 'GLM-5.3', calls: 1, inputTokens: 50_000, outputTokens: 5_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 500_000, billedTokens: 555_000 },
      ],
    },
  ],
}))

const zcToolsMock = vi.fn(async () => ({
  tools: [
    { id: 'to1', turnId: 't1', toolName: 'Bash', status: 'completed', startedAt: 1, completedAt: 2, durationMs: 1_200, readOnly: false, destructive: false, approvalStatus: 'allowed', outputBytes: 2_048, errorType: '' },
    { id: 'to2', turnId: 't1', toolName: 'Edit', status: 'completed', startedAt: 1, completedAt: 2, durationMs: 300, readOnly: true, destructive: false, approvalStatus: 'allowed', outputBytes: 512, errorType: '' },
    { id: 'to3', turnId: 't2', toolName: 'Bash', status: 'error', startedAt: 1, completedAt: 2, durationMs: 50, readOnly: false, destructive: true, approvalStatus: 'allowed', outputBytes: 0, errorType: 'timeout' },
  ],
}))

const zcContextMock = vi.fn(async () => ({
  sessionId: 'sess_a1',
  requests: [
    { at: Date.now() - 600_000, turnId: 't1', model: 'GLM-5.3', provider: 'bigmodel-api', status: 'completed', ttftMs: 1293, promptTokens: 1_100_000, outputTokens: 10_000 },
    { at: Date.now() - 300_000, turnId: 't1', model: 'GLM-5.3', provider: 'bigmodel-api', status: 'completed', ttftMs: null, promptTokens: 1_200_000, outputTokens: 12_000 },
    { at: Date.now() - 60_000, turnId: 't2', model: 'GLM-5.3', provider: 'bigmodel-api', status: 'completed', ttftMs: 900, promptTokens: 900_000, outputTokens: 8_000 },
  ],
  est: {
    categories: [
      { key: 'user-text', estTokens: 4200, count: 3 },
      { key: 'assistant-text', estTokens: 18000, count: 12 },
      { key: 'reasoning', estTokens: 9500, count: 9 },
      { key: 'tool', estTokens: 220_000, count: 70 },
      { key: 'file', estTokens: 1000, count: 1 },
    ],
    estTotalTokens: 252_700, partsParsed: 95, partsSkipped: 0,
  },
  largest: [
    { messageId: 'm1', role: 'assistant', at: Date.now() - 60_000, estTokens: 61_000, preview: '读取会话账本失败重试……（截断预览）' },
  ],
  compactions: [{ at: Date.now() - 300_000, trigger: 'manual', reason: 'user_requested', status: 'ok' }],
}))

vi.mock('../api/zcodeUsage', () => ({
  zcodeUsageApi: {
    summary: (days: number) => summaryMock(days),
    sessions: () => zcSessionsMock(),
    rounds: (id: string) => zcRoundsMock(id),
    tools: (id: string) => zcToolsMock(id),
    context: (id: string) => zcContextMock(id),
  },
}))

vi.mock('../api/devtools', () => ({
  fetchDevtools: vi.fn(async () => []),
  launchDevtool: vi.fn(async () => undefined),
  fetchCliSessions: vi.fn(async () => ({
    sessions: [
      { id: 'sess_a1', title: '修复构建', directory: '/Users/x/lab/proj', timeUpdated: Date.now() - 3_600_000, timeCreated: 0 },
      { id: 'sess_b2', title: '', directory: '', timeUpdated: Date.now() - 60_000, timeCreated: 0 },
    ],
  })),
}))
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }))

import { estimateCostUsd, findModelPrice, isSubscriptionProvider } from '../utils/modelPricing'
import IdeCliSessions from '../components/IdeCliSessions.vue'

describe('价目补录（2026-10-21 models.dev 第一方锚）', () => {
  it('GLM-5.3 家族与 deepseek-flash 已收录；旧未收录回归锚不动', () => {
    const glm = findModelPrice('GLM-5.3')!
    expect(glm).toEqual({ input: 1.4, output: 4.4, cacheRead: 0.26, cacheWrite: 0 })
    expect(findModelPrice('GLM-5.3-Flash')!.input).toBe(0.15)
    expect(findModelPrice('deepseek-flash')!.cacheRead).toBe(0.003)
    // 旧未收录锚（usage-round1.test.ts 同款）不受补录影响
    expect(findModelPrice('glm-4.6')).toBeNull()
    expect(findModelPrice('deepseek-chat')).toBeNull()
  })

  it('GLM-5.3 成本=输入+输出+缓存读（缓存写免费=0）', () => {
    const cost = estimateCostUsd('GLM-5.3', {
      inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000,
    })
    expect(cost).toBeCloseTo(1.4 + 4.4 + 0.26 + 0, 5)
  })

  it('订阅 provider（account: 前缀）判定：不按 token 计费', () => {
    expect(isSubscriptionProvider('account:bigmodel-individual-coding-plan')).toBe(true)
    expect(isSubscriptionProvider('bigmodel-api')).toBe(false)
    expect(isSubscriptionProvider(null)).toBe(false)
  })
})

describe('IdeCliSessions — 用量徽与账单展开', () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()) })

  it('有用量数据的会话显示「轮/token」徽与账单按钮；无数据行保持原样', async () => {
    const w = mount(IdeCliSessions)
    await flushPromises()
    expect(zcSessionsMock).toHaveBeenCalled()
    const row1 = w.find('[data-testid="ide-cli-session-sess_a1"]')
    expect(row1.text()).toContain('12 轮')
    expect(row1.text()).toContain('9.0M tok')
    expect(w.find('[data-testid="ide-cli-bill-sess_a1"]').exists()).toBe(true)
    // sess_b2 无用量数据：无徽无账单按钮（fail-soft 缺席态）
    expect(w.find('[data-testid="ide-cli-bill-sess_b2"]').exists()).toBe(false)
    w.unmount()
  })

  it('账单展开：逐轮表（TTFT 真值/错误码）+ 工具时间线（破坏性标记）+ 成本含订阅说明', async () => {
    const w = mount(IdeCliSessions)
    await flushPromises()
    await w.find('[data-testid="ide-cli-bill-sess_a1"]').trigger('click')
    await flushPromises()
    expect(zcRoundsMock).toHaveBeenCalledWith('sess_a1')
    expect(zcToolsMock).toHaveBeenCalledWith('sess_a1')
    const rounds = w.find('[data-testid="ide-cli-bill-rounds-sess_a1"]')
    expect(rounds.exists()).toBe(true)
    expect(rounds.text()).toContain('1.3s')       // TTFT 1293ms
    expect(rounds.text()).toContain('E502')
    const tools = w.find('[data-testid="ide-cli-bill-tools-sess_a1"]')
    expect(tools.exists()).toBe(true)
    expect(tools.text()).toContain('破坏性')
    const bill = w.find('[data-testid="ide-cli-bill-body-sess_a1"]')
    expect(bill.text()).toContain('含订阅计划')   // account: provider 在账单中
    expect(bill.text()).toMatch(/≈\$/)           // 按量部分给出估价
    w.unmount()
  })

  it('用量端点失败=徽章缺席不砸列表（老服务端兼容）', async () => {
    zcSessionsMock.mockRejectedValueOnce(new Error('404'))
    const w = mount(IdeCliSessions)
    await flushPromises()
    expect(w.text()).toContain('修复构建')
    expect(w.find('[data-testid="ide-cli-bill-sess_a1"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('IdeCliSessions — S1 注入模式徽章回归 + Phase2 趋势/构成', () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()) })

  it('外部注入 sessions 时用量徽仍拉取（S1：侧栏主 surface 不缺席）', async () => {
    const w = mount(IdeCliSessions, {
      props: {
        sessions: [
          { id: 'sess_a1', title: '修复构建', directory: '/Users/x/lab/proj', timeUpdated: Date.now() - 3_600_000, timeCreated: 0 },
        ],
      },
    })
    await flushPromises()
    expect(zcSessionsMock).toHaveBeenCalled()
    const row = w.find('[data-testid="ide-cli-session-sess_a1"]')
    expect(row.text()).toContain('12 轮')
    expect(w.find('[data-testid="ide-cli-bill-sess_a1"]').exists()).toBe(true)
    w.unmount()
  })

  it('账单展开后点「构成」：趋势条带渲染 + 构成类别（≈标）+ 压缩事件', async () => {
    const w = mount(IdeCliSessions)
    await flushPromises()
    await w.find('[data-testid="ide-cli-bill-sess_a1"]').trigger('click')
    await flushPromises()
    // 趋势在构成拉取后才显示（toggle 首点即拉）
    await w.find('[data-testid="ide-cli-ctx-toggle"]').trigger('click')
    await flushPromises()
    expect(zcContextMock).toHaveBeenCalledWith('sess_a1')
    const trend = w.find('[data-testid="ide-cli-trend-sess_a1"]')
    expect(trend.exists()).toBe(true)
    expect(trend.findAll('.ide-cli-sessions__tbar').length).toBe(3)
    const ctx = w.find('[data-testid="ide-cli-ctx-sess_a1"]')
    expect(ctx.text()).toContain('构成合计')
    expect(ctx.text()).toContain('用户消息')
    expect(ctx.text()).toContain('工具调用')
    expect(ctx.text()).toContain('≈')
    expect(ctx.text()).toContain('压缩事件 1 次')
    w.unmount()
  })
})

describe('IdeMetricsPopover — 本机 zcode 账本分区', () => {
  beforeEach(() => { vi.clearAllMocks(); setActivePinia(createPinia()) })

  async function mountPopover() {
    const { default: IdeMetricsPopover } = await import('../views/IdeMetricsPopover.vue')
    return mount(IdeMetricsPopover, {
      props: {
        metrics: {
          contextUsed: { value: 13000 }, contextLength: { value: 64000 }, contextPct: { value: 20 },
          contextLevel: { value: 'ok' }, contextText: { value: '13k/64k 20%' },
          cacheDetail: { value: null }, tpsDisplay: { value: null }, tpsSpeed: { value: 'slow' },
        } as never,
      },
    })
  }

  it('KPI/按模型表（订阅徽）/全链路构成（人话标签）/日条带渲染', async () => {
    const w = await mountPopover()
    await flushPromises()
    await nextTick()
    const kpis = w.find('[data-testid="ide-metrics-zc-kpis"]')
    expect(kpis.exists()).toBe(true)
    expect(kpis.text()).toContain('会话 42')
    expect(kpis.text()).toContain('缓存 90%')
    const models = w.find('[data-testid="ide-metrics-zc-models"]')
    expect(models.text()).toContain('GLM-5.3')
    expect(models.text()).toContain('订阅')        // account: provider 行
    expect(models.text()).toContain('deepseek-flash')
    const sources = w.find('[data-testid="ide-metrics-zc-sources"]')
    expect(sources.text()).toContain('主轮')
    expect(sources.text()).toContain('子代理')
    expect(w.find('[data-testid="ide-metrics-zc-bars"]').exists()).toBe(true)
    w.unmount()
  })

  it('时间窗切换重拉 summary（全部=days 0）', async () => {
    const w = await mountPopover()
    await flushPromises()
    expect(summaryMock).toHaveBeenCalledWith(30)
    await w.find('[data-testid="ide-metrics-zc-day-0"]').trigger('click')
    await flushPromises()
    expect(summaryMock).toHaveBeenCalledWith(0)
    w.unmount()
  })
})
