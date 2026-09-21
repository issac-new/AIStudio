// overlay/custom/client/ide/__tests__/metrics.test.ts
// 会话遥测守门（M2，dsh-TUI 移植）：纯函数口径 / TpsTracker 状态机 /
// IdeStatusBar 指标簇接线。口径契约见 utils/metrics.ts 头注与
// docs/upstream-analysis/zcode.md §四。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// R1：状态栏新增低余量 toast（useMessage）与遥测弹层（usage api）依赖
vi.mock('naive-ui', () => ({ useMessage: () => ({ warning: vi.fn() }) }))
vi.mock('../api/usage', () => ({ ideUsageApi: { rounds: vi.fn(async () => ({ rounds: [] })) } }))

// chat store 桩：reactive 对象，activeSession 走 getter 投影 sessions
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

vi.mock('@/api/studio/sessions', () => ({
  fetchContextLength: vi.fn(async () => 64000),
  fetchUsageStats: vi.fn(async () => ({ daily_usage: [] })),
  fetchSessions: vi.fn(async () => [
    {
      id: 's1',
      input_tokens: 5600,
      cache_read_tokens: 12000,
      cache_write_tokens: 3400,
    },
  ]),
}))

import { useChatStore } from '@/stores/hermes/chat'
import {
  TpsTracker,
  cacheHitRate,
  contextPercent,
  contextPressure,
  contextReadout,
  formatTokens,
  sparkline,
  speedLevel,
  TPS_SAMPLES_CAP,
} from '../utils/metrics'

describe('纯函数口径（dsh-TUI 语义，阈值对齐 ChatInput 60/80）', () => {
  it('formatTokens 阶梯：<1k 原值 / <10k 一位小数 / <1M 整 k / M 档', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(952)).toBe('952')
    expect(formatTokens(3400)).toBe('3.4k')
    expect(formatTokens(13000)).toBe('13k')
    expect(formatTokens(1250000)).toBe('1.3M')
  })

  it('contextPressure：60 起 warn、80 起 danger（ChatInput 同阈值）', () => {
    expect(contextPressure(59.9)).toBe('ok')
    expect(contextPressure(60)).toBe('warn')
    expect(contextPressure(79.9)).toBe('warn')
    expect(contextPressure(80)).toBe('danger')
  })

  it('contextPercent 封顶 100，非法输入归零', () => {
    expect(contextPercent(13000, 64000)).toBeCloseTo(20.31, 1)
    expect(contextPercent(999999, 64000)).toBe(100)
    expect(contextPercent(-1, 64000)).toBe(0)
    expect(contextPercent(100, 0)).toBe(0)
  })

  it('contextReadout：`used/window pct`，≥10% 取整、<10% 一位小数', () => {
    expect(contextReadout(13000, 64000)).toBe('13k/64k 20%')
    expect(contextReadout(3100, 64000)).toBe('3.1k/64k 4.8%')
  })

  it('cacheHitRate：read/(in+read+write)，写计入 miss，分母≤0 返回 null', () => {
    expect(cacheHitRate(5600, 12000, 3400)).toBeCloseTo(57.14, 1)
    expect(cacheHitRate(0, 0, 0)).toBeNull()
    // 只有写（首请求刚写缓存、尚无读）：0% 命中是真实口径（dsh 同款）
    expect(cacheHitRate(null, undefined, 10)).toBe(0)
  })

  it('speedLevel：≥50 fast / ≥20 med / 其余 slow', () => {
    expect(speedLevel(50)).toBe('fast')
    expect(speedLevel(49.9)).toBe('med')
    expect(speedLevel(20)).toBe('med')
    expect(speedLevel(19.9)).toBe('slow')
    expect(speedLevel(0)).toBe('slow')
  })

  it('sparkline：min-max 归一 8 级块，全等取中位，空返回空串', () => {
    expect(sparkline([])).toBe('')
    const blocks = sparkline([
      { tps: 10, at: 0 },
      { tps: 10, at: 1 },
    ])
    expect(blocks).toBe('▄▄')
    const ramp = sparkline([
      { tps: 10, at: 0 },
      { tps: 20, at: 1 },
      { tps: 30, at: 2 },
    ])
    expect(ramp).toBe('▁▅█')
  })
})

