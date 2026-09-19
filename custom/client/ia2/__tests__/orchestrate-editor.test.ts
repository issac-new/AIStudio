// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/orchestrate-editor.test.ts
// P4 —— OrchestrateView 编辑器接线 jsdom 冒烟：新建空白图入口、editor 卡片
// 编辑/删除（confirm + DELETE + 刷新）、实例化表单预填 spec.meta（goal/cron）
// 与 payload.template、SpecDetail 试跑跳转、卡片 description 显示、containers
// 透传 RunGraphCanvas 包围框。vue-flow stub（含 Handle/Position），REST 全桩。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── @vue-flow/core stub：捕获 nodes/edges props（SpecEditorView→EditorCanvas 与
//    SpecDetail→RunGraphCanvas 两处画布共用）──
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
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
    Handle: (props: { type?: string }) => h('div', { class: 'handle-stub', 'data-handle': props?.type }),
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
            ctx.slots[n.type === 'editor-node' ? 'node-editor-node' : 'node-run-node']?.({ id: n.id, data: n.data }),
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
    saveSpec: vi.fn(async () => ({ ok: true, id: 'x' })),
    deleteSpec: vi.fn(async () => ({ ok: true, id: 'x' })),
    startSpecRun: vi.fn(async () => ({ runId: 'run-9', instance: {} })),
  },
  loopRest: {
    createLoop: vi.fn(async () => ({ id: 'loop-x' })),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({ runRest }))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

import OrchestrateView from '../views/OrchestrateView.vue'

// ── 夹具 ──
const TEMPLATE_SPEC = {
  id: 'loop-alpha',
  version: 1,
  nodes: [
    { id: 'discovery', type: 'phase-discovery', config: { label: 'alpha:discovery' } },
    { id: 'handoff', type: 'phase-handoff', config: {} },
  ],
  edges: [{ from: 'discovery', to: 'handoff' }],
  entryNode: 'discovery',
  limits: { maxSteps: 100 },
}

/** editor origin 自建图：description + meta(goal/cron) + containers */
const EDITOR_SPEC = {
  id: 'my-graph',
  version: 2,
  origin: 'editor',
  description: '自建：置值到审批的最小闭环',
  meta: { goal: '每天核对账单', cron: '0 8 * * 1-5' },
  channels: { seed: { reducer: 'overwrite' } },
  nodes: [
    { id: 'seed', type: 'function', config: { set: { seed: true }, label: '种子' } },
    { id: 'review', type: 'human', config: { prompt: '看一眼' } },
  ],
  edges: [{ from: 'seed', to: 'review' }],
  entryNode: 'seed',
  limits: { maxSteps: 50 },
  containers: [{ id: 'loop-container-1', label: '主环', nodeIds: ['seed', 'review'] }],
}

function makeRouter(): Router {
  const stub = { template: '<div class="route-stub" />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/orchestrate', component: stub },
      { path: '/app/runs', name: 'ia2.runs', component: stub },
      { path: '/app/runs/:runId', name: 'ia2.runDetail', component: stub },
    ],
  })
}

