// @vitest-environment jsdom
// overlay/custom/client/loop/orchestrator/__tests__/editor-components.test.ts
// P4 T6/T7 —— 编辑器组件 jsdom 冒烟：SpecEditorView 保存/试跑/导入导出闭环、
// 编辑守卫（validate 失败禁用保存、entry 兜底黄条、警告定位）、面板加节点、
// 容器合并；NodeConfigPanel 表单镜像与 config 上抛；EditorCanvas 画布投影
// （节点/边/选中/违法边标红）。vue-flow 以 stub 替身挂载（同 runcenter 惯例），
// runcenter REST 全桩。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── @vue-flow/core stub：捕获 nodes/edges props，渲染编辑节点/容器框插槽 ──
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
const { rest } = vi.hoisted(() => ({
  rest: {
    saveSpec: vi.fn(async () => ({ ok: true, id: 'my-graph' })),
    startSpecRun: vi.fn(async () => ({ runId: 'run-42', instance: {} })),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({ runRest: rest }))
vi.mock('@/api/client', () => ({ request: vi.fn(), getApiKey: () => '', getBaseUrlValue: () => '' }))

import SpecEditorView from '../views/SpecEditorView.vue'
import EditorCanvas from '../components/EditorCanvas.vue'
import type { GraphSpec } from '../spec'

// ── 夹具：合法线性图（seed → work → done，走真实纯函数链路构造）──
import { emptySpec, addToSpec, addEdge, canvasToSpec } from '../adapters/editor'

function linearDocSpec(): GraphSpec {
  let doc = emptySpec()
  doc.id = 'my-graph'
  doc = addToSpec(doc, 'function')
  doc = addToSpec(doc, 'function')
  doc = addToSpec(doc, 'function')
  doc = addEdge(doc, 'function-1', 'function-2')
  doc = addEdge(doc, 'function-2', 'function-3')
  return canvasToSpec(doc).spec
}

function makeRouter(): Router {
  const stub = { template: '<div class="route-stub" />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/orchestrate', component: stub },
      { path: '/app/runs/:runId', name: 'ia2.runDetail', component: stub },
    ],
  })
}

