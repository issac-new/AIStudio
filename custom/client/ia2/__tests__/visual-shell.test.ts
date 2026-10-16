// @vitest-environment jsdom
// V1 壳收敛（2026-10-16 视觉重规划 D2）：推演/治理两中心 body 类生命周期
// +上游 rail 隐藏规则在库（CSS 收敛零补丁的断言面）。独立文件避开重 mock 干扰。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
vi.mock('../api/overview', () => ({ fetchRunState: vi.fn(), postureKind: (p: string) => p, gateRows: () => [], netCardRows: () => ({ compensated: '', net: '', byType: [] }) }))
vi.mock('../api/ops', () => ({ fetchTopology: vi.fn(), topologyRows: () => [], cliHealthEntries: () => [], sleepingRows: () => [] }))
vi.mock('../api/supervision', () => ({ fetchJournal: vi.fn(), fetchAnchor: vi.fn(), organizeJournal: () => ({ windows: [], briefs: [], verdicts: [], tickets: [], unclassified: 0 }) }))
vi.mock('../api/gatekeeper', () => ({ fetchClearanceLedger: vi.fn(), resolveClearance: vi.fn(), waiveClearance: vi.fn(), groupClearanceTargets: () => [], buildClosingOrder: () => '' }))
vi.mock('../api/gov', () => ({ fetchGateRepairs: vi.fn(), transitionGateRepair: vi.fn(), fetchKeyLedger: vi.fn(), putKeyLedger: vi.fn(), legalTransitions: () => [], GATE_STATE_LABEL: {}, GATE_FULL_NAME: {}, joinIssueDisposal: () => [], fetchIssues: vi.fn() }))
vi.mock('../../kanban/handoff', () => ({ HANDOFF_TYPES: [], HANDOFF_STATES: [], HANDOFF_TYPE_LABEL: {}, HANDOFF_STATE_LABEL: {} }))

// jsdom 无 ResizeObserver（迁入组件链上的图表件用）——桩化
class RO { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', RO)

import SimCenterView from '../views/sim/SimCenterView.vue'
import GovCenterView from '../views/gov/GovCenterView.vue'

async function mountView(view: typeof SimCenterView, path: string, name: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, name, component: view }] })
  await router.push(path)
  await router.isReady()
  return mount(view, { global: { plugins: [router] } })
}

describe('壳收敛 ia-center-full（V1·视觉重规划 D2）', () => {
  it('SimCenterView：挂载加 body 类、卸载移除', { timeout: 20000 }, async () => {
    const w = await mountView(SimCenterView, '/app/sim', 'ia2.sim')
    expect(document.body.classList.contains('ia-center-full')).toBe(true)
    w.unmount()
    expect(document.body.classList.contains('ia-center-full')).toBe(false)
  })

  it('GovCenterView：同款生命周期', { timeout: 20000 }, async () => {
    const w = await mountView(GovCenterView, '/app/gov', 'ia2.governance')
    expect(document.body.classList.contains('ia-center-full')).toBe(true)
    w.unmount()
    expect(document.body.classList.contains('ia-center-full')).toBe(false)
  })

  it('隐藏规则在库：ia2.scss 含 body.ia-center-full .studio-navigation-rail { display:none }', () => {
    const scss = readFileSync(resolve(__dirname, '../styles/ia2.scss'), 'utf8')
    expect(scss).toContain('body.ia-center-full .studio-navigation-rail')
    expect(scss.replace(/\s+/g, ' ')).toContain('display: none')
  })
})
