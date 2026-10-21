// @vitest-environment jsdom
// 治理语义体检 × FIBO 覆盖卡（2026-10-21 产品落地）：
//   治理面直接显示 FIBO 映射包的发布版本、已导入/总数、来源分档与运营状态；
//   支持增量导入、复制报告证据、摄取支付样例；FIBO 目录不可用时 fail-soft。
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
    getFiboOps: vi.fn(),
    importFibo: vi.fn(),
    ingestFiboDemo: vi.fn(),
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

function fiboOps(): Record<string, unknown> {
  return {
    generatedAt: '2026-10-21T00:00:00Z',
    evidence: {
      generatedAt: '2026-10-21T00:00:00Z',
      source: { repo: 'https://github.com/edmcouncil/fibo', release: 'master_2026Q3', releasedAt: '2026-10-20', retrievedAt: '2026-10-21', license: 'MIT', commit: '2d73435a4419b66b7c9f44cb9763e35fe8ac7890' },
      coverage: { applied: 0, total: 36, ratio: '0/36', fibo: 32, commons: 2, localExtensions: 2, imported: false },
      health: { error: 0, warning: 0, info: 0 },
      lock: { ok: true, tag: 'master_2026Q3', commit: '2d73435a4419b66b7c9f44cb9763e35fe8ac7890', releasedAt: '2026-10-20T20:02:05Z', sourceMatches: true, moduleCount: 18, drift: [] },
      gate: { index: 'custom/qgate/gate-packs/ontology/data/fibo-mini.json', concepts: 18, consistency: 'verified-by-test', test: 'ontology-fibo-gate-consistency.test.ts' },
      markdown: '### FIBO 覆盖\n- 覆盖：未导入（可导入 36 个概念）',
    },
    glossary: { terms: 36, aliased: 36, reportTerms: 5, mappedReportTerms: 2 },
    mappings: { total: 36, mapped: 20, unmapped: 16 },
    domains: { domains: 3, concepts: 18, ids: ['SEC', 'DER', 'LOAN'] },
    lock: { ok: true, tag: 'master_2026Q3', commit: '2d73435a4419b66b7c9f44cb9763e35fe8ac7890', releasedAt: '2026-10-20T20:02:05Z', sourceMatches: true, moduleCount: 18, drift: [] },
    gate: { index: 'custom/qgate/gate-packs/ontology/data/fibo-mini.json', concepts: 18, consistency: 'verified-by-test', test: 'ontology-fibo-gate-consistency.test.ts' },
    permissions: { policies: 2, fields: ['Account.accountNumber', 'Payer.partyRef'] },
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
  api.getFiboOps.mockResolvedValue({ ok: true, ops: fiboOps() })
  api.importFibo.mockResolvedValue({
    ok: true,
    added: { types: 36, objectProperties: 21, axioms: 16 },
    skipped: { types: 0, objectProperties: 0, axioms: 0 },
    applied: { concepts: 36, total: 36, applied: [] },
  })
  api.ingestFiboDemo.mockResolvedValue({
    ok: true, importedPack: true, typesAdded: 36, instances: 20,
    applied: { concepts: 36, total: 36, applied: [] },
    violations: [], summary: { error: 0, warning: 0, info: 0 },
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

  it('渲染运营状态：锁/映射/术语表/域目录/门禁/脱敏字段', async () => {
    const w = mount(GovOntologySection)
    await flushPromises()
    const ops = w.find('[data-testid="gov-ontology-fibo-ops"]').text()
    expect(ops).toContain('OK')
    expect(ops).toContain('20 / 36')
    expect(ops).toContain('36')
    expect(ops).toContain('3 / 18')
    expect(ops).toContain('18')
    expect(ops).toContain('2')
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

  it('复制报告证据：把运营快照里的 markdown 写入剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const w = mount(GovOntologySection)
    await flushPromises()
    await w.find('[data-testid="gov-ontology-fibo-evidence"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('### FIBO 覆盖'))
    expect(w.find('[data-testid="gov-ontology-fibo-evidence-msg"]').text()).toContain('已复制')
  })

  it('摄取支付样例：调用 ingestFiboDemo 并显示实例数', async () => {
    const w = mount(GovOntologySection)
    await flushPromises()
    await w.find('[data-testid="gov-ontology-fibo-demo"]').trigger('click')
    await flushPromises()
    expect(api.ingestFiboDemo).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="gov-ontology-fibo-demo-msg"]').text()).toContain('20')
    expect(api.validate).toHaveBeenCalled()
  })

  it('FIBO 目录不可用时 fail-soft，看板摄取面仍可用', async () => {
    api.getFiboPack.mockRejectedValueOnce(new Error('offline'))
    api.getFiboOps.mockRejectedValueOnce(new Error('offline'))
    const w = mount(GovOntologySection)
    await flushPromises()
    expect(w.find('[data-testid="gov-ontology-fibo-unavailable"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-ontology-fibo-ops-unavailable"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-ontology-ingest"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-ontology-panel"]').exists()).toBe(true)
  })
})
