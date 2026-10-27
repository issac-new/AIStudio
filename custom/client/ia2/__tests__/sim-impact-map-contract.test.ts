// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-impact-map-contract.test.ts
// 影响推演与业务地图契约：响应解包、annotation 列表、保存成功与旧 rev 拒绝。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ path: '/app/sim', query: {} }),
}))

vi.mock('@vue-flow/core', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    VueFlow: defineComponent({
      name: 'VueFlow',
      props: { nodes: { type: Array, default: () => [] } },
      setup(props) {
        return () => h('div', { 'data-testid': 'vue-flow-stub' },
          (props.nodes as Array<{ id: string; data?: { label?: string } }>).map((node) =>
            h('div', {
              key: node.id,
              class: 'vue-flow__node',
              'data-id': node.id,
              'data-testid': `sim-map-node-${node.id}`,
            }, String(node.data?.label ?? '')),
          ),
        )
      },
    }),
  }
})

vi.mock('../api/mapnotes-socket', () => ({ subscribeMapnotes: vi.fn() }))
vi.mock('../api/sim-director', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sim-director')>()
  return {
    ...actual,
    fetchDirectorScenarios: vi.fn(),
    fetchSimLaunchStatus: vi.fn(),
    analyzeRequirementImpact: vi.fn(),
    suggestModules: vi.fn(),
    fetchMapAnnotations: vi.fn(),
    saveMapAnnotation: vi.fn(),
    deleteMapAnnotation: vi.fn(),
  }
})

import {
  analyzeRequirementImpact, fetchDirectorScenarios, fetchMapAnnotations, fetchSimLaunchStatus,
  saveMapAnnotation, type MapAnnotationDto, type RequirementImpactDto,
} from '../api/sim-director'
import { subscribeMapnotes } from '../api/mapnotes-socket'
import DirectorPanel from '../views/sim/DirectorPanel.vue'
import BusinessMapView from '../views/sim/BusinessMapView.vue'

const mockedAnalyze = vi.mocked(analyzeRequirementImpact)
const mockedFetchAnnotations = vi.mocked(fetchMapAnnotations)
const mockedSaveAnnotation = vi.mocked(saveMapAnnotation)
const FINGERPRINT = 'abc123'

const IMPACT: RequirementImpactDto = {
  title: '统一收银台',
  description: '商户需要统一收银台',
  entities: [{
    source: 'ontology-instance', id: 'merchant', label: '商户', matchedTerm: '商户',
    docs: ['docs/spec.md'],
  }],
  relatedSpecs: [{
    file: 'docs/spec.md', title: '收银台规格', date: '2026-10-27', matchedLine: '统一收银台',
  }],
  suggestedModules: ['pay-core'],
  boundary: '规则式词面命中，需人工确认。',
  counts: { ontology: 1, boardKg: 0, fibo: 0, specs: 1 },
}

function annotation(nodeId: string, overrides: Partial<MapAnnotationDto> = {}): MapAnnotationDto {
  return {
    nodeId, note: '已核对', checked: true, by: 'map-editor', at: 1, rev: 1,
    ...overrides,
  }
}

async function mountAnalyzedMap(initialAnnotations: MapAnnotationDto[] = []) {
  mockedFetchAnnotations.mockResolvedValue(initialAnnotations)
  const wrapper = mount(BusinessMapView, { global: { stubs: { IaBreadcrumb: true } } })
  await wrapper.find('[data-testid="sim-map-title"]').setValue(IMPACT.title)
  await wrapper.find('[data-testid="sim-map-desc"]').setValue(IMPACT.description)
  await wrapper.find('[data-testid="sim-map-analyze"]').trigger('click')
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(fetchDirectorScenarios).mockResolvedValue([])
  vi.mocked(fetchSimLaunchStatus).mockResolvedValue({
    ok: true, enabled: false, running: false, process: null,
    script: 'sim.sh', simRoot: '/tmp/sim', driverLock: false,
  })
  mockedAnalyze.mockResolvedValue({ fingerprint: FINGERPRINT, impact: IMPACT })
  vi.mocked(subscribeMapnotes).mockReturnValue(vi.fn())
})

