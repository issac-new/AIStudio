// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sim-overview-panel.test.ts
// 旗舰签（运行总览）单测：
//   1) §3.3 映射表前端副本抽查——完成键/隐藏键/关卡标志逐行誊写不漂移（纪律 45 前端口径）
//   2) §2.4 步名/操作者抽查（V8.30 职责归位等关键行）
//   3) 七幕区间=§2.4 七幕主线，无缝覆盖 1-26
//   4) 键→行状态纯函数正反例（done/进行中/未达/链位推断）
//   5) KPI 数字自 mock 端点数据计算（含代偿 vs 净计两口径；六道质量门/分支交付）
//   6) 诚实态：run 缺席引导不造假、主端点失败如实报错、副端点缺席就地呈现
//   7) 面板挂载渲染主块 testid + 步行点击进锚点抽屉 + 交付物 14 件链
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

vi.mock('../api/overview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/overview')>()
  return {
    ...actual,
    fetchRunState: vi.fn(),
    fetchDeliverables: vi.fn(),
    fetchIssues: vi.fn(),
    fetchBranches: vi.fn(),
  }
})

import { fetchRunState, fetchDeliverables, fetchIssues, fetchBranches } from '../api/overview'
import OverviewPanel from '../views/sim/OverviewPanel.vue'
import {
  ACTS_7, STEPS_26, SIX_GATES, extractCommit, resolveGateRows, resolveStepRows,
  countStepsDone, netStepsAvailable, compDeduction,
} from '../views/sim/steps-registry'

const mockedRunState = vi.mocked(fetchRunState)
const mockedDeliverables = vi.mocked(fetchDeliverables)
const mockedIssues = vi.mocked(fetchIssues)
const mockedBranches = vi.mocked(fetchBranches)

const step = (no: number) => STEPS_26.find(s => s.no === no)!

describe('§3.3 前端副本抽查——完成键逐行誊写（改任一端本组当场红）', () => {
  it('26 步齐全、步号连续；步 1-4 四合一段共用 smoke_done', () => {
    expect(STEPS_26).toHaveLength(26)
    expect(STEPS_26.map(s => s.no)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1))
    for (const no of [1, 2, 3, 4]) expect(step(no).keys).toEqual(['smoke_done'])
  })

  it('闸键陷阱行：步 7=g1_frozen、步 15=g2_arch_pass（非 *_done 形）；步 26=report_done', () => {
    expect(step(7).keys).toEqual(['g1_frozen'])
    expect(step(15).keys).toEqual(['g2_arch_pass'])
    expect(step(26).keys).toEqual(['report_done'])
  })

  it('步 19 双键 defect_done/testpass_done+关卡标志 g4_pass；步 18/20 关卡标志 g3_code_pass/g5_ready', () => {
    expect(step(19).keys).toEqual(['defect_done', 'testpass_done'])
    expect(step(19).gateFlags).toEqual(['g4_pass'])
    expect(step(18).keys).toEqual(['devimpl_done'])
    expect(step(18).gateFlags).toEqual(['g3_code_pass'])
    expect(step(20).gateFlags).toEqual(['g5_ready'])
  })

  it('隐藏键步 8/9=room_analysis/dispatch_marker 且标 hiddenKey；六闸键=g1_frozen…report_done', () => {
    expect(step(8).keys).toEqual(['room_analysis'])
    expect(step(8).hiddenKey).toBe(true)
    expect(step(9).keys).toEqual(['dispatch_marker'])
    expect(step(9).hiddenKey).toBe(true)
    expect(SIX_GATES.map(g => g.key)).toEqual([
      'g1_frozen', 'g2_arch_pass', 'g3_code_pass', 'g4_pass', 'g5_ready', 'report_done',
    ])
  })
})

