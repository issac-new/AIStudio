// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/orchestrate-components.test.ts
// P3 Task 6 — 编排区组件 jsdom 冒烟：SpecList 卡片渲染/事件/空态，
// SpecDetail 画布接线/JSON 折叠/导出下载/导入置灰，OrchestrateView 三步流
// （列表 → 详情 → 实例化弹层校验与提交跳转）。vue-flow 以 stub 替身挂载
//（jsdom 无真实量测），runcenter/loop REST 全桩。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

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

// ── REST 桩 ──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listSpecs: vi.fn(async () => [] as Array<Record<string, unknown>>),
    getSpec: vi.fn(async () => null),
  },
  loopRest: {
    createLoop: vi.fn(async (_loop: Record<string, unknown>) => ({ id: 'loop-x', name: 'x', goal: 'g' })),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({ runRest }))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

import SpecList from '../components/SpecList.vue'
import SpecDetail from '../components/SpecDetail.vue'
import OrchestrateView from '../views/OrchestrateView.vue'
import type { SpecCard } from '../adapters/orchestrate'

// ── 夹具 ──
const FIVE_PHASE_SPEC = {
  id: 'loop-alpha',
  version: 1,
  nodes: [
    { id: 'discovery', type: 'phase-discovery', config: { label: 'alpha:discovery' } },
    { id: 'handoff', type: 'phase-handoff', config: {} },
    { id: 'stop-check', type: 'stop-check', config: {} },
  ],
  edges: [
    { from: 'discovery', to: 'handoff' },
    { from: 'handoff', to: 'stop-check' },
    { from: 'discovery', to: 'stop-check', guard: { maxIterations: 3 } },
  ],
  entryNode: 'discovery',
  limits: { maxSteps: 100 },
}

function card(partial: Partial<SpecCard>): SpecCard {
  return {
    id: 'loop-alpha', name: 'alpha', kind: 'five-phase', version: 1,
    nodeCount: 3, edgeCount: 3, entryNode: 'discovery', maxSteps: 100,
    ...partial,
  }
}

function makeRouter(): Router {
  const stub = { template: '<div class="route-stub" />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/orchestrate', component: stub },
      { path: '/app/runs', name: 'ia2.runs', component: stub },
    ],
  })
}

  beforeEach(() => {
    vi.clearAllMocks()
    flowCapture.nodes = []
    flowCapture.edges = []
    loopRest.createLoop.mockResolvedValue({ id: 'loop-x', name: 'x', goal: 'g' })
  })

