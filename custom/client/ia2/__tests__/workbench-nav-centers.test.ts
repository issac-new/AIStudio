// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/workbench-nav-centers.test.ts
// A0 三中心导航守门（2026-10-16 屏 0 / R8）——纯函数面：
//   centerForPath 高亮判定正反例 / CENTER_NAVS·ISLAND_NAVS 注册表自洽 /
//   legacyTabRedirect 迁出 10 键映射全覆盖 / 13 键拆分注册表（3+7+3 守恒）。
// DOM 渲染面（顶栏挂载/高亮 class/点击导航）在 workbench-flow.test.ts 断言。
import { describe, it, expect, vi } from 'vitest'

// TasksView 重组件打桩（import 链带上游 vite define + 重 store；同 ia-views 纪律）
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { template: '<div class="kanban-stub" />' },
}))
vi.mock('@/custom/ia2/views/gov/GovOrgKnowledgeView.vue', () => ({
  default: { template: '<div data-testid="gov-org-stub">gov-org</div>' },
}))

import { centerForPath, CENTER_NAVS, ISLAND_NAVS } from '../nav-centers'
import { legacyTabRedirect } from '../views/TasksView.vue'
import { TASKS_TABS_TEXT } from '../i18n-tasks-tabs'
import { GOV_TABS_TEXT } from '../i18n-gov-tabs'

describe('centerForPath 三中心高亮判定（纯函数）', () => {
  it('/app 家族（含 board/dash/会话子路径/工作页）归工作台', () => {
    for (const p of ['/app', '/app/board', '/app/dash', '/app/s/chat/s1', '/app/s/room/%21r1', '/app/cases', '/app/inbox']) {
      expect(centerForPath(p), p).toBe('workbench')
    }
  })

  it('/app/sim 与六签子路径归推演中心', () => {
    for (const p of ['/app/sim', '/app/sim/trace', '/app/sim/supervision', '/app/sim/ops', '/app/sim/evidence', '/app/sim/delivery']) {
      expect(centerForPath(p), p).toBe('sim')
    }
  })

  it('/app/gov 前缀归治理中心（判定先行，不依赖 C1 路由升格）', () => {
    expect(centerForPath('/app/gov')).toBe('gov')
    expect(centerForPath('/app/gov/audit')).toBe('gov')
  })

  it('段边界：/app/simulation 不误判推演中心（前缀须整段）', () => {
    expect(centerForPath('/app/simulation')).toBe('workbench')
    expect(centerForPath('/app/governance-x')).toBe('workbench')
  })

  it('非 /app 家族返回 null（IDE 侧 / 上游壳页 / 根路径 / 近形路径）', () => {
    for (const p of ['/ide', '/ide/task/1', '/', '/hermes/chat', '/appx', '/app-settings']) {
      expect(centerForPath(p), p).toBe(null)
    }
  })
})

describe('CENTER_NAVS / ISLAND_NAVS 注册表自洽', () => {
  it('三中心入口=[工作台/推演中心/治理中心]，入口路径与判定函数互证', () => {
    expect(CENTER_NAVS.map(c => c.key)).toEqual(['workbench', 'sim', 'gov'])
    expect(CENTER_NAVS.map(c => c.labelZh)).toEqual(['工作台', '推演中心', '治理中心'])
    for (const c of CENTER_NAVS) {
      // 每个入口的首页路径必须判定回自身中心（高亮锚不死链）
      expect(centerForPath(c.path), c.key).toBe(c.key)
      expect(c.name, c.key).toBeTruthy()
    }
  })

  it('岛屿入口五件（IDE/BPA/本体/评测/技能治理）路由名与开关键齐备', () => {
    expect(ISLAND_NAVS.map(i => i.featureKey)).toEqual(['ide', 'bpa', 'ontology', 'eval', 'skillgov'])
    expect(ISLAND_NAVS.map(i => i.labelZh)).toEqual(['IDE', 'BPA', '本体', '评测', '技能治理'])
    for (const i of ISLAND_NAVS) {
      expect(i.name, i.featureKey).toBeTruthy()
      expect(i.testid, i.featureKey).toBeTruthy()
    }
  })
})