describe('§2.4 步名/操作者抽查', () => {
  it('关键行操作者：步 19 lead 归位（wei/mei）、步 8 产品经理A、步 13 四路同发', () => {
    expect(step(19).name).toBe('独立测试（G4）')
    expect(step(19).operator).toContain('lead（wei）/前端 lead（mei）')
    expect(step(8).operator).toBe('产品经理A')
    expect(step(13).operator).toContain('chen/xiao/hu/lin')
    expect(step(1).name).toBe('账号分配')
    expect(step(26).name).toBe('HTML 推演报告')
  })
})

describe('七幕区间（§2.4 七幕主线）', () => {
  it('七幕名与区间无缝覆盖 1-26', () => {
    expect(ACTS_7.map(a => a.name)).toEqual([
      '序幕·搭台', '第一幕·需求上锁', '第二幕·需求分析', '第三幕·设计与排期',
      '第四幕·并行生产', '第五幕·发布与验收', '尾声·治理与复盘',
    ])
    expect(ACTS_7.map(a => [a.from, a.to])).toEqual([
      [1, 4], [5, 8], [9, 14], [15, 17], [18, 19], [20, 21], [22, 26],
    ])
    for (let i = 0; i < ACTS_7.length; i++) {
      if (i === 0) expect(ACTS_7[i].from).toBe(1)
      else expect(ACTS_7[i].from).toBe(ACTS_7[i - 1].to + 1)
    }
    expect(ACTS_7[6].to).toBe(26)
  })
})

describe('resolveStepRows——键→行状态纯函数（done/进行中/未达）', () => {
  it('正例一：过 G1（frontier=7）——步 1-7 done、步 8 进行中、步 9+ 未达；✓ 时刻取键原值', () => {
    const rows = resolveStepRows(
      { smoke_done: '2026-10-15T07:58:02+00:00', appinit_done: 't5', people_done: 't6' },
      { g1_frozen: '2026-10-15T08:23:11+00:00' },
    )
    expect(rows.filter(r => r.state === 'done').map(r => r.no)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rows[7]).toMatchObject({ no: 8, state: 'active' })
    expect(rows[8]).toMatchObject({ no: 9, state: 'pending' })
    expect(rows[25].state).toBe('pending')
    expect(rows[0].at).toBe('2026-10-15T07:58:02+00:00')
    // 步 7 的证据=闸键 g1_frozen 原值（锚点抽屉载荷）
    expect(rows[6].doneKeys).toEqual([{ key: 'g1_frozen', value: '2026-10-15T08:23:11+00:00' }])
  })

  it('正例二：register_done（frontier=10）——步 8/9 链位推断 done，11-14 进行中、15+ 未达', () => {
    const rows = resolveStepRows(
      { smoke_done: 't', appinit_done: 't', people_done: 't', register_done: 't' },
      { g1_frozen: 't' },
    )
    expect(rows.filter(r => r.state === 'done').map(r => r.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(rows[10].state).toBe('active')
    expect(rows[13].state).toBe('active')
    expect(rows[14].state).toBe('pending')
  })

  it('反例：空 state——全 26 步未 done，首幕为当前幕（步 1-4 进行中、5+ 未达）', () => {
    const rows = resolveStepRows({}, {})
    expect(rows.filter(r => r.state === 'done')).toHaveLength(0)
    expect(rows[0].state).toBe('active')
    expect(rows[3].state).toBe('active')
    expect(rows[4].state).toBe('pending')
  })

  it('extractCommit：十六进制含 a-f 才认；纯数字时间戳/序号不误报', () => {
    expect(extractCommit(['commit=d197be6c'])).toBe('d197be6c')
    expect(extractCommit(['1760523600'])).toBeNull()
    expect(extractCommit(['2026-10-15T08:23:11+00:00'])).toBeNull()
  })
})

describe('六闸折算与打回计数', () => {
  it('闸行=六闸键在位判 pass；issues code 前缀 g<N> 计打回（DISP 行与无关 code 不计）', () => {
    const rows = resolveGateRows(
      { g1_frozen: 't1', report_done: 't26' }, {},
      [
        { kind: 'issue', code: 'g1-acceptance-blocked' },
        { kind: 'issue', code: 'g1-acceptance-blocked' },
        { kind: 'issue', code: 'app-init-incomplete' },
        { kind: 'disp', code: 'g1-acceptance-blocked' },
      ],
    )
    const byId = Object.fromEntries(rows.map(r => [r.id, r]))
    expect(byId.G1).toMatchObject({ passed: true, rejectCount: 2 })
    expect(byId.G6).toMatchObject({ passed: true, rejectCount: 0 })
    expect(byId.G2.passed).toBe(false)
    expect(rows).toHaveLength(6)
  })
})

describe('KPI 数字自 mock 端点数据计算（含代偿 vs 净计两口径）', () => {
  it('缺步 26 一路的完成轮：done=25（显式 23+链位推断 8/9）、台账步级代演 3 笔 → 含代偿 25/26、净计 22/26；nudge 不扣', () => {
    const steps: Record<string, string> = {
      smoke_done: 't', appinit_done: 't', people_done: 't', register_done: 't',
      analysis_done: 't', triage_done: 't', anexec_done: 't', review_done: 't',
      close_done: 't', plan_done: 't', devimpl_done: 't', defect_done: 't',
      testpass_done: 't', ready_done: 't', release_done: 't', uat_done: 't',
      workmgr_done: 't', audit_done: 't', retro_done: 't', ide_done: 't',
    }
    const gates = { g1_frozen: 't', g2_arch_pass: 't', g3_code_pass: 't', g4_pass: 't', g5_ready: 't' }
    const rows = resolveStepRows(steps, gates)
    // 显式完成步 1-7,10-25（23 步）+ 链位推断 8/9 = 25；步 26 report_done 缺席
    expect(countStepsDone(rows)).toBe(25)
    expect(rows[25].state).not.toBe('done')
    const byType = { nudge: 3, 'card-walk-done': 2, 'driver-merge': 1 }
    expect(compDeduction(byType)).toBe(3)
    expect(netStepsAvailable(rows, byType)).toBe(22)
    // 零步级代演 → 净计=含代偿
    expect(netStepsAvailable(rows, {})).toBe(25)
  })
})

// ── 面板挂载（VTU）──

function makePanelRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
      { path: '/app/sim/supervision', name: 'ia2.simSupervision', component: { template: '<div />' } },
    ],
  })
}

