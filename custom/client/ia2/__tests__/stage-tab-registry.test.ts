// @vitest-environment jsdom
// 阶段页签统一注册守门（Task 8 阶段页签与页面呈现解析合一）：
//   1) 37 个页签 key、深链解析、默认签零变化（契约等价迁移的硬底线）；
//   2) StageTabMeta 携带 loader（一律 () => import 懒加载）与 props——
//      StageShell 的 TAB_COMPONENTS/TAB_PROPS 双表退役，注册单点化；
//   3) ⑥治理 12 签按「待处理/审计与质量/改进与度量」展示分组——仅展示层
//      聚类，STAGE_TABS 键序与 ?tab= 语义不动；
//   4) Proactivity 只读边界：⑥治理页签只读投影（只看执行结果/漂移状态，
//      编辑深链回①搭建），①搭建链路（assets→GovRegistryRulesView）保持可写。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
// 主动性面板 API 三件套桩化（readonly 边界测试只看呈现，不发请求）
vi.mock('@/custom/governance/api/incident-suite', () => ({
  assessProactivity: vi.fn(),
  confirmProactivityAlignment: vi.fn(),
  deleteProactivityPolicy: vi.fn(),
  fetchProactivityAlignments: vi.fn().mockResolvedValue({ entries: [] }),
  fetchProactivityModel: vi.fn().mockResolvedValue({
    axes: { actionTier: [{ tier: 'inform' }, { tier: 'suggest' }] },
    caps: [{ level: 'L4', noContract: 'suggest', withContract: 'reversible_exec' }],
  }),
  fetchProactivityPolicies: vi.fn().mockResolvedValue({
    entries: [{ profile: 'coding-agent', level: 'L4', contract: null, goalId: null, resolved: null }],
  }),
  putProactivityPolicy: vi.fn(),
}))

import {
  STAGE_TABS, DEFAULT_TAB, resolveTab,
  STAGE_TAB_GROUP_LABELS, stageTabGroups,
} from '../stage-tabs'

const progressState = vi.hoisted(() => ({ stage: {} as Record<number, string> }))
vi.mock('../composables/useDailyStageProgress', async () => {
  const { ref } = await import('vue')
  return {
    useDailyStageProgress: () => ({
      tasks: ref([]),
      stageCount: () => 0,
      stageState: (no: number) => progressState.stage[no] ?? 'pending',
      stepState: () => 'current',
    }),
  }
})
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { name: 'SwarmKanbanView', template: '<div data-testid="kanban-stub" />' },
}))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({
  useRunCenterStore: () => ({ sortedRuns: [] }),
}))

/** HEAD 基线：37 个页签 key 的逐阶段精确序列（守门底线——重构不得动一个键） */
const BASELINE_KEYS: Record<1 | 2 | 3 | 4 | 5 | 6, readonly string[]> = {
  1: ['steps', 'org', 'accounts', 'teams', 'assets', 'agents'],
  2: ['reqs', 'docs', 'g1', 'preflight'],
  3: ['tasks', 'analysis', 'g2', 'schedule'],
  4: ['today', 'board', 'approvals', 'risk', 'quality'],
  5: ['overview', 'trace', 'delivery', 'uat', 'g5', 'cases'],
  6: ['clearance', 'issues', 'posture', 'secAudit', 'audit', 'trust', 'reviewGov', 'improve', 'metrics', 'docs', 'gateLog', 'proactivity'],
}

describe('页签注册零变化底线（37 键 + 深链 + 默认签）', () => {
  it('37 个页签 key 与既有序列逐一相等', () => {
    let total = 0
    for (const stage of [1, 2, 3, 4, 5, 6] as const) {
      expect(STAGE_TABS[stage].map((t) => t.key), `stage${stage}`).toEqual(BASELINE_KEYS[stage])
      total += STAGE_TABS[stage].length
    }
    expect(total).toBe(37)
  })

  it('默认签与深链解析不变（含②launch 旧深链回退）', () => {
    expect(DEFAULT_TAB).toEqual({ 1: 'steps', 2: 'reqs', 3: 'tasks', 4: 'today', 5: 'overview', 6: 'clearance' })
    expect(resolveTab(2, 'launch')).toBe('preflight')
    expect(resolveTab(6, undefined)).toBe('clearance')
    expect(resolveTab(6, 'proactivity')).toBe('proactivity')
    expect(resolveTab(3, 'nope')).toBe('tasks')
  })
})

