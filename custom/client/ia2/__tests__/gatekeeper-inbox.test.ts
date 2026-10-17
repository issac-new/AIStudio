// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/gatekeeper-inbox.test.ts
// B3 S7 把关待办单测（设计正本 §二 S7，R5/R6）：清偿分组/收尾令模板纯函数；
// 双队列渲染（介入卡/清偿组）、源缺席灰列不猜、waive 强制理由客户端镜像、
// 动作后刷新、模板复制。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('../api/gatekeeper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/gatekeeper')>()
  return {
    ...actual,
    fetchInterventionsPending: vi.fn(),
    fetchClearanceLedger: vi.fn(),
    resolveClearance: vi.fn(),
    waiveClearance: vi.fn(),
  }
})

import {
  groupClearanceTargets,
  buildClosingOrder,
  fetchInterventionsPending,
  fetchClearanceLedger,
  waiveClearance,
  type ClearanceLedgerView,
  type InterventionsView,
} from '../api/gatekeeper'
import GatekeeperSection from '../components/inbox/GatekeeperSection.vue'

const LEDGER: ClearanceLedgerView = {
  rows: [
    { id: 'e1', type: 'nudge', defect: 'PR-3', detail: '', status: 'open', state: 'open' },
    { id: 'e2', type: 'gw-dispatch-bypass', defect: 'PR-3', detail: '', status: 'open', state: 'open' },
    { id: 'e3', type: 'auto-approve', defect: 'PR-2', detail: '', status: 'open', state: 'open' },
    { id: 'e4', type: 'nudge', defect: '', detail: '', status: 'open', state: 'waived' },
  ],
  open: 3, resolved: 0, waived: 1, pass: false,
}

const INTERV: InterventionsView = {
  points: [
    { id: 'iv-03', title: 'G1 需求冻结判读', sourceKind: 'gate', sourceKey: 'g1_frozen', pending: true },
    { id: 'iv-06', title: 'G2 架构评审判词', sourceKind: 'gate', sourceKey: 'g2_arch_pass', belief: '方案复用既有实现未重复造轮', pending: true },
    { id: 'iv-08', title: 'G5 发布准出人工批准', sourceKind: 'approval', sourceKey: 'g5_human', pending: false },
    { id: 'iv-12', title: '清偿门 waive', sourceKind: 'clearance', sourceKey: 'clearance-waive', pending: null },
    { id: 'iv-09', title: 'UAT 逐条判词', sourceKind: 'uat', sourceKey: 'uat-verdict', pending: null },
  ],
  sources: { gates: 'ok', approvals: 'ok', clearance: 'absent' },
}

describe('纯函数层', () => {
  it('清偿分组：defect 优先回落 type、只计未清、按笔数排序', () => {
    const groups = groupClearanceTargets(LEDGER)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ target: 'PR-3', openCount: 2, types: ['nudge', 'gw-dispatch-bypass'] })
    expect(groups[1]).toMatchObject({ target: 'PR-2', openCount: 1, types: ['auto-approve'] })
  })
  it('收尾令模板：三步齐备——结论行/翻卡/禁再跑，卡号与提交号入文', () => {
    const text = buildClosingOrder('t_rel_001', 'd197be6c')
    expect(text).toContain('t_rel_001 DONE 提交 d197be6c')
    expect(text).toContain('把看板卡 t_rel_001 翻到 done')
    expect(text).toContain('禁止再跑任何新步骤')
    expect(buildClosingOrder('t_x').split('\n')).toHaveLength(4)
  })
})

