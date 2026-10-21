// @vitest-environment jsdom
// 治理语义体检 × FIBO 覆盖卡（2026-10-21 产品落地）：
//   治理面直接显示 FIBO 映射包的发布版本、已导入/总数与来源分档；
//   导入按钮走增量合并；FIBO 目录不可用时 fail-soft，不影响看板摄取。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/custom/ontology/api', () => ({
  ontologyApi: {
    getSpec: vi.fn(),
    kanbanOverview: vi.fn(),
    getFiboPack: vi.fn(),
    importFibo: vi.fn(),
    ingest: vi.fn(),
    validate: vi.fn(),
  },
}))

import GovOntologySection from '@/custom/ia2/views/gov/GovOntologySection.vue'
import { ontologyApi } from '@/custom/ontology/api'
import { seedSpec } from '../../../server/ontology/ontology-seed'

const api = ontologyApi as unknown as Record<string, ReturnType<typeof vi.fn>>

function fiboPack(): Record<string, unknown> {
  return {
    id: 'fibo-finance',
    label: 'FIBO 金融域映射包',
    namespace: 'https://swarm.studio/ns/fibo-alignment#',
    source: {
      repo: 'https://github.com/edmcouncil/fibo', release: 'master_2026Q3',
      releasedAt: '2026-10-20', retrievedAt: '2026-10-21', license: 'MIT', viewer: '', spec: '',
    },
    counts: { concepts: 36, fibo: 32, commons: 2, localExtensions: 2, objectProperties: 21, axioms: 16 },
    modules: [],
    concepts: [],
    objectProperties: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getSpec.mockResolvedValue({
    ok: true, spec: seedSpec(0),
    stats: { typeCount: 16, dataPropCount: 51, objPropCount: 12, axiomCount: 6, instanceCount: 2 },
    health: { error: 0, warning: 0, info: 0 },
  })
  api.kanbanOverview.mockResolvedValue({ ok: true, sources: [{ slug: 'main', exists: true }] })
  api.getFiboPack.mockResolvedValue({ ok: true, pack: fiboPack(), applied: { concepts: 0, total: 36, applied: [] } })
  api.importFibo.mockResolvedValue({
    ok: true,
    added: { types: 36, objectProperties: 21, axioms: 16 },
    skipped: { types: 0, objectProperties: 0, axioms: 0 },
    applied: { concepts: 36, total: 36, applied: [] },
  })
  api.validate.mockResolvedValue({ ok: true, persisted: true, count: 2, violations: [], summary: { error: 0, warning: 0, info: 0 } })
})

describe('GovOntologySection FIBO 覆盖卡', () => {
  it('渲染发布版本、覆盖度与来源分档', async () => {
    const w = mount(GovOntologySection)
    await flushPromises()
    expect(w.find('[data-testid="gov-ontology-fibo"]').exists()).toBe(true)
    const stats = w.find('[data-testid="gov-ontology-fibo-stats"]').text()
    expect(stats).toContain('master_2026Q3')
    expect(stats).toContain('0 / 36')
    expect(stats).toContain('32')
    expect(stats).toContain('2')
  })

  it('导入按钮调用 importFibo，显示新增计数并触发复检', async () => {
    const w = mount(GovOntologySection)
    await flushPromises()
    await w.find('[data-testid="gov-ontology-fibo-import"]').trigger('click')
    await flushPromises()
    expect(api.importFibo).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="gov-ontology-fibo-result"]').text()).toContain('36')
    expect(api.validate).toHaveBeenCalled()
  })

  it('FIBO 目录不可用时 fail-soft，看板摄取面仍可用', async () => {
    api.getFiboPack.mockRejectedValueOnce(new Error('offline'))
    const w = mount(GovOntologySection)
    await flushPromises()
    expect(w.find('[data-testid="gov-ontology-fibo-unavailable"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-ontology-ingest"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-ontology-panel"]').exists()).toBe(true)
  })
})