describe('统一注册：loader 与 props 落在 StageTabMeta 上', () => {
  it('每个页签携带 loader 懒加载 thunk（函数、调用返回 Promise）与组件锚/双语标签', () => {
    for (const stage of [1, 2, 3, 4, 5, 6] as const) {
      for (const tab of STAGE_TABS[stage]) {
        expect(typeof tab.load, `${stage}/${tab.key} load`).toBe('function')
        expect(tab.load).toHaveLength(0) // () => import(...) 零参 thunk
        expect(!!tab.zh && !!tab.en && !!tab.component, `${stage}/${tab.key} labels`).toBe(true)
      }
    }
  })

  it('loader 真实可解析（抽检 proactivity/g1：返回含 default 组件的模块）', async () => {
    const proactivity = STAGE_TABS[6].find((t) => t.key === 'proactivity')!
    const mod = await proactivity.load() as { default?: unknown }
    expect(mod.default).toBeTruthy()
    const g1 = STAGE_TABS[2].find((t) => t.key === 'g1')!
    const gateMod = await g1.load() as { default?: unknown }
    expect(gateMod.default).toBeTruthy()
  })

  it('props 按页签配置防串参：门禁/系分作用域原样迁移，⑥proactivity 只读、①assets 可写', () => {
    const g1 = STAGE_TABS[2].find((t) => t.key === 'g1')!
    const g2 = STAGE_TABS[3].find((t) => t.key === 'g2')!
    const analysis = STAGE_TABS[3].find((t) => t.key === 'analysis')!
    const quality = STAGE_TABS[4].find((t) => t.key === 'quality')!
    const gateLog = STAGE_TABS[6].find((t) => t.key === 'gateLog')!
    const proactivity = STAGE_TABS[6].find((t) => t.key === 'proactivity')!
    const assets = STAGE_TABS[1].find((t) => t.key === 'assets')!
    expect(g1.props).toEqual({ gates: ['G1'] })
    expect(g2.props).toEqual({ gates: ['G2'] })
    expect(analysis.props).toEqual({ scope: 'g2' })
    expect(quality.props).toEqual({ gates: ['G3', 'G4'] })
    expect(gateLog.props).toBeUndefined()
    expect(proactivity.props).toEqual({ readonly: true })
    expect(assets.props).toBeUndefined()
  })
})

describe('⑥治理展示分组（仅展示层，不改键序语义）', () => {
  it('12 签按三组聚类：待处理/审计与质量/改进与度量，组内序=注册序', () => {
    const clusters = stageTabGroups(6)
    expect(clusters.map((c) => c.group)).toEqual(['todo', 'auditQuality', 'improve'])
    expect(clusters[0].tabs.map((t) => t.key)).toEqual(['clearance', 'issues'])
    expect(clusters[1].tabs.map((t) => t.key)).toEqual(['posture', 'secAudit', 'audit', 'trust', 'reviewGov', 'docs', 'gateLog'])
    expect(clusters[2].tabs.map((t) => t.key)).toEqual(['improve', 'metrics', 'proactivity'])
    // 三组恰好划分全部 12 签（不重不漏）
    const flat = clusters.flatMap((c) => c.tabs.map((t) => t.key))
    expect(flat).toHaveLength(12)
    expect(new Set(flat).size).toBe(12)
    expect(STAGE_TABS[6].map((t) => t.key)).toEqual(BASELINE_KEYS[6]) // 注册键序仍原样
  })

  it('分组标签 zh/en 成对；其他阶段单簇无分组', () => {
    expect(STAGE_TAB_GROUP_LABELS.todo).toEqual({ zh: '待处理', en: 'To resolve' })
    expect(STAGE_TAB_GROUP_LABELS.auditQuality).toEqual({ zh: '审计与质量', en: 'Audit & quality' })
    expect(STAGE_TAB_GROUP_LABELS.improve).toEqual({ zh: '改进与度量', en: 'Improve & metrics' })
    for (const stage of [1, 2, 3, 4, 5] as const) {
      const clusters = stageTabGroups(stage)
      expect(clusters).toHaveLength(1)
      expect(clusters[0].group).toBeNull()
      expect(clusters[0].tabs).toEqual(STAGE_TABS[stage])
      expect(STAGE_TABS[stage].every((t) => t.group === undefined)).toBe(true)
    }
  })
})

