// @vitest-environment jsdom
// 本体工作台视图冒烟：挂载 + 概览统计卡 + 页签切换（模式页类型卡渲染——
// 防 computed<泛型> 编译拆链回归：曾产出 "computed < Array(() =>" 使 v-for 恒空，
// 浏览器走查抓到；本测试在 jsdom 用真编译产物锚同一断言）+ 数据契约预检路径。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('@vue-flow/core', () => ({
  VueFlow: { name: 'VueFlow', props: ['nodes', 'edges', 'fitViewOnInit', 'zoomOnScroll', 'panOnScroll'], template: '<div class="vue-flow-stub" />' },
}))
vi.mock('@/custom/ontology/api', () => ({
  ontologyApi: {
    getSpec: vi.fn(),
    listInstances: vi.fn(),
    validate: vi.fn(),
    createInstance: vi.fn(),
    replaceInstance: vi.fn(),
    deleteInstance: vi.fn(),
    listVersions: vi.fn(),
    rollback: vi.fn(),
    resetSeed: vi.fn(),
    saveSpec: vi.fn(),
    exportText: vi.fn(),
  },
  constraintsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    preview: vi.fn(),
  },
  parseList: (v: string) => v.split(/[,，;；\s]+/).map((s: string) => s.trim()).filter(Boolean),
}))
// @/api/client 被 api.ts 引用——mock 掉 request（不被直接使用但防链式副作用）
vi.mock('@/api/client', () => ({ request: vi.fn(), getBaseUrlValue: () => '' }))

import OntologyView from '@/custom/ontology/views/OntologyView.vue'
import { seedSpec, seedInstances } from '../../../server/ontology/ontology-seed'
import { ontologyApi as apiMocks, constraintsApi as ctrMocks } from '@/custom/ontology/api'
import { ontologyMessages } from '@/custom/ontology/i18n'

function keyPaths(obj: Record<string, unknown>, base = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const p = base ? `${base}.${k}` : k
    return v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, p) : [p]
  })
}

describe('i18n 键齐平（zh/en 词面守门）', () => {
  it('zh 与 en 键路径完全一致', () => {
    expect(keyPaths(ontologyMessages.en as never)).toEqual(keyPaths(ontologyMessages.zh as never))
  })
})

function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] })
  return mount(OntologyView, { global: { plugins: [router] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getSpec.mockResolvedValue({
    ok: true, spec: seedSpec(0), stats: { typeCount: 16, dataPropCount: 51, objPropCount: 12, axiomCount: 6, instanceCount: 2 },
    health: { error: 0, warning: 0, info: 0 },
  })
})

describe('OntologyView 冒烟', () => {
  it('挂载出概览：统计卡 + 零违规徽标 + 版本 IRI', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-testid="ontology-view"]').exists()).toBe(true)
    const cards = w.findAll('.onto-card')
    expect(cards.length).toBe(5)
    expect(cards[0].text()).toContain('16')
    expect(w.find('[data-testid="ontology-health-clean"]').exists()).toBe(true)
    expect(w.text()).toContain('/v1')
  })

  it('模式页：四组类型卡渲染（computed 无泛型编译链守门）', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="onto-tab-schema"]').trigger('click')
    expect(w.find('[data-testid="onto-type-Task"]').exists()).toBe(true)
    expect(w.find('[data-testid="onto-type-Agent"]').exists()).toBe(true)
    expect(w.findAll('.onto-group').length).toBe(4)
    // 对象属性表带 Domain/Range
    expect(w.text()).toContain('assignedTo')
  })

  it('实例页：预检违规路径（必填缺失 → field:required 呈现且不保存）', async () => {
    apiMocks.validate.mockResolvedValue({
      ok: true, persisted: false, count: 1,
      violations: [{ severity: 'error', code: 'field:required', subject: 'x', path: 'title', detail: '必填数据属性缺失' }],
      summary: { error: 1, warning: 0, info: 0 },
    })
    apiMocks.listInstances.mockResolvedValue({ ok: true, instances: seedInstances(0), total: 2 })
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="onto-tab-instances"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('std-gbt-48000-3')
    await w.find('[data-testid="ontology-inst-new"]').trigger('click')
    expect(w.find('[data-testid="ontology-inst-editor"]').exists()).toBe(true)
    // 直接点保存：预检返回 error → 不提交写入
    await w.find('[data-testid="ontology-inst-save"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ontology-editor-violations"]').text()).toContain('field:required')
    expect(apiMocks.createInstance).not.toHaveBeenCalled()
  })

  it('约束卡页签：列表渲染 + 空态（2026-10-14 阿里调研轮 D）', async () => {
    ctrMocks.list.mockResolvedValue({
      ok: true,
      cards: [{
        id: 'ctr-001', statement: '在已有 API 上扩展能力，不新增并列 API',
        scope: { columns: ['devimpl'] }, sourceAnchor: 'specs/x.md', enabled: true,
        createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z',
      }],
    })
    const w = mountView()
    await flushPromises()
    await w.find('[data-testid="onto-tab-constraints"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ontology-ctr-row-ctr-001"]').exists()).toBe(true)
    expect(w.text()).toContain('不新增并列 API')
    expect(ctrMocks.list).toHaveBeenCalled()
  })
})