async function mountView(list: Array<Record<string, unknown>> = [TEMPLATE_SPEC, EDITOR_SPEC]) {
  runRest.listSpecs.mockResolvedValue(list)
  const router = makeRouter()
  router.push('/app/orchestrate')
  await router.isReady()
  const wrapper = mount(OrchestrateView, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises() // SpecEditorView 异步组件解析
  return { wrapper, router }
}

beforeEach(() => {
  vi.clearAllMocks()
  flowCapture.nodes = []
  flowCapture.edges = []
})

describe('OrchestrateView — P4 编辑器接线', () => {
  it('头部"新建空白图"→ 进编辑器（空画布）', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-new-blank-graph]').exists()).toBe(true)
    await wrapper.find('[data-new-blank-graph]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-spec-editor]').exists()).toBe(true))
    expect(wrapper.find('[data-editor-canvas-empty]').exists()).toBe(true)
    expect(wrapper.find('[data-spec-list]').exists()).toBe(false)
  })

  it('editor 卡片"编辑"→ 编辑器装载该 spec 节点；"返回"回列表', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[data-card-edit="my-graph"]').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-spec-editor]').exists()).toBe(true))
    expect(flowCapture.nodes.map(n => String(n.id))).toEqual(['seed', 'review'])

    await wrapper.find('[data-editor-back]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-spec-list]').exists()).toBe(true)
    // 返回时刷新列表
    expect(runRest.listSpecs.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('editor 卡片"删除"：confirm 确认 → DELETE → 刷新；取消不删', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper } = await mountView()
    await wrapper.find('[data-card-delete="my-graph"]').trigger('click')
    await flushPromises()
    expect(runRest.deleteSpec).not.toHaveBeenCalled()

    confirmSpy.mockReturnValue(true)
    await wrapper.find('[data-card-delete="my-graph"]').trigger('click')
    await flushPromises()
    expect(runRest.deleteSpec).toHaveBeenCalledWith('my-graph')
    expect(runRest.listSpecs.mock.calls.length).toBeGreaterThanOrEqual(2)
    confirmSpy.mockRestore()
  })

  it('模板卡（origin 非 editor）无编辑/删除钮', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-card-edit="loop-alpha"]').exists()).toBe(false)
    expect(wrapper.find('[data-card-delete="loop-alpha"]').exists()).toBe(false)
  })

  it('卡片 description：editor 卡显示 spec 描述，模板卡显示种类描述', async () => {
    const { wrapper } = await mountView()
    const editorCard = wrapper.find('[data-spec-card="my-graph"]')
    expect(editorCard.find('[data-card-desc="spec"]').exists()).toBe(true)
    expect(editorCard.text()).toContain('自建：置值到审批的最小闭环')
    const templateCard = wrapper.find('[data-spec-card="loop-alpha"]')
    expect(templateCard.find('[data-card-desc="spec"]').exists()).toBe(false)
    expect(templateCard.text()).toContain('ia2.orchestrate.desc.five-phase')
  })
})

describe('OrchestrateView — 实例化表单预填（meta）', () => {
  it('editor 卡 goal/cron 预填 spec.meta；提交 payload 带 template=卡片 id', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[data-spec-card="my-graph"] .spec-card__create').trigger('click')
    expect((wrapper.find('[data-form-goal]').element as HTMLTextAreaElement).value).toBe('每天核对账单')
    expect((wrapper.find('[data-form-cron]').element as HTMLInputElement).value).toBe('0 8 * * 1-5')
    await wrapper.find('[data-form-submit]').trigger('submit')
    await flushPromises()
    const payload = loopRest.createLoop.mock.calls[0][0]
    expect(payload.template).toBe('my-graph')
    expect(payload.goal).toBe('每天核对账单')
  })

  it('模板卡无 meta：goal 留空、cron 落常用日调度', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[data-spec-card="loop-alpha"] .spec-card__create').trigger('click')
    expect((wrapper.find('[data-form-goal]').element as HTMLTextAreaElement).value).toBe('')
    expect((wrapper.find('[data-form-cron]').element as HTMLInputElement).value).toBe('0 9 * * *')
    await wrapper.find('[data-form-goal]').setValue('g')
    await wrapper.find('[data-form-submit]').trigger('submit')
    await flushPromises()
    const payload = loopRest.createLoop.mock.calls[0][0]
    expect(payload.template).toBe('loop-alpha')
  })
})

describe('OrchestrateView — 详情页试跑与容器框', () => {
  it('editor origin 详情有"试跑"：startSpecRun → 跳 /app/runs/:runId', async () => {
    const { wrapper, router } = await mountView()
    await wrapper.find('[data-spec-card="my-graph"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-spec-tryrun]').trigger('click')
    await flushPromises()
    expect(runRest.startSpecRun).toHaveBeenCalledWith('my-graph')
    expect(router.currentRoute.value.path).toBe('/app/runs/run-9')
  })

  it('试跑失败：错误直显（501/400 message），不跳转', async () => {
    runRest.startSpecRun.mockRejectedValueOnce(new Error('API Error 501: Spec runtime not configured'))
    const { wrapper, router } = await mountView()
    await wrapper.find('[data-spec-card="my-graph"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-spec-tryrun]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Spec runtime not configured')
    expect(router.currentRoute.value.path).toBe('/app/orchestrate')
  })

  it('模板详情无试跑钮；spec.containers 透传画包围框', async () => {
    const { wrapper } = await mountView()
    await wrapper.find('[data-spec-card="loop-alpha"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-spec-tryrun]').exists()).toBe(false)

    await wrapper.find('[data-spec-back]').trigger('click')
    await wrapper.find('[data-spec-card="my-graph"]').trigger('click')
    await flushPromises()
    const frame = flowCapture.nodes.find(n => n.type === 'rg-container')
    expect(frame).toBeTruthy()
    expect((frame!.data as { label: string }).label).toBe('主环')
  })
})
