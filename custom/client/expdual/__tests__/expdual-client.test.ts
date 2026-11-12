// 双轨经验台账客户端测试（收尾批）：i18n zh/en 键齐平 + 视图挂载四区 + 写动作 +
// 失败态单独断言（AGENTS.md 纪律：mock API 模块，不编造数据）。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

const apiMocks = vi.hoisted(() => ({
  banks: vi.fn(),
  classify: vi.fn(),
  induceAdd: vi.fn(),
  retire: vi.fn(),
  blame: vi.fn(),
  synthesis: vi.fn(),
  detectSynthesis: vi.fn(),
  commitSynthesis: vi.fn(),
  dismissSynthesis: vi.fn(),
  premiseSignals: vi.fn(),
}))
vi.mock('@/custom/expdual/api', () => ({ expdualApi: apiMocks }))

import { expdualMessages } from '../i18n'
import ExpdualView from '../views/ExpdualView.vue'

const banksFixture = {
  chunk: 3,
  facts: [{
    id: 'f-1', channel: 'fact' as const, seq: 1, text: 'workspace/input 目录是上游素材目录',
    count: 4, blameCount: 0, evidence: [], status: 'active', createdAt: 1, updatedAt: 1,
  }],
  tips: [{
    id: 't-1', channel: 'tip' as const, seq: 1, text: '在「编码未知」条件下：先用 chardet 探测编码',
    count: 2, blameCount: 0, evidence: [], status: 'active', createdAt: 1, updatedAt: 1,
  }],
  retired: [{
    id: 't-0', channel: 'tip' as const, text: '旧技巧', reason: 'blame' as const, chunk: 2, retiredAt: 1, note: '误导',
  }],
  removed: [],
  counts: { facts: 1, tips: 1, retired: 1, removed: 0 },
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.banks.mockResolvedValue(banksFixture)
  apiMocks.premiseSignals.mockResolvedValue({ available: true, signals: [], threshold: 0.35 })
  apiMocks.synthesis.mockResolvedValue({ items: [] })
})

describe('expdual 客户端', () => {
  it('i18n zh/en 键齐平（skillgov 同款纪律）', () => {
    const zh = expdualMessages.zh.expdual
    const en = expdualMessages.en.expdual
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    for (const k of Object.keys(zh)) {
      if (typeof zh[k as keyof typeof zh] === 'object') {
        expect(Object.keys(zh[k as keyof typeof zh] as object).sort())
          .toEqual(Object.keys(en[k as keyof typeof en] as object).sort())
      }
    }
    expect(zh.navLabel).toBe('经验台账')
    expect(en.navLabel).toBe('Experience')
  })

  it('双库区渲染 FACT/TIP 两表＋计数；选中规则出现退役/归因表单', async () => {
    const w = mount(ExpdualView)
    await flushPromises()
    expect(w.find('[data-testid="expdual-view"]').exists()).toBe(true)
    expect(w.find('[data-testid="expdual-count-facts"]').text()).toBe('1')
    expect(w.find('[data-testid="expdual-count-tips"]').text()).toBe('1')
    expect(w.find('[data-testid="expdual-count-chunk"]').text()).toBe('3')
    expect(w.find('[data-testid="expdual-rule-f-1"]').text()).toContain('workspace/input')
    expect(w.find('[data-testid="expdual-rule-t-1"]').text()).toContain('chardet')
    expect(w.find('[data-testid="expdual-retire-form"]').exists()).toBe(false)

    await w.find('[data-testid="expdual-rule-f-1"]').trigger('click')
    expect(w.find('[data-testid="expdual-retire-form"]').exists()).toBe(true)
    expect(w.find('[data-testid="expdual-blame-form"]').exists()).toBe(true)
  })

  it('新增规则走 classify 预览 → induce ADD；结果行回显 applied', async () => {
    apiMocks.classify.mockResolvedValue({ classification: { channel: 'fact', text: 'x 是 y', rationale: '环境主语＋陈述式命中（非句首命令）' } })
    apiMocks.induceAdd.mockResolvedValue({ applied: ['ADD f-2'] })
    const w = mount(ExpdualView)
    await flushPromises()
    await w.find('[data-testid="expdual-add-text"]').setValue('x 是 y')
    await w.find('[data-testid="expdual-add-preview"]').trigger('click')
    await flushPromises()
    expect(apiMocks.classify).toHaveBeenCalledWith('x 是 y')
    expect(w.find('[data-testid="expdual-preview-fact"]').text()).toContain('FACT')
    await w.find('[data-testid="expdual-add-submit"]').trigger('submit')
    await flushPromises()
    expect(apiMocks.induceAdd).toHaveBeenCalledWith([{ op: 'ADD', channel: 'fact', text: 'x 是 y' }])
    expect(w.find('[data-testid="expdual-add-result"]').text()).toContain('ADD f-2')
  })

  it('手动退役提交带原因并刷新；归因缺步骤被引擎拒绝时错误行可见', async () => {
    const w = mount(ExpdualView)
    await flushPromises()
    await w.find('[data-testid="expdual-rule-f-1"]').trigger('click')
    await w.find('[data-testid="expdual-retire-note"]').setValue('环境已变化')
    apiMocks.retire.mockResolvedValue({ retired: banksFixture.retired[0] })
    await w.find('[data-testid="expdual-retire-submit"]').trigger('submit')
    await flushPromises()
    expect(apiMocks.retire).toHaveBeenCalledWith('f-1', '环境已变化')

    apiMocks.blame.mockRejectedValue(new Error('每条失败轨迹最多归因一条规则（防归因稀释）'))
    await w.find('[data-testid="expdual-rule-t-1"]').trigger('click')
    await w.find('[data-testid="expdual-blame-task"]').setValue('task-9')
    await w.find('[data-testid="expdual-blame-step"]').setValue('step-2')
    await w.find('[data-testid="expdual-blame-note"]').setValue('误导')
    await w.find('[data-testid="expdual-blame-submit"]').trigger('submit')
    await flushPromises()
    expect(w.find('[data-testid="expdual-blame-error"]').text()).toContain('最多归因一条')
  })

  it('复核信号区：空信号与不可用两态分开断言（不编造数据）', async () => {
    const w = mount(ExpdualView)
    await flushPromises()
    await w.find('[data-testid="expdual-tab-signals"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="expdual-signals-empty"]').exists()).toBe(true)

    apiMocks.premiseSignals.mockResolvedValue({ available: false, signals: [], note: 'x', threshold: 0.35 })
    const w2 = mount(ExpdualView)
    await flushPromises()
    await w2.find('[data-testid="expdual-tab-signals"]').trigger('click')
    await flushPromises()
    expect(w2.find('[data-testid="expdual-signals-unavailable"]').exists()).toBe(true)
    expect(w2.find('[data-testid="expdual-signals-empty"]').exists()).toBe(false)
  })

  it('banks 加载失败 → 错误行＋重试（失败态不冒充空表）', async () => {
    apiMocks.banks.mockRejectedValue(new Error('EACCES'))
    const w = mount(ExpdualView)
    await flushPromises()
    expect(w.find('[data-testid="expdual-load-error"]').text()).toContain('EACCES')
    apiMocks.banks.mockResolvedValue(banksFixture)
    await w.find('[data-testid="expdual-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="expdual-load-error"]').exists()).toBe(false)
    expect(w.find('[data-testid="expdual-count-facts"]').text()).toBe('1')
  })
})