async function mountEditor(initialSpec: GraphSpec | null = null) {
  rest.saveSpec.mockClear()
  rest.startSpecRun.mockClear()
  const router = makeRouter()
  router.push('/app/orchestrate')
  await router.isReady()
  const wrapper = mount(SpecEditorView, {
    props: { initialSpec, existingSpecs: [{ id: 'other', version: 3 }] },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

/** 经面板点击加节点（真实用户路径） */
async function addViaPalette(wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'], type: string, n = 1): Promise<void> {
  for (let i = 0; i < n; i++) {
    await wrapper.find(`[data-palette-item="${type}"]`).trigger('click')
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  flowCapture.nodes = []
  flowCapture.edges = []
})

describe('SpecEditorView — 画布与配置联动', () => {
  it('面板点击加节点：节点进画布（自动唯一 id）、首节点即入口、plan 补三通道', async () => {
    const { wrapper } = await mountEditor()
    expect(wrapper.find('[data-editor-canvas-empty]').exists()).toBe(true)
    await wrapper.find('[data-editor-name]').setValue('my-graph')
    await addViaPalette(wrapper, 'function')
    await addViaPalette(wrapper, 'plan')

    const nodeIds = flowCapture.nodes.map(n => String(n.id))
    expect(nodeIds).toEqual(['function-1', 'plan-1'])
    expect(wrapper.find('[data-editor-canvas-empty]').exists()).toBe(false)
    // plan 三通道出现在右侧通道卡
    expect(wrapper.find('[data-channels-card]').text()).toContain('planResult')
    expect(wrapper.find('[data-channels-card]').text()).toContain('planDecision')
  })

  it('点选节点 → 配置面板联动；改 label 经 update 上抛进 config', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    await wrapper.find('[data-node-id="function-1"]').trigger('click')
    const panel = wrapper.find('[data-config-panel]')
    expect(panel.attributes('data-node-id')).toBe('function-1')
    expect((panel.find('[data-cfg-id]').element as HTMLInputElement).value).toBe('function-1')

    await panel.find('[data-cfg-label]').setValue('种子')
    await flushPromises()
    // save 的 spec 携带改后的 label
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    const spec = rest.saveSpec.mock.calls[0][0] as GraphSpec
    expect(spec.nodes.find(n => n.id === 'function-1')?.config.label).toBe('种子')
  })

  it('选中多节点合并容器：containers 进 spec；解散清元数据', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    await wrapper.find('[data-node-id="function-1"]').trigger('click')
    await wrapper.find('[data-node-id="function-2"]').trigger('click', { ctrlKey: true })
    await wrapper.find('[data-wrap-container]').trigger('click')
    expect(wrapper.find('[data-container="loop-container-1"]').exists()).toBe(true)

    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    const spec = rest.saveSpec.mock.calls[0][0] as GraphSpec
    expect(spec.containers).toEqual([{ id: 'loop-container-1', nodeIds: ['function-1', 'function-2'] }])

    await wrapper.find('[data-unwrap="loop-container-1"]').trigger('click')
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    expect((rest.saveSpec.mock.calls[1][0] as GraphSpec).containers).toBeUndefined()
  })
})

describe('SpecEditorView — 编辑守卫', () => {
  it('validate 失败禁用保存：空画布禁用 → 补 id 与节点后恢复', async () => {
    const { wrapper } = await mountEditor()
    expect(wrapper.find('[data-editor-save]').attributes('disabled')).toBeDefined()

    await wrapper.find('[data-editor-name]').setValue('my-graph')
    await addViaPalette(wrapper, 'function')
    await flushPromises()
    expect(wrapper.find('[data-editor-save]').attributes('disabled')).toBeUndefined()
  })

  it('id 非法（中文/空格）保存禁用 + 校验面板显示错误文案 key', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    await wrapper.find('[data-editor-name]').setValue('我的图')
    await flushPromises()
    expect(wrapper.find('[data-editor-save]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-validation-issue]').text()).toContain('ia2.orchestrate.editor.err.idInvalid')
  })

  it('孤立节点 → validate 透传服务端 message（直显）+ 保存禁用', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    await addViaPalette(wrapper, 'gate') // 无入边
    await flushPromises()
    const issue = wrapper.find('[data-validation-issue]')
    expect(issue.text()).toContain('Unreachable node')
    expect(wrapper.find('[data-editor-save]').attributes('disabled')).toBeDefined()
  })

  it('无终止配置黄条（警告级不阻断保存）：警告列表渲染、点击定位不炸', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    const warn = wrapper.find('[data-validation-warning="no-end-condition"]')
    expect(warn.exists()).toBe(true)
    await warn.trigger('click') // 该警告无 nodeId/edgeIndex → locate 空操作
    expect(wrapper.find('[data-editor-save]').attributes('disabled')).toBeUndefined()
  })

  it('entryNode 缺失：序列化兜底取首节点 + 黄条提示', async () => {
    // 构造 entryNode 为 null 的初始 spec（画布入口未设）
    const spec = linearDocSpec()
    const { wrapper } = await mountEditor({ ...spec, entryNode: 'ghost' } as GraphSpec)
    await flushPromises()
    expect(wrapper.find('[data-entry-fallback]').exists()).toBe(true)
    // 兜底后仍可保存（entry = 首节点）
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    const saved = rest.saveSpec.mock.calls[0][0] as GraphSpec
    expect(saved.entryNode).toBe('function-1')
  })
})

describe('SpecEditorView — 保存 / 试跑闭环', () => {
  it('保存调用 saveSpec（origin=editor、converge joinMode=all）；成功后可试跑', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    expect(wrapper.find('[data-editor-tryrun]').attributes('disabled')).toBeDefined() // 未保存不可试跑

    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    expect(rest.saveSpec).toHaveBeenCalledTimes(1)
    const spec = rest.saveSpec.mock.calls[0][0] as GraphSpec
    expect(spec.id).toBe('my-graph')
    expect(spec.origin).toBe('editor')
    expect(wrapper.emitted('saved')![0][0]).toMatchObject({ id: 'my-graph' })
    expect(wrapper.find('[data-editor-tryrun]').attributes('disabled')).toBeUndefined()

    // 保存后再编辑 → 试跑再次禁用（脏文档）
    await addViaPalette(wrapper, 'gate')
    expect(wrapper.find('[data-editor-tryrun]').attributes('disabled')).toBeDefined()
  })

  it('试跑成功：startSpecRun → push /app/runs/:runId', async () => {
    const { wrapper, router } = await mountEditor(linearDocSpec())
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-editor-tryrun]').trigger('click')
    await flushPromises()
    expect(rest.startSpecRun).toHaveBeenCalledWith('my-graph')
    expect(router.currentRoute.value.path).toBe('/app/runs/run-42')
  })

  it('试跑失败（501/400）：错误直显不跳转', async () => {
    rest.startSpecRun.mockRejectedValueOnce(Object.assign(new Error('API Error 501: Spec runtime not configured (GRAPH_ENGINE=on required)'), { status: 501 }))
    const { wrapper, router } = await mountEditor(linearDocSpec())
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-editor-tryrun]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-run-error]').text()).toContain('GRAPH_ENGINE')
    expect(router.currentRoute.value.path).toBe('/app/orchestrate')
  })
})