describe('TpsTracker 状态机', () => {
  it('流式实时估计：500ms 预热内无值，之后 chars/4 速率', () => {
    const tracker = new TpsTracker()
    tracker.startRun(0, 0)
    tracker.onStreamDelta(100, 400)
    expect(tracker.liveTps(400)).toBeNull() // 预热 500ms 内
    tracker.onStreamDelta(1100, 1600)
    // burst 自 100 起：(1600-400)/4 token / 1s = 300 t/s
    expect(tracker.liveTps(1100)).toBe(300)
  })

  it('burst 折叠：>2s 无增量后重起表，工具间隙不计入当前 burst', () => {
    const tracker = new TpsTracker()
    tracker.startRun(0, 0)
    tracker.onStreamDelta(0, 100)
    tracker.onStreamDelta(100, 300)
    tracker.onStreamDelta(3000, 500) // 间隔 2900ms → 新 burst
    expect(tracker.liveTps(3200)).toBeNull() // 新 burst 尚无增量
    tracker.onStreamDelta(3600, 900)
    // (900-500)/4 / 0.6s ≈ 166.7
    expect(tracker.liveTps(3600)).toBeCloseTo(166.67, 0)
  })

  it('轮结算：真实 output 增量优先于 chars/4 估计', () => {
    const tracker = new TpsTracker()
    tracker.startRun(0, 1000) // 会话累计基线
    tracker.onStreamDelta(0, 4000) // 估计路径：1000 token
    tracker.onUsageOutput(8000, 1200) // 真实增量 200
    const sample = tracker.endRun(8000)
    expect(sample).not.toBeNull()
    expect(sample!.tps).toBe(25) // 200 token / 8s
    expect(tracker.getLastRunTps()).toBe(25)
  })

  it('无结算时退化 chars/4：burst 解码时长优先，单增量 burst 退化全时距', () => {
    const tracker = new TpsTracker()
    tracker.startRun(0, undefined)
    // 连续解码 burst：0→2000ms 净增 4000 字符 → 4000/4 / 2s = 500 t/s
    tracker.onStreamDelta(0, 100)
    tracker.onStreamDelta(1000, 2100)
    tracker.onStreamDelta(2000, 4100)
    const sample = tracker.endRun(2000)
    expect(sample!.tps).toBe(500)

    // 全程单增量 burst（无时距可折）：退化 首 token→末事件 全时距
    const solo = new TpsTracker()
    solo.startRun(0, undefined)
    solo.onStreamDelta(0, 800)
    solo.onStreamDelta(4000, 4800)
    const fallback = solo.endRun(4000)
    // 4800/4 / 4s = 300（分母含间隙，诚实低估）
    expect(fallback!.tps).toBe(300)

    // 下一轮无任何增量：不产生样本，保留上轮值
    tracker.startRun(5000, 4800)
    const none = tracker.endRun(9000)
    expect(none).toBeNull()
    expect(tracker.getLastRunTps()).toBe(500)
    expect(tracker.getSamples()).toHaveLength(1)
  })

  it('样本 FIFO 上限 500（dsh-TUI 同款）', () => {
    const tracker = new TpsTracker()
    for (let i = 0; i < TPS_SAMPLES_CAP + 5; i++) {
      tracker.startRun(i * 10_000, 0)
      tracker.onStreamDelta(i * 10_000, 400)
      tracker.onStreamDelta(i * 10_000 + 2000, 4400)
      tracker.endRun(i * 10_000 + 2000)
    }
    expect(tracker.getSamples()).toHaveLength(TPS_SAMPLES_CAP)
  })
})

describe('IdeStatusBar 指标簇接线', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000 })
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // mock 工厂持有单一 reactive 实例；useChatStore() 每次返回同一对象
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fakeStore(): any {
    return useChatStore()
  }

  // 假计时器下 VTU flushPromises（依赖 setTimeout）不可用，走微任务级 flush
  async function flushJobs(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve()
      await nextTick()
    }
  }

  async function mountBar() {
    const { default: IdeStatusBar } = await import('../views/IdeStatusBar.vue')
    return mount(IdeStatusBar)
  }

  function seedSession(fake: ReturnType<typeof fakeStore>): void {
    fake.sessions = [
      {
        id: 's1',
        profile: 'p',
        provider: 'pr',
        model: 'm',
        contextTokens: 13000,
        inputTokens: 500,
        outputTokens: 0,
        messages: [],
      },
    ]
    fake.activeSessionId = 's1'
  }

  it('上下文水位：contextTokens 口径 + 60/80 分级变色', async () => {
    const fake = fakeStore()
    seedSession(fake)
    const w = await mountBar()
    await flushJobs()
    const ctx = w.find('[data-testid="ide-metrics-context"]')
    expect(ctx.exists()).toBe(true)
    expect(ctx.text()).toContain('13k/64k 20%')
    expect(ctx.find('.ide-statusbar__ctxfill').attributes('data-level')).toBe('ok')

    fake.sessions[0].contextTokens = 60000 // 93.75% → danger
    await flushJobs()
    expect(w.find('.ide-statusbar__ctxfill').attributes('data-level')).toBe('danger')
    expect(w.find('[data-testid="ide-metrics-context"]').text()).toContain('60k/64k 94%')
  })

  it('TPS：流式增量 + 真实结算 → 轮均值与速度分级；缓存命中率随轮结束刷新', async () => {
    const fake = fakeStore()
    seedSession(fake)
    const w = await mountBar()
    await flushJobs()

    // 无数据：TPS/缓存不渲染
    expect(w.find('[data-testid="ide-metrics-tps"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-metrics-cache"]').exists()).toBe(false)

    // 轮起 → 流式增量 → usage 结算 → 轮终
    fake.isRunActive = true
    await flushJobs()
    fake.sessions[0].messages = [{ role: 'assistant', isStreaming: true, content: 'x'.repeat(4000) }]
    await flushJobs()
    vi.setSystemTime(1_700_000_008_000)
    fake.sessions[0].outputTokens = 200
    await flushJobs()
    fake.isRunActive = false
    await flushJobs()

    const tps = w.find('[data-testid="ide-metrics-tps"]')
    expect(tps.exists()).toBe(true)
    expect(tps.text()).toContain('25 t/s')
    expect(tps.attributes('data-speed')).toBe('med')

    // 缓存命中：12000/(5600+12000+3400) ≈ 57%
    const cache = w.find('[data-testid="ide-metrics-cache"]')
    expect(cache.exists()).toBe(true)
    expect(cache.text()).toContain('57%')
    expect(cache.attributes('title')).toContain('12k')
  })

  it('无会话：遥测簇整体不渲染，原有状态栏项不受影响', async () => {
    const fake = fakeStore()
    fake.activeSessionId = null
    const w = await mountBar()
    await flushJobs()
    expect(w.find('[data-testid="ide-metrics-context"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-metrics-tps"]').exists()).toBe(false)
    expect(w.text()).toContain('ide.statusIdle')
  })
})