async function mountPanel(path: string) {
  const router = makePanelRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(OverviewPanel, { global: { plugins: [router] } })
  return { wrapper, router }
}

const MOCK_STATE = {
  run: '20261015-v8-run20',
  posture: 'standard',
  gates: { g1_frozen: '2026-10-15T08:23:11+00:00' },
  steps: {
    smoke_done: '2026-10-15T07:58:02+00:00',
    appinit_done: 'commit=1a2b3c4d5e6f',
    people_done: '2026-10-15T08:12:00+00:00',
  },
  ledger: { total: 6, open: 2, byType: { nudge: 3, 'card-walk-done': 2, 'driver-merge': 1 } },
  source: { stateFile: '/runs/20261015-v8-run20/state.env', ledgerFile: '/runs/20261015-v8-run20/evidence/compensation-ledger.tsv', ledgerPresent: true },
}

const MOCK_DELIVERABLES = {
  run: '20261015-v8-run20',
  scanned: 21,
  deliverables: Array.from({ length: 13 }, (_, i) => ({
    name: `d${i}`, label: `件${i + 1}`,
    status: (i < 11 ? 'present' : 'absent') as 'present' | 'absent',
    file: i < 11 ? `evidence/f${i}.md` : null,
  })),
}

const MOCK_ISSUES = {
  run: '20261015-v8-run20', count: 2, source: '/runs/…/issues.log',
  lines: [{ kind: 'issue' as const, code: 'g1-acceptance-blocked', subject: 's', text: 't' }],
  stats: { totalLines: 2, totalIssue: 1, totalDisp: 1, disposed: 1, open: 0, rate: 1 },
}