describe('legacyTabRedirect 旧签重定向（A0：迁出 10 键深链不死链）', () => {
  it('推演三键 → 推演中心对应签（trace→签6 / accounts→签5 / observatory→签3）', () => {
    expect(legacyTabRedirect('trace')).toEqual({ name: 'ia2.simTrace' })
    expect(legacyTabRedirect('accounts')).toEqual({ name: 'ia2.simDelivery' })
    expect(legacyTabRedirect('observatory')).toEqual({ name: 'ia2.simOps' })
  })

  it('治理七键 → 治理中心对应签（E1 拍摄位同步：帧语义直落专签不断链）', () => {
    expect(legacyTabRedirect('gov-registry')).toEqual({ name: 'ia2.govOrgAssets' })
    expect(legacyTabRedirect('gov-audit')).toEqual({ name: 'ia2.govAudit' })
    expect(legacyTabRedirect('gov-docs')).toEqual({ name: 'ia2.govDocs' })
    for (const k of ['gov-harness', 'gov-cluster', 'gov-ontology', 'gov-session-health']) {
      expect(legacyTabRedirect(k), k).toEqual({ name: 'ia2.govMetrics' })
    }
  })

  it('board 3 键 / gov 别名 / 未知值 / 空串 / 驼峰误写 → null（本地页内处理）', () => {
    for (const k of ['board', 'orchestra', 'gov-org', 'gov', 'weird', '', 'tabTrace', 'TabGovDocs']) {
      expect(legacyTabRedirect(k), k).toBe(null)
    }
  })
})

describe('13 键拆分注册表（三中心模块内事实源）', () => {
  it('i18n-tasks-tabs 收敛为工作台 3 键，zh/en 键成对、文案随说人话轮原值', () => {
    expect(Object.keys(TASKS_TABS_TEXT.zh)).toEqual(['tabBoard', 'tabOrchestra', 'tabGovOrg'])
    expect(Object.keys(TASKS_TABS_TEXT.zh)).toEqual(Object.keys(TASKS_TABS_TEXT.en))
    expect(TASKS_TABS_TEXT.zh.tabBoard).toBe('看板')
    expect(TASKS_TABS_TEXT.zh.tabOrchestra).toBe('任务协同')
    expect(TASKS_TABS_TEXT.zh.tabGovOrg).toBe('协作与知识')
    expect(TASKS_TABS_TEXT.en.tabBoard).toBe('Board')
  })

  it('i18n-gov-tabs 治理 7 键（过渡事实源，C1 消费），zh/en 键成对、值承接原值', () => {
    expect(Object.keys(GOV_TABS_TEXT.zh)).toEqual([
      'tabGovRegistry', 'tabGovAudit', 'tabGovDocs', 'tabGovHarness',
      'tabGovCluster', 'tabGovOntology', 'tabGovSessionHealth',
    ])
    expect(Object.keys(GOV_TABS_TEXT.zh)).toEqual(Object.keys(GOV_TABS_TEXT.en))
    expect(GOV_TABS_TEXT.zh.tabGovRegistry).toBe('能力与规则')
    expect(GOV_TABS_TEXT.zh.tabGovOntology).toBe('语义体检')
    expect(GOV_TABS_TEXT.en.tabGovSessionHealth).toBe('Session Health')
  })

  it('拆分守恒：工作台 3 + 治理 7 + 推演承接 3（sim-tabs tabTrace/tabDelivery/tabOps）= 13', async () => {
    const { SIM_TABS_TEXT } = await import('../views/sim/sim-tabs')
    for (const k of ['tabTrace', 'tabDelivery', 'tabOps'] as const) {
      expect(SIM_TABS_TEXT.zh, k).toHaveProperty(k)
    }
    expect(
      Object.keys(TASKS_TABS_TEXT.zh).length
      + Object.keys(GOV_TABS_TEXT.zh).length
      + 3,
    ).toBe(13)
  })
})