describe('GatekeeperSection — S7 把关待办', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchInterventionsPending.mockResolvedValue(INTERV)
    fetchClearanceLedger.mockResolvedValue(LEDGER)
  })

  it('双队列渲染：待办介入卡 2 张、已办不列、源缺席灰列不猜、三源徽标如实', async () => {
    const w = mount(GatekeeperSection)
    await flushPromises()
    expect(w.findAll('[data-testid="sim-interv-card"]')).toHaveLength(2)
    expect(w.find('[data-testid="gk-interv-empty"]').exists()).toBe(false)
    const unknown = w.find('[data-testid="gk-unknown"]')
    expect(unknown.exists()).toBe(true)
    expect(unknown.text()).toContain('状态未知 2 项')
    expect(unknown.text()).toContain('UAT 逐条判词')
    expect(w.find('[data-testid="gk-src-clearance"]').classes()).toContain('gk__src--absent')
    expect(w.find('[data-testid="gk-src-gates"]').classes()).not.toContain('gk__src--absent')
    w.unmount()
  })

  it('介入卡来源徽标与决策前提透传：sourceKind 标签渲染、belief 行进卡（调研轮 A 件）', async () => {
    const w = mount(GatekeeperSection)
    await flushPromises()
    const sources = w.findAll('[data-testid="sim-interv-source"]')
    expect(sources.map(s => s.text())).toEqual(['关卡', '关卡'])
    const beliefs = w.findAll('[data-testid="sim-interv-belief"]')
    expect(beliefs).toHaveLength(1)
    expect(beliefs[0].text()).toContain('须先确认：方案复用既有实现未重复造轮')
    const absent = w.findAll('[data-testid="sim-interv-belief-absent"]')
    expect(absent).toHaveLength(1)
    expect(absent[0].text()).toContain('缺决策前提')
    w.unmount()
  })

  it('清偿组渲染＋waive 强制理由客户端镜像（空理由禁用）＋动作后刷新视图', async () => {
    const w = mount(GatekeeperSection)
    await flushPromises()
    const group = w.find('[data-testid="gk-cl-PR-3"]')
    expect(group.exists()).toBe(true)
    expect(group.text()).toContain('2 笔未清')
    const waiveBtn = w.find('[data-testid="gk-waive-PR-3"]')
    expect(waiveBtn.attributes('disabled')).toBeDefined()
    waiveClearance.mockResolvedValue({ ...LEDGER, open: 1, pass: false })
    await w.find('[data-testid="gk-waive-reason-PR-3"]').setValue('用户裁定豁免')
    expect(waiveBtn.attributes('disabled')).toBeUndefined()
    await waiveBtn.trigger('click')
    await flushPromises()
    expect(waiveClearance).toHaveBeenCalledWith('PR-3', '用户裁定豁免')
    expect(w.text()).toContain('未清 1')
    w.unmount()
  })

  it('收尾令模板：填卡号出文本＋复制走剪贴板＋留痕反馈', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const w = mount(GatekeeperSection)
    await flushPromises()
    expect(w.find('[data-testid="gk-closing-text"]').exists()).toBe(false)
    await w.find('[data-testid="gk-closing-card"]').setValue('t_rel_009')
    await w.find('[data-testid="gk-closing-commit"]').setValue('abc1234')
    expect(w.find('[data-testid="gk-closing-text"]').text()).toContain('t_rel_009 DONE 提交 abc1234')
    await w.find('[data-testid="gk-closing-copy"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="gk-closing-copy"]').text()).toBe('已复制')
    w.unmount()
  })

  it('台账 503 时介入队列仍可用：部分失败隔离＋台账错误人话化＋原始锚留 title', async () => {
    fetchClearanceLedger.mockRejectedValue(new Error('清偿台账未配置（ORGLOOP_LEDGER_TSV 缺席=fail-closed）'))
    const w = mount(GatekeeperSection)
    await flushPromises()
    // 介入队列照常渲染
    expect(w.findAll('[data-testid="sim-interv-card"]')).toHaveLength(2)
    expect(w.find('[data-testid="gk-error"]').exists()).toBe(false)
    // 台账区单独报错，正文人话、原始错误在 title
    const err = w.find('[data-testid="gk-clearance-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('遗留项台账未配置')
    expect(err.attributes('title')).toContain('ORGLOOP_LEDGER_TSV')
    w.unmount()
  })

  it('介入队列取数失败不拖死台账区：两路各自如实呈现', async () => {
    fetchInterventionsPending.mockRejectedValue(new Error('/api/hermes/orgloop/interventions/pending → 503'))
    const w = mount(GatekeeperSection)
    await flushPromises()
    expect(w.find('[data-testid="gk-error"]').text()).toContain('503')
    expect(w.find('[data-testid="gk-cl-PR-3"]').exists()).toBe(true)
    w.unmount()
  })
})
