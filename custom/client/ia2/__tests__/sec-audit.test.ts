// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/sec-audit.test.ts
// 安全审计页签守门：纯视图函数 + 组件渲染 + 页签注册。
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SecAuditPanel from '../views/gov/SecAuditPanel.vue'
import { STAGE_TABS } from '../stage-tabs'

vi.mock('@/custom/ia2/api/sec-audit', () => ({
  fetchCatalog: vi.fn(async () => ({
    catalog: [
      { class: 'tool_exec', name: '工具执行', focus: 'f', manual: false, hasCollector: true },
      { class: 'skills', name: '技能注册', focus: 'f', manual: false, hasCollector: true },
    ],
  })),
  fetchProjects: vi.fn(async () => ({
    projects: [{
      projectId: 'proj-1',
      name: '主部署审计',
      target: { kind: 'agent-deployment' },
      surfaces: ['tool_exec'],
      fingerprint: 'abc',
      createdAt: 1,
      runs: [{
        runId: 'run-1',
        targetFingerprint: 'abc',
        startedAt: 2,
        status: 'open',
        ledger: {
          entries: [
            { id: 'tool_exec', surfaceClass: 'tool_exec', status: 'full', evidenceSummary: '审批链完整', autoFindingCount: 0 },
            { id: 'skills', surfaceClass: 'skills', status: 'unchecked' },
          ],
          critic: [{ id: 'unchecked:skills', kind: 'unchecked_surface', surfaceClass: 'skills', detail: '面未检查：skills' }],
          summary: { total: 2, full: 1, partial: 0, unchecked: 1, coverageRatio: 0.5 },
        },
      }],
      findings: [{
        findingId: 'f-1',
        candidate: { candidateId: 'c-1', surfaceClass: 'tool_exec', title: '审批旁路', detail: 'd', author: 'hunter-1', createdAt: 1 },
        status: 'needs_validation',
        recordReviews: [],
      }],
    }],
  })),
  createProject: vi.fn(),
  startRun: vi.fn(),
  submitCandidate: vi.fn(),
  verifyFinding: vi.fn(),
  recordReview: vi.fn(),
  finalizeRun: vi.fn(),
}))

const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: {}, en: {} } })

function mountPanel() {
  return mount(SecAuditPanel, { global: { plugins: [i18n] } })
}

describe('安全审计页签', () => {
  it('⑥治理页签注册 secAudit 且 zh/en 成对', () => {
    const tab = STAGE_TABS[6].find((t) => t.key === 'secAudit')
    expect(tab).toBeDefined()
    expect(tab?.zh).toBe('安全审计')
    expect(tab?.en).toBe('Security audit')
  })

  it('渲染：覆盖账本/批评者/发现/候选表单', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('[data-testid="sec-audit-panel"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('主部署审计')
    expect(wrapper.text()).toContain('覆盖率 50%')
    expect(wrapper.text()).toContain('覆盖批评者')
    expect(wrapper.text()).toContain('审批旁路')
    expect(wrapper.find('[data-testid="sec-audit-cand-title"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sec-audit-verify-id"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="sec-audit-finalize"]').exists()).toBe(true)
  })
})