/** FileReader 的 load 事件异步派发：等一个宏任务再冲微任务 */
async function flushFile(): Promise<void> {
  await new Promise(r => setTimeout(r, 0))
  await flushPromises()
}

describe('SpecEditorView — 导入 / 导出 round-trip', () => {
  /** jsdom Blob 无 .text()——经 FileReader 读内容 */
  function readBlob(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('read error'))
      r.readAsText(blob)
    })
  }

  function stubDownload(): { blobs: Blob[]; names: string[] } {
    const blobs: Blob[] = []
    const names: string[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob)
      return 'blob:mock'
    }) as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL
    vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function spyClick(this: HTMLAnchorElement) {
        names.push(this.download)
      })
    return { blobs, names }
  }

  it('导出 → 导入 round-trip：导出的 spec JSON 再导入画布，节点/边/通道无损', async () => {
    const { blobs, names } = stubDownload()
    const spec = linearDocSpec()
    const { wrapper } = await mountEditor(spec)

    await wrapper.find('[data-editor-export]').trigger('click')
    expect(names).toEqual(['spec-my-graph.json'])
    const exported = JSON.parse(await readBlob(blobs[0])) as GraphSpec
    expect(exported.id).toBe('my-graph')
    expect(exported.nodes).toHaveLength(3)

    // 导入：同 id 已在 existingSpecs？此处 existing=other → 版本原样；文件输入走 change
    const fileInput = wrapper.find('[data-editor-file]')
    const file = new File([JSON.stringify(exported)], 'spec.json', { type: 'application/json' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await flushFile()

    // 画布重建出 3 节点 2 边；保存体与导出体语义一致（round-trip）
    expect(flowCapture.nodes.map(n => String(n.id))).toEqual(['function-1', 'function-2', 'function-3'])
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    const saved = rest.saveSpec.mock.calls[0][0] as GraphSpec
    expect(saved.nodes).toEqual(exported.nodes)
    expect(saved.edges).toEqual(exported.edges)
    expect(saved.channels).toEqual(exported.channels)
  })

  it('导入 id 已存在 → version = 最大版本 +1', async () => {
    const { wrapper } = await mountEditor()
    const spec = { ...linearDocSpec(), id: 'other', version: 1 }
    const fileInput = wrapper.find('[data-editor-file]')
    const file = new File([JSON.stringify(spec)], 'spec.json', { type: 'application/json' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await flushFile()
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    expect((rest.saveSpec.mock.calls[0][0] as GraphSpec).version).toBe(4) // existing other v3 → 4
  })

  it('导入坏 JSON：红条直显 message，画布不动', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    const fileInput = wrapper.find('[data-editor-file]')
    const file = new File(['{oops'], 'spec.json', { type: 'application/json' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await flushFile()
    expect(wrapper.find('[data-import-error]').text()).toContain('Invalid JSON')
    expect(flowCapture.nodes).toHaveLength(3)
  })
})

describe('NodeConfigPanel — 表单镜像', () => {
  it('未选中显示占位；fanout 显示结构提示（无 config 表单）', async () => {
    const { wrapper } = await mountEditor()
    expect(wrapper.find('[data-config-panel-empty]').exists()).toBe(true)
    await addViaPalette(wrapper, 'fanout')
    await wrapper.find('[data-node-id="fanout-1"]').trigger('click')
    const panel = wrapper.find('[data-config-panel]')
    expect(panel.text()).toContain('ia2.orchestrate.editor.config.cfg.fanoutHint')
  })

  it('converge 表单改 expect/pick → config 上抛（joinMode 由序列化补）', async () => {
    const { wrapper } = await mountEditor()
    await wrapper.find('[data-editor-name]').setValue('my-graph')
    await addViaPalette(wrapper, 'converge')
    await wrapper.find('[data-node-id="converge-1"]').trigger('click')
    await wrapper.find('[data-cfg-expect]').setValue('3')
    await wrapper.find('[data-cfg-pick]').setValue('score')
    await flushPromises()
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    const spec = rest.saveSpec.mock.calls[0][0] as GraphSpec
    const converge = spec.nodes.find(n => n.id === 'converge-1')
    expect(converge?.config).toMatchObject({ expect: 3, pick: 'score' })
    expect(converge?.joinMode).toBe('all')
  })

  it('function 的 set JSON 非法不上抛（保留输入 + 错误提示）', async () => {
    const { wrapper } = await mountEditor(linearDocSpec())
    await wrapper.find('[data-node-id="function-1"]').trigger('click')
    await wrapper.find('[data-cfg-set]').setValue('{"seed": 1}')
    await flushPromises()
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    let spec = rest.saveSpec.mock.calls[0][0] as GraphSpec
    expect(spec.nodes.find(n => n.id === 'function-1')?.config.set).toEqual({ seed: 1 })

    await wrapper.find('[data-cfg-set]').setValue('{oops')
    await flushPromises()
    expect(wrapper.find('.ncp__err').text()).toContain('setInvalid')
    await wrapper.find('[data-editor-save]').trigger('click')
    await flushPromises()
    spec = rest.saveSpec.mock.calls[1][0] as GraphSpec
    // 非法期间最后一次合法值保留
    expect(spec.nodes.find(n => n.id === 'function-1')?.config.set).toEqual({ seed: 1 })
  })
})

describe('EditorCanvas — 画布投影', () => {
  function mountCanvas(overrides: Record<string, unknown> = {}) {
    return mount(EditorCanvas, {
      props: {
        doc: {
          ...emptySpec(),
          nodes: [
            { id: 'a', type: 'function', config: { label: '甲' }, x: 0, y: 0 },
            { id: 'b', type: 'converge', config: {}, x: 200, y: 0 },
          ],
          edges: [{ from: 'a', to: 'b' }],
        },
        selectedNodeIds: ['b'],
        selectedEdgeId: null,
        invalidEdgeIds: ['a->b'],
        warningNodeIds: [],
        ...overrides,
      },
    })
  }

  it('节点/边投影：选中类、违法边红描边、guard 徽标 ×N', () => {
    const w = mountCanvas()
    expect(flowCapture.nodes.map(n => String(n.id))).toEqual(['a', 'b'])
    expect(flowCapture.nodes[1].class).toContain('is-selected')
    const edge = flowCapture.edges[0] as { id: string; style: { stroke: string; strokeWidth: number } }
    expect(edge.id).toBe('a->b')
    expect(edge.style.strokeWidth).toBe(2) // 违法边加粗
    expect(w.find('[data-node-id="a"]').text()).toContain('甲')

    // guard 回边徽标（doc 带守卫回边时）
    mountCanvas({
      doc: {
        ...emptySpec(),
        nodes: [
          { id: 'a', type: 'function', config: {}, x: 0, y: 0 },
          { id: 'b', type: 'function', config: {}, x: 200, y: 0 },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'a', guard: { maxIterations: 3 } },
        ],
      },
    })
    const back = flowCapture.edges[1] as { label?: string; style: { strokeDasharray?: string } }
    expect(back.label).toBe('×3')
    expect(back.style.strokeDasharray).toBe('6 4')
  })

  it('空画布显示空态占位', () => {
    const w = mount(EditorCanvas, {
      props: {
        doc: emptySpec(),
        selectedNodeIds: [],
        selectedEdgeId: null,
        invalidEdgeIds: [],
        warningNodeIds: [],
      },
    })
    expect(w.find('[data-editor-canvas-empty]').exists()).toBe(true)
    expect(w.find('.vue-flow-stub').exists()).toBe(false)
  })
})