describe('DirectorPanel — 影响推演响应契约', () => {
  it('解包 impact DTO 后渲染计数、实体、模块与关联 spec', async () => {
    const wrapper = mount(DirectorPanel, { global: { stubs: { OverviewPanel: true } } })
    await flushPromises()
    await wrapper.find('[data-testid="director-form-title"]').setValue(IMPACT.title)
    await wrapper.find('[data-testid="director-form-desc"]').setValue(IMPACT.description)
    await wrapper.find('[data-testid="director-impact"]').trigger('click')
    await flushPromises()

    expect(mockedAnalyze).toHaveBeenCalledWith(IMPACT.title, IMPACT.description)
    const card = wrapper.find('[data-testid="director-impact-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('本体 1')
    expect(card.text()).toContain('商户')
    expect(card.text()).toContain('pay-core')
    expect(card.text()).toContain('收银台规格')
    expect(card.text()).toContain(IMPACT.boundary)
    wrapper.unmount()
  })
})

describe('BusinessMapView — 标注响应契约', () => {
  it('按 MapAnnotationDto[] 列表形状读取历史标注并落到对应节点', async () => {
    const wrapper = await mountAnalyzedMap([
      annotation('mod-pay-core', { rev: 4 }),
      annotation('ent-ontology-instance-merchant', { note: '待复核', checked: false, rev: 2 }),
    ])

    expect(mockedFetchAnnotations).toHaveBeenCalledWith(FINGERPRINT)
    expect(wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').text()).toContain('✓')
    expect(wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').text()).toContain('[模块] pay-core')
    expect(wrapper.find('[data-testid="sim-map-node-ent-ontology-instance-merchant"]').text()).toContain('✎')
    wrapper.unmount()
  })

  it('正常保存只把响应中的 annotation 写入列表并显示真实成功反馈', async () => {
    const wrapper = await mountAnalyzedMap()
    await wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').trigger('click')
    await wrapper.find('[data-testid="sim-map-note-input"]').setValue('人工确认支付核心')
    await wrapper.find('[data-testid="sim-map-note-checked"]').setValue(true)
    mockedSaveAnnotation.mockResolvedValue({
      annotation: annotation('mod-pay-core', { note: '人工确认支付核心', checked: true, rev: 1 }),
      applied: true,
    })

    await wrapper.find('[data-testid="sim-map-note-save"]').trigger('click')
    await flushPromises()

    expect(mockedSaveAnnotation).toHaveBeenCalledWith(FINGERPRINT, {
      nodeId: 'mod-pay-core', note: '人工确认支付核心', checked: true, rev: 1,
    })
    expect(wrapper.find('[data-testid="sim-map-note-msg"]').text()).toBe('标注已保存。')
    expect(wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').text()).toContain('✓')
    wrapper.unmount()
  })

  it('旧 rev 被拒绝时回显示存 annotation、同步最新 rev，且不误报已保存', async () => {
    const wrapper = await mountAnalyzedMap([
      annotation('mod-pay-core', { note: '初始备注', checked: false, rev: 8 }),
    ])
    await wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').trigger('click')
    await wrapper.find('[data-testid="sim-map-note-input"]').setValue('旧页面修改')
    await wrapper.find('[data-testid="sim-map-note-checked"]').setValue(true)
    mockedSaveAnnotation
      .mockResolvedValueOnce({
        annotation: annotation('mod-pay-core', { note: '其他窗口已更新', checked: true, rev: 12 }),
        applied: false,
      })
      .mockResolvedValueOnce({
        annotation: annotation('mod-pay-core', { note: '基于最新版本重试', checked: false, rev: 13 }),
        applied: true,
      })

    await wrapper.find('[data-testid="sim-map-note-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="sim-map-note-msg"]').text()).toContain('存在更新版本，本次未覆盖')
    expect(wrapper.find('[data-testid="sim-map-note-msg"]').text()).not.toContain('标注已保存')
    expect(wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').text()).toContain('✓')

    // 重新选中时从 annotations 读取，验证列表里确实是服务端现存条目而非本地草稿。
    await wrapper.find('[data-testid="sim-map-node-req-center"]').trigger('click')
    await wrapper.find('[data-testid="sim-map-node-mod-pay-core"]').trigger('click')
    expect((wrapper.find('[data-testid="sim-map-note-input"]').element as HTMLTextAreaElement).value).toBe('其他窗口已更新')
    expect((wrapper.find('[data-testid="sim-map-note-checked"]').element as HTMLInputElement).checked).toBe(true)

    await wrapper.find('[data-testid="sim-map-note-input"]').setValue('基于最新版本重试')
    await wrapper.find('[data-testid="sim-map-note-checked"]').setValue(false)
    await wrapper.find('[data-testid="sim-map-note-save"]').trigger('click')
    await flushPromises()

    expect(mockedSaveAnnotation.mock.calls[0]?.[1].rev).toBe(1)
    expect(mockedSaveAnnotation.mock.calls[1]?.[1]).toMatchObject({
      nodeId: 'mod-pay-core', note: '基于最新版本重试', checked: false, rev: 13,
    })
    expect(wrapper.find('[data-testid="sim-map-note-msg"]').text()).toBe('标注已保存。')
    wrapper.unmount()
  })
})
