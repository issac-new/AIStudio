// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/run-canvas.test.ts
// v12 运行画布守门（2026-09-19 统一视图 Task 7）：实时（阶段流/LIVE 徽章/最新
// run 图）与历史（回放条 j/k/事件编年/导出）双视图；看板跳转。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => p ? `${k}:${JSON.stringify(p)}` : k }) }))

const apiStubs = vi.hoisted(() => ({
  runRest: {
    getSpec: vi.fn(async () => ({
      nodes: [{ id: 'discovery', type: 'phase-discovery' }, { id: 'gate', type: 'loop-gate' }],
      edges: [{ from: 'discovery', to: 'gate' }],
      entryNode: 'discovery',
    })),
    replay: vi.fn(async () => [
      { type: 'graph.node-started', ts: '2026-09-19T14:00:00Z', nodeId: 'discovery' },
      { type: 'graph.node-complete', ts: '2026-09-19T14:01:00Z', nodeId: 'discovery', result: { goto: 'gate' } },
      { type: 'graph.node-started', ts: '2026-09-19T14:02:00Z', nodeId: 'gate' },
    ]),
    exportRun: vi.fn(async () => ({ run: { runId: 'run-8f21' }, spec: {}, events: [] })),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({ runRest: apiStubs.runRest, connectGraph: vi.fn(), disconnectGraph: vi.fn() }))
vi.mock('@/custom/loop/runcenter/components/RunGraphCanvas.vue', () => ({
  default: { name: 'RunGraphCanvas', props: ['graph', 'entryNode'], template: '<div class="rgc-stub" data-testid="rgc-stub" />' },
}))

import RunCanvas from '../components/flow/RunCanvas.vue'
import type { LoopInstance } from '@/custom/loop/types'
import type { FlowLoopRow } from '../adapters/flow'

const LOOP: LoopInstance = {
  id: 'lp-1', name: 'release-pipeline', goal: '', stopCondition: '', pattern: 'daily-triage',
  schedule: { mode: 'manual' }, stage: 'persistence', status: 'awaiting-review',
  autonomyLevel: 'L2', stateAdapter: 'local',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-19T14:00:00Z',
  lastTickAt: null, nextTickAt: null,
  stats: { totalIterations: 3, tasksDiscovered: 4, tasksCompleted: 2, tasksBlocked: 0, totalCost: 0, currentIteration: 3 },
} as LoopInstance

const ROW: FlowLoopRow = {
  kind: 'loop', id: 'lp-1', name: 'release-pipeline', stageIndex: 3, stageTotal: 5,
  stageTone: 'run', progressPct: 70, statusKey: 'awaitingYou', awaitingYou: true, blocked: false, updatedAt: 1,
}

function mountCanvas(overrides: Record<string, unknown> = {}) {
  return mount(RunCanvas, {
    props: {
      loop: LOOP,
      loopRow: ROW,
      linkedTasks: [],
      latestRunId: 'run-8f21',
      liveConnected: true,
      participants: [{ kind: 'agent', name: 'worker-coder', role: '执行' }],
      ...overrides,
    },
    attachTo: document.body,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('RunCanvas — 实时视图', () => {
  it('链路条（等你门）+ 视图条 + LIVE 徽章 + 阶段流（run 段加粗）+ 最新 run 图 + 参与方', async () => {
    const w = mountCanvas()
    await flushPromises()
    expect(w.find('[data-testid="chain-gate"]').text()).toContain('ia2.chain.gateReview')
    expect(w.find('[data-testid="rc-live-badge"]').exists()).toBe(true)
    expect(w.find('[data-testid="stage-node-3"]').classes()).toContain('sf__node--run')
    expect(w.find('[data-testid="rgc-stub"]').exists()).toBe(true)
    expect(w.find('[data-testid="rc-part-worker-coder"]').text()).toContain('worker-coder')
    expect(w.find('[data-testid="rc-goto-board"]').exists()).toBe(true)
  })

  it('无 run 时图区空态占位', async () => {
    const w = mountCanvas({ latestRunId: null })
    await flushPromises()
    expect(w.find('[data-testid="rc-graph-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="rgc-stub"]').exists()).toBe(false)
  })

  it('▦ 看板 → emit goto-board', async () => {
    const w = mountCanvas()
    await w.find('[data-testid="rc-goto-board"]').trigger('click')
    expect(w.emitted('goto-board')).toHaveLength(1)
  })
})

describe('RunCanvas — 历史视图（回放+编年+导出）', () => {
  it('切历史：回放条事件计数 + 事件编年渲染 + 导出调用', async () => {
    const w = mountCanvas()
    await flushPromises()
    await w.find('[data-testid="rc-view-hist"]').trigger('click')
    expect(w.find('[data-testid="rc-hist"]').exists()).toBe(true)
    // 回放语义：cursor=已重放 N（初始 0）——拖到末尾后编年全量 3 条
    const seek = w.find('.rc__seek')
    await seek.setValue(3)
    expect(w.find('[data-testid="rc-chronicle"]').findAll('.rc__chron-row')).toHaveLength(3)
    await w.find('[data-testid="rc-export"]').trigger('click')
    await flushPromises()
    expect(apiStubs.runRest.exportRun).toHaveBeenCalledWith('run-8f21')
  })

  it('j/k 键步进（事件计数随之变化）', async () => {
    const w = mountCanvas()
    await flushPromises()
    await w.find('[data-testid="rc-view-hist"]').trigger('click')
    const meta = () => w.find('.rc__rmeta').text()
    const start = meta() // n=0
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    await w.vm.$nextTick()
    expect(meta()).not.toBe(start)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    await w.vm.$nextTick()
    expect(meta()).toBe(start)
    w.unmount()
  })
})

// ── v13 协作感知轮（语义块回放 + 运行耗时徽章）──

describe('RunCanvas — v13 语义块回放', () => {
  it('语义分布条 + chips 渲染（含计数）；chip 点击过滤编年行', async () => {
    const w = mountCanvas()
    await flushPromises()
    await w.find('[data-testid="rc-view-hist"]').trigger('click')
    const seek = w.find('.rc__seek')
    await seek.setValue(3)
    // 3 事件均为 graph.node-*（node 类）→ 分布条存在 + node chip 计数 3
    expect(w.find('[data-testid="rc-sem"]').exists()).toBe(true)
    const nodeChip = w.find('[data-testid="rc-sem-chip-node"]')
    expect(nodeChip.text()).toContain('3')
    // 过滤到 interrupt（无该类事件不渲染 chip）→ 用 all/node 验证开关语义
    await nodeChip.trigger('click')
    expect(w.find('[data-testid="rc-chronicle"]').findAll('.rc__chron-row')).toHaveLength(3)
    // 切「全部」仍 3 条（开-关等价）
    await w.find('[data-testid="rc-sem-all"]').trigger('click')
    expect(w.find('[data-testid="rc-chronicle"]').findAll('.rc__chron-row')).toHaveLength(3)
  })

  it('编年行带语义类（node 行类名 + 图标类）', async () => {
    const w = mountCanvas()
    await flushPromises()
    await w.find('[data-testid="rc-view-hist"]').trigger('click')
    await w.find('.rc__seek').setValue(3)
    const row = w.find('[data-testid="rc-chron-0"]')
    expect(row.classes()).toContain('rc__chron-row--node')
  })
})

describe('RunCanvas — v13 运行耗时徽章', () => {
  it('running + 起始时刻 → ⏱ 徽章渲染（含时长文本）', async () => {
    const w = mountCanvas({ latestRunStatus: 'running', latestRunStartMs: Date.now() - 5 * 60_000 - 5_000 })
    await flushPromises()
    const badge = w.find('[data-testid="rc-elapsed"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('5m')
  })

  it('非 running 态不渲染徽章', async () => {
    const w = mountCanvas({ latestRunStatus: 'completed', latestRunStartMs: Date.now() - 60_000 })
    await flushPromises()
    expect(w.find('[data-testid="rc-elapsed"]').exists()).toBe(false)
  })
})