const MOCK_BRANCHES = {
  run: '20261015-v8-run20', graceMs: 3600000, count: 2,
  branches: [
    { name: 'feat/DEV-PAYCORE-C', localTs: 1, pushed: true, pushTs: 1, freshness: 'fresh' as const },
    { name: 'feat/DEV-MP', localTs: 2, pushed: false, pushTs: null, freshness: 'stale' as const },
  ],
}

function mockAllOk(): void {
  mockedRunState.mockResolvedValue(MOCK_STATE)
  mockedDeliverables.mockResolvedValue(MOCK_DELIVERABLES)
  mockedIssues.mockResolvedValue(MOCK_ISSUES)
  mockedBranches.mockResolvedValue(MOCK_BRANCHES)
}

describe('OverviewPanel——诚实态（N1/N2）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('run 缺席：引导输入不造假——无 KPI/步骤表渲染、零 fetch', async () => {
    const { wrapper } = await mountPanel('/app/sim')
    await flushPromises()
    expect(wrapper.find('[data-testid="ov-guide"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ov-kpi-gates"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ov-steps"]').exists()).toBe(false)
    expect(mockedRunState).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('主端点失败如实报错（503 fail-closed 场景），不渲染任何数字面板', async () => {
    mockedRunState.mockRejectedValue(new Error('/api/hermes/sim/run-state → 503（{"error":"simcenter 未配置"}）'))
    mockedDeliverables.mockResolvedValue(MOCK_DELIVERABLES)
    mockedIssues.mockResolvedValue(MOCK_ISSUES)
    mockedBranches.mockResolvedValue(MOCK_BRANCHES)
    const { wrapper } = await mountPanel('/app/sim?run=runX')
    await flushPromises()
    expect(wrapper.find('[data-testid="ov-error"]').text()).toContain('503')
    expect(wrapper.find('[data-testid="ov-posture"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ov-steps"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('分支端点缺席：KPI 卡如实呈「—」+缺席说明，不编数字', async () => {
    mockedRunState.mockResolvedValue(MOCK_STATE)
    mockedDeliverables.mockResolvedValue(MOCK_DELIVERABLES)
    mockedIssues.mockResolvedValue(MOCK_ISSUES)
    mockedBranches.mockRejectedValue(new Error('/api/hermes/sim/branches → 503（SIM_BRANCHES_REPO 缺席）'))
    const { wrapper } = await mountPanel('/app/sim?run=runX')
    await flushPromises()
    const card = wrapper.find('[data-testid="ov-kpi-branches"]')
    expect(card.text()).toContain('—')
    expect(card.find('.ov__kpi-absent').text()).toContain('SIM_BRANCHES_REPO')
    wrapper.unmount()
  })
})

describe('OverviewPanel——挂载渲染主块', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAllOk() })

  it('run query 在位：横幅/KPI 四卡/七幕条/26 步表/交付物链/六道质量门/净计卡/观察窗入口齐渲染，数字来自端点', async () => {
    const { wrapper } = await mountPanel('/app/sim?run=20261015-v8-run20')
    await flushPromises()
    expect(mockedRunState).toHaveBeenCalledWith('20261015-v8-run20')
    // 运行模式横幅：standard 琥珀带+遗留项灯红（2 笔待处理）
    const posture = wrapper.find('[data-testid="ov-posture"]')
    expect(posture.classes()).toContain('ov__posture--standard')
    expect(wrapper.find('[data-testid="ov-clearance"]').text()).toContain('2 笔待处理')
    // KPI：六道质量门 1/6（仅 g1_frozen）｜分支 1/6（2 支 1 推）｜含代偿 7/26｜净计 4/26（扣 3 笔）
    expect(wrapper.find('[data-testid="ov-kpi-gates"]').text()).toContain('1/6')
    expect(wrapper.find('[data-testid="ov-kpi-branches"]').text()).toContain('1/6')
    expect(wrapper.find('[data-testid="ov-kpi-steps"]').text()).toContain('7/26')
    expect(wrapper.find('[data-testid="ov-kpi-net"]').text()).toContain('4/26')
    // 七幕条：当前幕=第二幕（frontier=步 7）
    expect(wrapper.find('[data-testid="ov-act-2"]').classes()).toContain('ov__act--cur')
    // 26 步表：26 行；步 1 done、步 8 进行中、步 9 未达
    const rows = wrapper.findAll('[data-testid^="ov-step-row-"]')
    expect(rows).toHaveLength(26)
    expect(wrapper.find('[data-testid="ov-step-row-1"]').classes()).toContain('ov__step--done')
    expect(wrapper.find('[data-testid="ov-step-row-8"]').classes()).toContain('ov__step--active')
    expect(wrapper.find('[data-testid="ov-step-row-9"]').classes()).toContain('ov__step--pending')
    // 交付物链：14 件=端点 13 类+完备性检查（未覆盖如实缺席）
    const dl = wrapper.findAll('[data-testid^="ov-dl-"]')
    expect(dl).toHaveLength(14)
    expect(wrapper.find('[data-testid="ov-dl-13"]').text()).toContain('完备性检查')
    expect(wrapper.find('[data-testid="ov-dl-13"]').text()).toContain('未覆盖')
    expect(wrapper.find('[data-testid="ov-dl-11"]').classes()).toContain('ov__dl-item--absent')
    // 六道质量门 6 行；G1 打回 1（issues）
    expect(wrapper.findAll('[data-testid^="ov-gate-"]')).toHaveLength(6)
    expect(wrapper.find('[data-testid="ov-gate-G1"]').find('[data-testid="sim-gate-reject"]').text()).toContain('1')
    // 净计卡双行+紫项列表
    const net = wrapper.find('[data-testid="ov-net"]')
    expect(net.text()).toContain('含代偿步可用 7/26')
    expect(net.text()).toContain('净计步可用 4/26')
    expect(net.findAll('[data-testid="sim-comp-tag"]').length).toBeGreaterThanOrEqual(3)
    expect(wrapper.find('[data-testid="ov-watch-entry"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('步 5 键值含 commit → 行带双凭证标（提交锚）；纯时刻行不带', async () => {
    const { wrapper } = await mountPanel('/app/sim?run=20261015-v8-run20')
    await flushPromises()
    const row5 = wrapper.find('[data-testid="ov-step-row-5"]')
    expect(row5.find('[data-testid="sim-dual-cred-commit"]').text()).toContain('1a2b3c4d5e')
    expect(wrapper.find('[data-testid="ov-step-row-1"]').find('[data-testid="sim-dual-cred"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('步行点击→锚点抽屉展开（键值证据原文进抽屉）', async () => {
    const { wrapper } = await mountPanel('/app/sim?run=20261015-v8-run20')
    await flushPromises()
    await wrapper.find('[data-testid="ov-step-row-7"]').trigger('click')
    const drawer = wrapper.find('[data-testid="sim-anchor-drawer"]')
    expect(drawer.classes()).toContain('sim-anchor-drawer--open')
    expect(wrapper.find('[data-testid="sim-anchor-drawer-title"]').text()).toContain('需求上锁（G1）')
    expect(wrapper.find('[data-testid="sim-anchor-drawer-evidence"]').text()).toContain('g1_frozen')
    wrapper.unmount()
  })

  it('issues 端点缺席：打回计数缺席如实标注，闸徽不误报打回', async () => {
    mockedIssues.mockRejectedValue(new Error('/api/hermes/sim/issues → 404（issues.log 不存在）'))
    const { wrapper } = await mountPanel('/app/sim?run=20261015-v8-run20')
    await flushPromises()
    expect(wrapper.find('[data-testid="ov-gate-rejects-absent"]').text()).toContain('404')
    expect(wrapper.find('[data-testid="ov-gate-G1"]').find('[data-testid="sim-gate-reject"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