// ── SpecList ──
describe('SpecList', () => {
  it('卡片渲染：名称/版本/节点边数/种类与描述文案；点卡片 emit open、创建钮 emit create（不冒泡 open）', async () => {
    const cards = [
      card({}),
      card({ id: 'daily-brief', name: 'daily-brief', kind: 'daily-brief', version: 2, nodeCount: 1, edgeCount: 0 }),
    ]
    const w = mount(SpecList, { props: { cards } })
    const items = w.findAll('[data-spec-card]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('alpha')
    expect(items[0].text()).toContain('v1')
    expect(items[0].text()).toContain('3 ia2.orchestrate.nodes')
    expect(items[0].text()).toContain('3 ia2.orchestrate.edges')
    expect(items[0].text()).toContain('ia2.orchestrate.kind.five-phase')
    expect(items[0].text()).toContain('ia2.orchestrate.desc.five-phase')
    expect(items[1].text()).toContain('ia2.orchestrate.kind.daily-brief')

    await items[0].trigger('click')
    expect(w.emitted('open')![0][0]).toMatchObject({ id: 'loop-alpha' })
    await items[0].find('.spec-card__create').trigger('click')
    expect(w.emitted('create')![0][0]).toMatchObject({ id: 'loop-alpha' })
    // 创建钮 stop 冒泡：open 不因 create 二次触发
    expect(w.emitted('open')).toHaveLength(1)
  })

  it('零版本不显示版本徽标', () => {
    const w = mount(SpecList, { props: { cards: [card({ version: 0 })] } })
    expect(w.find('.spec-card__version').exists()).toBe(false)
  })

  it('空态：无卡片且非加载 → 文案；加载中不闪空态', () => {
    const empty = mount(SpecList, { props: { cards: [], loading: false } })
    expect(empty.find('[data-spec-list-empty]').exists()).toBe(true)
    expect(empty.text()).toContain('ia2.orchestrate.empty.title')
    expect(empty.text()).toContain('ia2.orchestrate.empty.hint')

    const loadingW = mount(SpecList, { props: { cards: [], loading: true } })
    expect(loadingW.find('[data-spec-list-empty]').exists()).toBe(false)
  })
})

// ── SpecDetail ──
describe('SpecDetail', () => {
  const propsData = { card: card({}), spec: FIVE_PHASE_SPEC }

  it('只读画布接线：layoutFromSpec 投影进 RunGraphCanvas（全 idle、entryNode 透传）；back/create emit', async () => {
    const w = mount(SpecDetail, { props: propsData })
    expect(flowCapture.nodes).toHaveLength(3)
    expect(flowCapture.nodes.every(n => (n.data as { status: string }).status === 'idle')).toBe(true)
    // guard 回边徽标进画布边
    expect(flowCapture.edges.find(e => e.id === 'discovery->stop-check')).toBeTruthy()
    expect(w.find('[data-spec-canvas] .vue-flow-stub').exists()).toBe(true)

    await w.find('[data-spec-back]').trigger('click')
    expect(w.emitted('back')).toHaveLength(1)
    await w.find('[data-spec-create]').trigger('click')
    expect(w.emitted('create')![0][0]).toMatchObject({ id: 'loop-alpha' })
  })

  it('JSON 可折叠查看器：默认收起，展开渲染格式化 spec，再点收起', async () => {
    const w = mount(SpecDetail, { props: propsData })
    expect(w.find('[data-spec-json]').exists()).toBe(false)
    await w.find('[data-spec-json-toggle]').trigger('click')
    const json = w.find('[data-spec-json]')
    expect(json.exists()).toBe(true)
    const parsed = JSON.parse(json.text())
    expect(parsed.id).toBe('loop-alpha')
    expect(parsed.nodes).toHaveLength(3)
    await w.find('[data-spec-json-toggle]').trigger('click')
    expect(w.find('[data-spec-json]').exists()).toBe(false)
  })

  it('导出 JSON：Blob 下载 spec-<id>.json；导入置灰带 P4 tooltip', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock')
    const revokeObjectURL = vi.fn((_url: string) => {})
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
    let downloadedName: string | null = null
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function spyClick(this: HTMLAnchorElement) { downloadedName = this.download })

    try {
      const w = mount(SpecDetail, { props: propsData })
      expect(w.find('[data-spec-import]').attributes('disabled')).toBeDefined()
      expect(w.find('[data-spec-import-wrap]').attributes('title')).toBe('ia2.orchestrate.importDisabledTip')

      await w.find('[data-spec-export]').trigger('click')
      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const blob = createObjectURL.mock.calls[0][0]
      expect(blob).toBeInstanceOf(Blob)
      expect(blob.type).toBe('application/json')
      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(downloadedName).toBe('spec-loop-alpha.json')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    } finally {
      clickSpy.mockRestore()
    }
  })
})

