// @vitest-environment jsdom
// overlay/custom/client/loop/runcenter/__tests__/run-detail-components.test.ts
// 运行详情组件 jsdom 冒烟（task-6）：RunTimeline 回放控制与三级分辨率渲染 /
// RunGraphCanvas vue-flow stub 下的节点投影与选中 / RunDetailView 数据装配与布局骨架。
// vue-flow 以 stub 替身挂载（jsdom 无真实量测），画布映射逻辑经 stub props 断言。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ── @vue-flow/core stub：捕获 nodes/edges props 并渲染自定义节点插槽 ──
const { flowCapture } = vi.hoisted(() => ({
  flowCapture: {
    nodes: [] as Array<Record<string, unknown>>,
    edges: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('@vue-flow/core', async () => {
  const { h } = await import('vue')
  return {
    MarkerType: { ArrowClosed: 'arrowclosed' },
    // 函数组件替身：捕获 nodes/edges props 并渲染自定义节点插槽（jsdom 无真实量测）
    VueFlow: (
      props: { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> },
      ctx: { slots: Record<string, (...args: unknown[]) => ReturnType<typeof h>> },
    ) => {
      const nodes = props.nodes ?? []
      flowCapture.nodes = nodes
      flowCapture.edges = props.edges ?? []
      return h(
        'div',
        { class: 'vue-flow-stub', 'data-node-count': String(nodes.length) },
        nodes.map(n =>
          h('div', { class: 'stub-slot', key: String(n.id) },
            ctx.slots['node-run-node']?.({ id: n.id, data: n.data }),
          ),
        ),
      )
    },
  }
})

// ── runcenter api mock ──
const { rest } = vi.hoisted(() => ({
  rest: {
    getRun: vi.fn(),
    replay: vi.fn(),
    getSpec: vi.fn(),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({ runRest: rest }))

// ── vue-router mock ──
const { pushMock, routeParams } = vi.hoisted(() => ({
  pushMock: vi.fn(async () => {}),
  routeParams: { value: {} as Record<string, string> },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routeParams.value }),
  useRouter: () => ({ push: pushMock }),
}))

import RunTimeline from '@/custom/loop/runcenter/components/RunTimeline.vue'
import RunGraphCanvas from '@/custom/loop/runcenter/components/RunGraphCanvas.vue'
import RunDetailView from '@/custom/loop/runcenter/views/RunDetailView.vue'
import type { TimelineRow } from '@/custom/loop/runcenter/adapters/run-graph'
import type { RunGraphData } from '@/custom/loop/runcenter/adapters/run-graph'

// ── 夹具 ──
const GRAPH: RunGraphData = {
  nodes: [
    { id: 'discovery', label: 'loop1:discovery', type: 'phase-discovery', status: 'done', iteration: 1, durationMs: 2000 },
    { id: 'handoff', label: 'loop1:handoff', type: 'phase-handoff', status: 'running', iteration: 3, durationMs: 120 },
    { id: 'validation', label: 'loop1:validation', type: 'phase-validation', status: 'awaiting-input', iteration: 2, durationMs: 0 },
    { id: 'gate', label: 'loop1:gate', type: 'loop-gate', status: 'failed', iteration: 1, durationMs: 900 },
    { id: 'stop-check', label: 'loop1:stop-check', type: 'stop-check', status: 'skipped', iteration: 0, durationMs: 0 },
  ],
  edges: [
    { id: 'discovery->handoff', from: 'discovery', to: 'handoff', taken: true },
    { id: 'validation->handoff', from: 'validation', to: 'handoff', taken: false, guard: 3 },
  ],
}

const row = (over: Partial<TimelineRow> & { index: number; type: string }): TimelineRow => ({
  ts: 1700000000000,
  level: 'detail',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  flowCapture.nodes = []
  flowCapture.edges = []
  routeParams.value = { runId: 'run-1' }
})

describe('RunTimeline (jsdom)', () => {
  const baseProps = { cursorIndex: 2, total: 5, playing: false, speed: 1, mode: 'normal' as const, rows: [] as TimelineRow[] }

  it('控制条：播放按钮发 toggle-play；步进按钮发 seek(cursor±1)', async () => {
    const w = mount(RunTimeline, { props: baseProps })
    await w.find('.rt-panel__play').trigger('click')
    expect(w.emitted('toggle-play')).toHaveLength(1)

    const steps = w.findAll('.rt-panel__step')
    await steps[0].trigger('click')
    expect(w.emitted('seek')![0]).toEqual([1])
    await steps[1].trigger('click')
    expect(w.emitted('seek')![1]).toEqual([3])
  })

  it('拖动 scrubber 发 seek（数值化）', async () => {
    const w = mount(RunTimeline, { props: baseProps })
    const scrubber = w.find('.rt-panel__scrubber')
    expect(scrubber.attributes('max')).toBe('5')
    await w.find('.rt-panel__scrubber').setValue('4')
    expect(w.emitted('seek')![0]).toEqual([4])
  })

  it('倍速按钮发 set-speed；模式切换发 set-mode', async () => {
    const w = mount(RunTimeline, { props: baseProps })
    await w.findAll('.rt-panel__speed')[2].trigger('click')
    expect(w.emitted('set-speed')![0]).toEqual([2])

    await w.findAll('.rt-panel__mode')[0].trigger('click')
    expect(w.emitted('set-mode')![0]).toEqual(['summary'])
  })

  it('事件流：行渲染级别/状态/goto/error；verbose 行 payload 可展开', () => {
    const rows: TimelineRow[] = [
      row({ index: 1, type: 'node.started', nodeId: 'handoff', status: 'running', level: 'detail' }),
      row({ index: 2, type: 'node.completed', nodeId: 'discovery', status: 'done', level: 'result', goto: ['handoff'] }),
      row({ index: 3, type: 'node.failed', nodeId: 'gate', status: 'failed', level: 'result', error: 'gate reject' }),
      row({ index: 4, type: 'checkpoint.saved', level: 'raw', payload: { checkpointId: 'cp-1' } }),
    ]
    const w = mount(RunTimeline, { props: { ...baseProps, mode: 'verbose', rows } })
    const els = w.findAll('.rt-row')
    expect(els).toHaveLength(4)
    expect(els[0].classes()).toContain('is-detail')
    expect(els[1].classes()).toContain('is-result')
    expect(els[1].text()).toContain('discovery')
    expect(els[1].text()).toContain('handoff') // goto 路由事实
    expect(els[2].text()).toContain('gate reject')
    // verbose payload <details> 存在且 JSON 序列化
    const payload = els[3].find('.rt-row__payload')
    expect(payload.exists()).toBe(true)
    expect(payload.text()).toContain('cp-1')
  })

  it('空行 + 未播放显示空占位；total=0 时播放/scrubber 禁用', () => {
    const w = mount(RunTimeline, { props: { ...baseProps, total: 0, cursorIndex: 0 } })
    expect(w.find('.rt-panel__empty').exists()).toBe(true)
    expect(w.find('.rt-panel__play').attributes('disabled')).toBeDefined()
    expect(w.find('.rt-panel__scrubber').attributes('disabled')).toBeDefined()
  })
})

describe('RunGraphCanvas (jsdom, vue-flow stub)', () => {
  it('投影节点：状态类 / 迭代徽标 / 时长标签进自定义节点插槽', () => {
    const w = mount(RunGraphCanvas, { props: { graph: GRAPH, entryNode: 'discovery', selectedNodeId: 'gate' } })
    expect(w.find('[data-run-graph-canvas]').exists()).toBe(true)
    expect(w.find('.vue-flow-stub').attributes('data-node-count')).toBe('5')

    const slots = w.findAll('.stub-slot .rg-node')
    expect(slots).toHaveLength(5)
    expect(slots[0].classes()).toContain('is-done')
    expect(slots[1].classes()).toContain('is-running')
    expect(slots[2].classes()).toContain('is-awaiting-input')
    expect(slots[3].classes()).toContain('is-failed')
    expect(slots[3].classes()).toContain('is-selected')
    expect(slots[4].classes()).toContain('is-skipped')
    // 迭代徽标（iteration>0 显示）
    expect(slots[1].text()).toContain('#3')
    expect(slots[4].text()).not.toContain('#0')
    // 时长标签
    expect(slots[0].text()).toContain('2.0s')
    expect(slots[1].text()).toContain('120ms')
  })

  it('点击节点 emit select-node（B7 检查器预留口）', async () => {
    const w = mount(RunGraphCanvas, { props: { graph: GRAPH } })
    await w.findAll('.stub-slot .rg-node')[1].trigger('click')
    expect(w.emitted('select-node')![0]).toEqual(['handoff'])
  })

  it('空图渲染空占位且不挂 VueFlow', () => {
    const w = mount(RunGraphCanvas, { props: { graph: { nodes: [], edges: [] } } })
    expect(w.find('.vue-flow-stub').exists()).toBe(false)
    expect(w.find('.rg-canvas__empty').exists()).toBe(true)
  })
})

describe('RunDetailView (jsdom)', () => {
  const SPEC = {
    id: 'loop-loop1',
    nodes: [
      { id: 'discovery', type: 'phase-discovery', config: { label: 'loop1:discovery' } },
      { id: 'handoff', type: 'phase-handoff', config: { label: 'loop1:handoff' } },
    ],
    edges: [{ from: 'discovery', to: 'handoff' }],
    entryNode: 'discovery',
  }
  const EVENTS = [
    { kind: 'run.started', ts: 1000 },
    { kind: 'node.started', nodeId: 'discovery', superStep: 1, ts: 1000 },
    { kind: 'node.completed', nodeId: 'discovery', superStep: 1, payload: { goto: ['handoff'] }, ts: 3000 },
  ]

  it('装配：详情+回放并行拉取，spec 按 graphDefId 检索；图投影 done 节点；游标初始落全量', async () => {
    rest.getRun.mockResolvedValue({
      runId: 'run-1', graphId: 'loop-loop1',
      instance: { status: 'running', graphDefId: 'loop-loop1' },
    })
    rest.replay.mockResolvedValue(EVENTS)
    rest.getSpec.mockResolvedValue(SPEC)

    const w = mount(RunDetailView)
    await new Promise(r => setTimeout(r, 0))

    expect(rest.getRun).toHaveBeenCalledWith('run-1')
    expect(rest.replay).toHaveBeenCalledWith('run-1')
    expect(rest.getSpec).toHaveBeenCalledWith('loop-loop1')
    expect(w.find('.rd-view__title').text()).toBe('run-1')

    // 游标初始落全量（3/3）→ discovery 投影为 done
    expect(flowCapture.nodes).toHaveLength(2)
    const discovery = flowCapture.nodes.find(n => n.id === 'discovery') as { data: { status: string; iteration: number } }
    expect(discovery.data.status).toBe('done')
    expect(discovery.data.iteration).toBe(1)

    // 时间轴收到 3 行投影（normal 档：run.started + started + completed）
    expect(w.findAll('.rt-row')).toHaveLength(3)
    expect(w.find('.rt-panel__scrubber').attributes('max')).toBe('3')
  })

  it('返回按钮 → 运行中心列表；节点选中状态透传画布', async () => {
    rest.getRun.mockResolvedValue({ runId: 'run-1', graphId: 'loop-loop1', instance: { status: 'running' } })
    rest.replay.mockResolvedValue(EVENTS)
    rest.getSpec.mockResolvedValue(SPEC)

    const w = mount(RunDetailView)
    await new Promise(r => setTimeout(r, 0))

    await w.find('.rd-view__back').trigger('click')
    expect(pushMock).toHaveBeenCalledWith({ name: 'hermes.loopRuns' })

    await w.findAll('.stub-slot .rg-node')[0].trigger('click')
    expect(w.findAll('.stub-slot .rg-node')[0].classes()).toContain('is-selected')
  })

  it('spec 缺失 → 画布占位提示（时间轴仍可用）；REST 失败 → 错误条', async () => {
    rest.getRun.mockResolvedValue({ runId: 'run-1', graphId: 'loop-loop1', instance: { status: 'failed' } })
    rest.replay.mockResolvedValue([])
    rest.getSpec.mockResolvedValue(null)

    const w = mount(RunDetailView)
    await new Promise(r => setTimeout(r, 0))
    expect(w.find('.rd-view__nospec').exists()).toBe(true)
    expect(w.find('.vue-flow-stub').exists()).toBe(false)
    expect(w.find('.rt-panel__empty').exists()).toBe(true)

    // 失败路径在挂载前设置（load 于 onMounted 即发请求）
    rest.getRun.mockRejectedValue(new Error('boom'))
    rest.replay.mockRejectedValue(new Error('replay gone'))
    const w2 = mount(RunDetailView)
    await new Promise(r => setTimeout(r, 0))
    expect(w2.find('.rd-view__error').exists()).toBe(true)
    expect(w2.find('.rd-view__error').text()).toContain('boom') // Promise.all 首个拒绝落错误条
  })
})
