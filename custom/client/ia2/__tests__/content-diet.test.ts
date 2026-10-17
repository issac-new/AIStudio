// @vitest-environment jsdom
// 内容减负与术语残留批守门（2026-10-17）：
//   1) 仿真中心流程条压缩为单行，不再渲染说明卡；
//   2) 注意力条标签/提示走运行时覆盖，标准术语「看板」；
//   3) 治理页签与门禁文案按术语映射表收敛。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

import SimFlowStrip from '../views/sim/SimFlowStrip.vue'
import { IA2_TERM_OVERRIDES_ZH, IA2_TERM_OVERRIDES_EN } from '../i18n-term-overrides'
import { GOV_TABS_TEXT } from '../i18n-gov-tabs'

async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
      { path: '/app/sim/supervision', name: 'ia2.simSupervision', component: { template: '<div />' } },
    ],
  })
  await router.push('/app/sim')
  await router.isReady()
  return router
}

describe('SimFlowStrip — 单行运行流程条', () => {
  it('三段标准术语、当前段高亮、无说明卡占位', async () => {
    const w = mount(SimFlowStrip, { global: { plugins: [await makeRouter()] } })
    expect(w.text()).toContain('运行流程')
    expect(w.find('[data-testid="sim-flow-prepare"]').text()).toBe('启动准备')
    expect(w.find('[data-testid="sim-flow-monitor"]').text()).toBe('运行监控')
    expect(w.find('[data-testid="sim-flow-close"]').text()).toBe('运行复盘')
    expect(w.find('[data-testid="sim-flow-monitor"]').classes()).toContain('sfs__stage--cur')
    // 说明文案不再渲染（导览减负的核心断言）
    expect(w.findAll('.sfs__hint')).toHaveLength(0)
    w.unmount()
  })
})

describe('术语覆盖 — 注意力条与治理页签', () => {
  it('注意力条标签=看板、提示=单击', () => {
    const zh = IA2_TERM_OVERRIDES_ZH.ia2.overview
    expect(zh.swarmKanbanLabel).toBe('看板')
    expect(zh.swarmKanbanHint).toContain('点击打开看板')
    const en = IA2_TERM_OVERRIDES_EN.ia2.overview
    expect(en.swarmKanbanLabel).toBe('Kanban')
  })

  it('治理页签：本体校验/研发效能（行业标准译名）', () => {
    expect(GOV_TABS_TEXT.zh.tabGovOntology).toBe('本体校验')
    expect(GOV_TABS_TEXT.zh.tabGovHarness).toBe('研发效能')
    expect(GOV_TABS_TEXT.en.tabGovOntology).toBe('Ontology Validation')
    expect(GOV_TABS_TEXT.en.tabGovHarness).toBe('Engineering Effectiveness')
  })
})
