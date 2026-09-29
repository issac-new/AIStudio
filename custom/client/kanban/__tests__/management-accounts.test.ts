// 管理三账面板守门（调研落地轮 2026-09-29）：
// ① 三账卡渲染：绿灯率/Pareto 集中度/资源结构（fixture 可控数据）
// ② 决策点联动 emit：定位任务 open-task / 过载过滤 filter-assignee / 去审批 go-inbox
// ③ 空数据与加载失败诚实降级
// ④ 词条 zh/en 键集一致（i18n-accounts 小事实源自检）
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

// 组件内部用真实时钟推停滞（60s 步进）；fixture 必须锚真实 now（偏差以小时/天计，
// 测试执行的秒级漂移不影响断言）
const now = Math.floor(Date.now() / 1000)
const D = 86400
const H = 3600

const fixture = ref<Array<{ board: string; task: Record<string, unknown> }>>([])
const refreshMock = vi.fn(async () => true)

vi.mock('@/custom/ia2/store/workspace', () => ({
  // 真 pinia store 会自动解包 ref；裸对象 mock 不会——用 getter 等价解包
  useWorkspaceStore: () => ({
    get rawTasks() { return fixture.value },
    refreshAllBoards: refreshMock,
  }),
}))

const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: {} })

async function mountPanel() {
  const { default: ManagementAccountsPanel } = await import('@/custom/kanban/components/ManagementAccountsPanel.vue')
  return mount(ManagementAccountsPanel, { global: { plugins: [i18n] } })
}

beforeEach(() => {
  vi.clearAllMocks()
  fixture.value = []
})

function task(id: string, p: Record<string, unknown>): { board: string; task: Record<string, unknown> } {
  return { board: 'paycore', task: { id, title: `任务${id}`, status: 'todo', assignee: '@a', created_at: now - 60, ...p } }
}

describe('ManagementAccountsPanel 管理三账', () => {
  it('三账卡按 fixture 渲染：绿灯率/集中度/资源判定', async () => {
    fixture.value = [
      task('ok1', { status: 'done' }),
      task('ok2', { status: 'running', started_at: now - 60 }),
      task('bad1', { status: 'blocked', created_at: now - 3 * D }), // 红，偏差 (72h-1h)/24h=2 天
      task('bad2', { status: 'todo', created_at: now - 40 * D }),   // 红，偏差 (960h-168h)/24h=33 天
      task('mid1', { status: 'ready', created_at: now - 2 * H }),   // 琥珀，0 天
    ]
    const w = await mountPanel()
    await flushPromises()
    // 绿灯率 = 2/5 = 40%
    expect(w.find('[data-testid="ma-progress"]').text()).toContain('40%')
    // 最劣偏差 33 天
    expect(w.find('[data-testid="ma-progress"]').text()).toContain('33')
    // Pareto：头部 1/3 风险单（ceil(3*0.2)=1）占 33/35 ≈ 94.3%
    expect(w.find('[data-testid="ma-risk"]').text()).toContain('94.3%')
    // 5 任务 2 人（@a 5 未结 + 无他人）→ 均值 5 → 阈值 max(3,10)=10 → @a(5) 不过载 → 未见错配
    expect(w.find('[data-testid="ma-resource"]').text()).toContain('未见')
  })

  it('决策点 emit：定位任务 / 过载过滤 / 去审批', async () => {
    fixture.value = [
      task('bad1', { status: 'blocked', created_at: now - 3 * D, assignee: '@busy' }),
      ...Array.from({ length: 8 }, (_, i) => task(`b${i}`, { status: 'todo', created_at: now - 60, assignee: '@busy' })),
      task('calm1', { status: 'todo', created_at: now - 60, assignee: '@calm' }),
    ]
    const w = await mountPanel()
    await flushPromises()
    // 10 任务 2 人：均值 5 → 阈值 10 → @busy(9) 未过载 → 过载行不渲染；风险定位链必验
    const overloadRow = w.find('[data-testid="ma-overload-@busy"]')
    if (overloadRow.exists()) {
      await overloadRow.findAll('button').find(b => b.text() === '过滤看板')!.trigger('click')
      expect(w.emitted('filter-assignee')![0]).toEqual(['@busy'])
    }
    const riskRow = w.find('[data-testid="ma-risk-bad1"]')
    expect(riskRow.exists()).toBe(true)
    await riskRow.findAll('button').find(b => b.text() === '定位')!.trigger('click')
    expect(w.emitted('open-task')![0]).toEqual(['bad1'])
  })

  it('空数据与加载失败诚实降级', async () => {
    const w = await mountPanel()
    await flushPromises()
    expect(w.find('[data-testid="ma-empty"]').exists()).toBe(true)

    refreshMock.mockRejectedValueOnce(new Error('down'))
    const w2 = await mountPanel()
    await flushPromises()
    expect(w2.find('[data-testid="ma-error"]').exists()).toBe(true)
  })

  it('词条 zh/en 键集一致（i18n-accounts 小事实源）', async () => {
    const { accountsMessages } = await import('@/custom/kanban/i18n-accounts')
    const zhKeys = Object.keys(accountsMessages.zh.accounts).sort().join(',')
    const enKeys = Object.keys(accountsMessages.en.accounts).sort().join(',')
    expect(enKeys).toBe(zhKeys)
  })
})
