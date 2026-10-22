// @vitest-environment jsdom
// 长程可信页签守门：页签注册 + 组件在空态/正常态/错误态下的渲染。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { DEFAULT_TAB, STAGE_TABS, resolveTab } from '../stage-tabs'
import LongHorizonTrustPanel from '../views/gov/LongHorizonTrustPanel.vue'
import type {
  TrustCaseDto, TrustCaseSummaryDto, TrustOverviewDto, TrustSurfacesDto,
} from '../api/trust'

vi.mock('../api/trust', () => ({
  fetchTrustOverview: vi.fn(),
  fetchTrustSurfaces: vi.fn(),
  fetchTrustCases: vi.fn(),
  fetchTrustCase: vi.fn(),
  createTrustCase: vi.fn(),
  beginTrustAudit: vi.fn(),
  recordTrustAudits: vi.fn(),
  admitTrustCase: vi.fn(),
  writeTrustCheckpoint: vi.fn(),
  verifyTrustCheckpoint: vi.fn(),
  verifyTrustLedger: vi.fn(),
}))
const api = await import('../api/trust')
const mock = api as unknown as Record<string, ReturnType<typeof vi.fn>>

const overview: TrustOverviewDto = {
  ok: true, cases: 1, open: 0, admitted: 1, untrusted: 0,
  forgeAttempts: 0, integrityViolations: 0, ledgerIntact: true, ledgerEntries: 4, surfaceValid: true,
}

const surfaces: TrustSurfacesDto = {
  ok: true,
  valid: true,
  sizes: { manager: 0, auditor: 10, executor: 17 },
  violations: [],
  surfaces: [
    { role: 'manager', tools: [], allowWrite: false },
    { role: 'auditor', tools: ['fs.read'], allowWrite: false },
    { role: 'executor', tools: ['fs.read', 'fs.write'], allowWrite: true },
  ],
}

const summary: TrustCaseSummaryDto = {
  id: 'trust-1', title: '登录改造', state: 'admitted', forgeAttempts: 0,
  claimCount: 1, verifiedCount: 1, refutedCount: 0, integrityState: 'clean', updatedAt: 1_760_000_000_000,
}

const detail: TrustCaseDto = {
  id: 'trust-1', title: '登录改造', workspaceRoot: '/tmp/ws',
  createdAt: 1, updatedAt: 2, state: 'admitted', forgeAttempts: 0,
  claims: [{ id: 'c1', statement: '登录页可用', evidenceRefs: ['file:src/login.ts'], claimedBy: 'dev', claimedAt: 1 }],
  audits: [{ id: 'a1', claimId: 'c1', auditor: 'auditor-a', verdict: 'verified', observations: ['读取文件并核对摘要'], at: 2 }],
  decisions: [{
    id: 'd1', at: 3, actor: 'manager', result: 'admitted', proposal: ['c1'], blockers: [], warnings: [],
    claimStates: [{ claimId: 'c1', verdict: 'verified' }],
    integrity: {
      state: 'clean', baselineManifestId: 'm1', baselineDigest: 'b1', currentManifestId: 'm2', currentDigest: 'c2',
      changes: [], changeTotal: 0, checkedAt: 3, truncated: false, overridden: false,
    },
    surfaceValid: true,
  }],
  baseline: { manifestId: 'm1', digest: 'b1', at: 1, auto: false },
  integrity: {
    state: 'clean', baselineManifestId: 'm1', baselineDigest: 'b1', currentManifestId: 'm2', currentDigest: 'c2',
    changes: [], changeTotal: 0, checkedAt: 3, truncated: false, overridden: false,
  },
  checkpoints: [{
    id: 'cp1', caseId: 'trust-1', round: 1, at: 4, actor: 'manager',
    caseDigest: 'case-digest-123456', workspaceManifestId: 'm2', workspaceDigest: 'workspace-digest-123456',
    workspaceRoot: '/tmp/ws',
  }],
}

beforeEach(() => {
  for (const fn of Object.values(mock)) fn.mockReset()
  mock.fetchTrustOverview.mockResolvedValue(overview)
  mock.fetchTrustSurfaces.mockResolvedValue(surfaces)
  mock.fetchTrustCases.mockResolvedValue({ ok: true, cases: [summary] })
  mock.fetchTrustCase.mockResolvedValue({ ok: true, case: detail })
})

describe('长程可信页签注册', () => {
  it('⑥治理注册 trust 页签，深链解析到该页签', () => {
    const tab = STAGE_TABS[6].find((t) => t.key === 'trust')
    expect(tab).toMatchObject({ zh: '长程可信', en: 'Long-horizon trust', component: 'trust' })
    expect(resolveTab(6, 'trust')).toBe('trust')
    expect(DEFAULT_TAB[6]).toBe('clearance')
  })
})

describe('长程可信面板', () => {
  it('正常态渲染准入指标、工具面单调链与案件列表；点开案件显示主张裁决', async () => {
    const wrapper = mount(LongHorizonTrustPanel)
    await flushPromises()

    expect(wrapper.find('[data-testid="trust-kpi"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trust-surface-chain"]').text()).toContain('单调链成立')
    expect(wrapper.find('[data-testid="trust-surface-chain"]').text()).toContain('17')
    expect(wrapper.find('[data-testid="trust-cases-table"]').text()).toContain('登录改造')
    expect(wrapper.find('[data-testid="trust-detail"]').exists()).toBe(false)

    await wrapper.find('[data-testid="trust-case-row"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="trust-detail"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trust-claims-table"]').text()).toContain('登录页可用')
    expect(wrapper.find('[data-testid="trust-claims-table"]').text()).toContain('已复核')
    expect(wrapper.find('[data-testid="trust-decision"]').text()).toContain('已准入')
  })

  it('空态如实显示，不伪造案件', async () => {
    mock.fetchTrustOverview.mockResolvedValue({ ...overview, cases: 0, admitted: 0, ledgerEntries: 0 })
    mock.fetchTrustCases.mockResolvedValue({ ok: true, cases: [] })
    const wrapper = mount(LongHorizonTrustPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="trust-cases-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="trust-cases-table"]').exists()).toBe(false)
  })

  it('错误态显示后端错误，不吞异常', async () => {
    mock.fetchTrustOverview.mockRejectedValue(new Error('后端不可用'))
    const wrapper = mount(LongHorizonTrustPanel)
    await flushPromises()
    expect(wrapper.find('[data-testid="trust-error"]').text()).toContain('后端不可用')
  })
})