describe('Proactivity 只读边界（⑥只读投影，①可写）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('readonly：无策略表单/演算器/移除按钮，保留矩阵·策略解析态·漂移台账，编辑深链回①', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
      ] as RouteRecordRaw[],
    })
    const { default: ProactivitySection } = await import('@/custom/governance/components/ProactivitySection.vue')
    const w = mount(ProactivitySection, { props: { readonly: true }, global: { plugins: [router] } })
    await flushPromises()
    // 只读投影：编辑面全部隐藏
    expect(w.find('[data-testid="pa-policy-form"]').exists()).toBe(false)
    expect(w.find('[data-testid="pa-assess-form"]').exists()).toBe(false)
    expect(w.find('[data-testid="pa-policy-save"]').exists()).toBe(false)
    expect(w.find('[data-testid="pa-assess-run"]').exists()).toBe(false)
    expect(w.findAll('[data-testid^="pa-policy-del-"]').length).toBe(0)
    // 执行结果/漂移状态仍可见
    expect(w.find('[data-testid="pa-matrix"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-policy-table"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-alignment-table"]').exists()).toBe(true)
    // 编辑深链回①搭建·环境与资产
    const link = w.find('[data-testid="pa-readonly-edit-link"]')
    expect(link.exists()).toBe(true)
    await link.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.stage1')
    expect(router.currentRoute.value.query.tab).toBe('assets')
    w.unmount()
  })

  it('默认可写：①搭建链路（GovRegistryRulesView 内嵌）无 readonly，表单在', async () => {
    const { default: GovRegistryRulesView } = await import('../views/gov/GovRegistryRulesView.vue')
    const w = mount(GovRegistryRulesView, {
      global: {
        stubs: {
          LedgerSection: { template: '<div />' }, RuntimeSection: { template: '<div />' },
          StateModelSection: { template: '<div />' }, DecisionRulesSection: { template: '<div />' },
          AgentIdentitySection: { template: '<div />' }, AutonomyLadderSection: { template: '<div />' },
          ToolPolicySection: { template: '<div />' },
        },
      },
    })
    await flushPromises()
    expect(w.find('[data-testid="pa-policy-form"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-assess-form"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-readonly-edit-link"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('StageShell 消费统一注册（合并后端到端）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  async function mountStage(stage: 1 | 2 | 3 | 4 | 5 | 6, query = '') {
    const { default: StageShell } = await import('../views/stage/StageShell.vue')
    const router: Router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/x', name: `ia2.stage${stage}` as 'ia2.stage1', component: StageShell, props: { stage } },
        { path: '/app', name: 'ia2.journey', component: { template: '<div />' } },
        // 阶段面板内的 RouterLink 目标（度量检查联评测岛等）：路由可解析即可
        { path: '/app/eval', name: 'ia2.eval', component: { template: '<div />' } },
        { path: '/app/bpa', name: 'ia2.bpa', component: { template: '<div />' } },
        { path: '/app/ontology', name: 'ia2.ontology', component: { template: '<div />' } },
        { path: '/app/skillgov', name: 'ia2.skillgov', component: { template: '<div />' } },
        { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
        { path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
        { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
        { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
      ] as RouteRecordRaw[],
    })
    await router.push(`/x${query}`)
    await router.isReady()
    const w = mount(StageShell, { props: { stage }, global: { plugins: [router] } })
    await flushPromises()
    return { w, router }
  }

  it('⑥?tab=proactivity：页签条带三组标签，面板走只读投影（表单缺席）', async () => {
    const { w } = await mountStage(6, '?tab=proactivity')
    const bar = w.find('[data-testid="stage-tabs-scroll"]')
    expect(bar.text()).toContain('待处理')
    expect(bar.text()).toContain('审计与质量')
    expect(bar.text()).toContain('改进与度量')
    expect(w.findAll('[role="tab"]').length).toBe(12)
    expect(w.find('[data-testid="stg-tab-proactivity"]').classes()).toContain('stg__tab--on')
    // 统一注册装载：readonly props 经 meta 传入，编辑面缺席
    expect(w.find('[data-testid="pa-readonly-note"]').exists()).toBe(true)
    expect(w.find('[data-testid="pa-policy-form"]').exists()).toBe(false)
    w.unmount()
  })

  it('⑥深链仍经统一注册解析：?tab=metrics 落度量检查签', async () => {
    const { w } = await mountStage(6, '?tab=metrics')
    expect(w.find('[data-testid="stg-tab-metrics"]').classes()).toContain('stg__tab--on')
    w.unmount()
  })

  it('①页签条无分组标签（单簇），?tab=assets 正常装载', async () => {
    const { w } = await mountStage(1, '?tab=assets')
    const bar = w.find('[data-testid="stage-tabs-scroll"]')
    expect(bar.text()).not.toContain('待处理')
    expect(w.find('[data-testid="stg-tab-assets"]').classes()).toContain('stg__tab--on')
    w.unmount()
  })
})
