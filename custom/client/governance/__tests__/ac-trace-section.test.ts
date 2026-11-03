// AC 追溯矩阵面板守门（F2）：缺口可见、未采集如实、无 run 空态。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { fetchAcTrace } from '@/custom/governance/api/governance'

vi.mock('@/custom/governance/api/governance', () => ({
  fetchAcTrace: vi.fn(),
}))

let currentQuery: Record<string, string> = { run: 'run-x' }
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: currentQuery }),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

async function mountComp() {
  const mod = await import('@/custom/governance/components/AcTraceSection.vue')
  return mount(mod.default, { global: { plugins: [i18n] } })
}

const traceFixture = {
  ok: true,
  available: true,
  run: 'run-x',
  trace: {
    at: 1,
    acTotal: 3,
    rows: [
      { acId: 'AC-1', text: '下单返回 201', verifiable: 'auto' as const, cases: [{ case: 'c1', status: 'pass' as const }] },
      { acId: 'AC-2', text: '重复回调不二次扣款', verifiable: 'auto' as const, cases: [{ case: 'c2', status: 'unknown' as const }] },
      { acId: 'AC-3', text: '真机走查', verifiable: 'manual' as const, cases: [] },
    ],
    judgement: { ok: false, unbound: ['AC-3'], noResult: ['AC-2'], failed: [], orphanCases: ['loose'] },
  },
}

beforeEach(() => {
  vi.mocked(fetchAcTrace).mockReset()
  currentQuery = { run: 'run-x' }
})

describe('AcTraceSection', () => {
  it('渲染矩阵并分别标出未绑定/无结果/孤儿用例', async () => {
    vi.mocked(fetchAcTrace).mockResolvedValue(traceFixture)
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="ac-trace-row"]').exists()).toBe(true)
    expect(w.findAll('[data-testid="ac-trace-row"]')).toHaveLength(3)
    expect(w.find('[data-testid="ac-trace-unbound"]').text()).toContain('AC-3')
    expect(w.find('[data-testid="ac-trace-noresult"]').text()).toContain('AC-2')
    expect(w.find('[data-testid="ac-trace-orphans"]').text()).toContain('loose')
    expect(w.find('[data-testid="ac-trace-verdict"]').text()).toContain('缺口')
  })

  it('未采集时如实显示「未采集」，不渲染空表', async () => {
    vi.mocked(fetchAcTrace).mockResolvedValue({ ok: true, available: false, note: '制品未采集：evidence/ac-trace.json' })
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="ac-trace-unavailable"]').text()).toContain('未采集')
    expect(w.find('[data-testid="ac-trace-row"]').exists()).toBe(false)
  })

  it('无 run 时给空态提示，不发请求', async () => {
    currentQuery = {}
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="ac-trace-no-run"]').exists()).toBe(true)
    expect(fetchAcTrace).not.toHaveBeenCalled()
  })

  it('请求失败如实报错，不显示假数据', async () => {
    vi.mocked(fetchAcTrace).mockRejectedValue(new Error('boom'))
    const w = await mountComp()
    await flushPromises()
    expect(w.find('[data-testid="ac-trace-error"]').text()).toContain('boom')
    expect(w.find('[data-testid="ac-trace-row"]').exists()).toBe(false)
  })
})