// ── OrchestrateView：三步流 ──
async function mountView(list: Array<Record<string, unknown>> = [FIVE_PHASE_SPEC]) {
  runRest.listSpecs.mockResolvedValue(list)
  const router = makeRouter()
  router.push('/app/orchestrate')
  await router.isReady()
  const wrapper = mount(OrchestrateView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('OrchestrateView — 列表 → 详情 → 实例化', () => {
  it('挂载拉模板库：五阶段与每日 Brief 卡片可见（名称派生）', async () => {
    const { wrapper } = await mountView([
      FIVE_PHASE_SPEC,
      { id: 'daily-brief', version: 1, nodes: [{ id: 'collect', type: 'x', config: {} }], edges: [] },
    ])
    const cards = wrapper.findAll('[data-spec-card]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('alpha')
    expect(cards[1].text()).toContain('daily-brief')
    expect(runRest.listSpecs).toHaveBeenCalledTimes(1)
  })

  it('点卡片进详情（本地选中态），返回还原列表', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[data-spec-card="loop-alpha"]').trigger('click')
    expect(wrapper.find('[data-spec-detail]').exists()).toBe(true)
    expect(flowCapture.nodes).toHaveLength(3)
    await wrapper.find('[data-spec-back]').trigger('click')
    expect(wrapper.find('[data-spec-list]').exists()).toBe(true)
  })

  it('第二步详情页创建钮 → 弹层；goal 必填拦截（不 POST）', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[data-spec-card="loop-alpha"]').trigger('click')
    await wrapper.find('[data-spec-create]').trigger('click')
    expect(wrapper.find('[data-create-dialog]').exists()).toBe(true)
    // 名称预填模板名；goal 留空
    expect((wrapper.find('[data-form-name]').element as HTMLInputElement).value).toBe('alpha')
    await wrapper.find('[data-form-submit]').trigger('submit')
    expect(wrapper.text()).toContain('ia2.orchestrate.err.goalRequired')
    expect(loopRest.createLoop).not.toHaveBeenCalled()
  })

  it('第三步提交：POST 白名单体（cron 调度）→ 跳 /app/runs；弹层随路由离开卸载', async () => {
    const { wrapper, router } = await mountView()
    await wrapper.find('[data-spec-card="loop-alpha"] .spec-card__create').trigger('click')
    await wrapper.find('[data-form-goal]').setValue('每天早上检查告警')
    await wrapper.find('[data-form-cron]').setValue('0 8 * * 1-5')
    await wrapper.find('[data-form-tenant]').setValue(' room:topic ')
    await wrapper.find('[data-form-submit]').trigger('submit')
    await flushPromises()

    expect(loopRest.createLoop).toHaveBeenCalledTimes(1)
    const payload = loopRest.createLoop.mock.calls[0][0]
    expect(payload.name).toBe('alpha')
    expect(payload.goal).toBe('每天早上检查告警')
    expect(payload.schedule).toEqual({ mode: 'cron', cron: '0 8 * * 1-5', timezone: 'Asia/Shanghai' })
    expect(payload.tenant).toBe('room:topic')
    expect(String(payload.id)).toMatch(/^loop-alpha-\d+$/)
    expect(router.currentRoute.value.path).toBe('/app/runs')
  })

  it('创建失败：错误上屏、留在编排区可重试', async () => {
    loopRest.createLoop.mockRejectedValue(new Error('boom'))
    const { wrapper, router } = await mountView()
    await wrapper.find('[data-spec-card="loop-alpha"] .spec-card__create').trigger('click')
    await wrapper.find('[data-form-goal]').setValue('g')
    await wrapper.find('[data-form-submit]').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-submit-error]').exists()).toBe(true)
    expect(wrapper.find('[data-submit-error]').text()).toContain('boom')
    expect(router.currentRoute.value.path).toBe('/app/orchestrate')
  })

  it('空模板库：空态文案（首拉完成后）', async () => {
    const { wrapper } = await mountView([])
    expect(wrapper.find('[data-spec-list-empty]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ia2.orchestrate.empty.title')
  })

  it('加载失败：错误与重试钮，重试恢复列表', async () => {
    runRest.listSpecs.mockRejectedValueOnce(new Error('net-down'))
    const router = makeRouter()
    router.push('/app/orchestrate')
    await router.isReady()
    const wrapper = mount(OrchestrateView, { global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('ia2.orchestrate.loadFailed')

    runRest.listSpecs.mockResolvedValue([FIVE_PHASE_SPEC])
    await wrapper.find('.ia-orchestrate__retry').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-spec-card]')).toHaveLength(1)
  })
})
