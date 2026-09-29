// 治理中心前端守门（补功能主清单 2026-09-28）：
// ① 路由存在性：buildIaRoutes 含 /app/gov（ia2.governance）
// ② 视图渲染：六闸卡 + 工件清单（点击渲染 markdown）+ 待裁决评审（裁决按钮 emit 链）
// ③ i18n：governanceMessages zh/en 键集合一致（治理词条单一事实源自检）
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'

const { governanceMessages } = await import('@/custom/governance/i18n')
const api = await import('@/custom/governance/api/governance')
const approvals = await import('@/custom/cockpit/api/approvals')

vi.mock('@/custom/governance/api/governance', () => ({
  fetchGovernanceOverview: vi.fn(),
  fetchGovernanceDoc: vi.fn(),
  runDomainAudit: vi.fn(async () => ({ ok: true, run: 't-run', results: [] })),
  fetchDomainAudit: vi.fn(async () => ({
    ok: true, total: 6, runs: ['t-run'],
    latest: { L0: { run: 't-run', domain: 'L0', verdict: 'pass', evidence: ['AC 可判定 7 条'], checkedAt: '' } },
    ledger: [],
  })),
}))
vi.mock('@/custom/cockpit/api/approvals', () => ({
  fetchPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
  dedupePending: (items: unknown[]) => items,
}))
vi.mock('@/custom/kanban/components/KanbanMarkdown.vue', () => ({
  default: { name: 'KanbanMarkdown', props: ['source'], template: '<div class="md-stub">{{ source }}</div>' },
}))

const overviewFixture = {
  ok: true, repo: '/tmp/repo', repoReady: true,
  docs: [
    { kind: 'freeze', path: 'docs/requirements/RFD-001.freeze.md', title: 'G1 需求冻结', gate: 'G1', group: 'gate', exists: true, commit: 'abc1234', committedAt: '2026-09-26T00:24:00+08:00', lines: 30 },
    { kind: 'roster', path: 'docs/admin/roster.md', title: '账号清单', gate: '', group: 'admin', exists: true, commit: 'abc1235', committedAt: '2026-09-26T00:20:00+08:00', lines: 20 },
    { kind: 'design', path: 'docs/design/RFD-001-architecture-design.md', title: '概要设计', gate: 'G2', exists: true, commit: 'def5678', committedAt: '2026-09-26T04:00:00+08:00', lines: 461 },
    { kind: 'schedule', path: 'docs/plan/RFD-001-schedule.md', title: '排期', gate: 'G2', exists: true, commit: 'aaa0001', committedAt: '2026-09-26T05:30:00+08:00', lines: 20 },
    { kind: 'test', path: 'docs/test/RFD-001-test-report.md', title: 'G4 测试报告', gate: 'G4', exists: true, commit: 'bbb0002', committedAt: '2026-09-26T06:50:00+08:00', lines: 40 },
    { kind: 'release', path: 'RELEASE.md', title: 'G5 发布说明', gate: 'G5', exists: true, commit: 'ccc0003', committedAt: '2026-09-26T08:19:00+08:00', lines: 60 },
    { kind: 'uat', path: 'docs/acceptance/RFD-001-acceptance.md', title: 'UAT 验收', gate: 'G5', exists: true, commit: 'ddd0004', committedAt: '2026-09-26T08:24:00+08:00', lines: 25 },
    { kind: 'audit', path: 'docs/retro/default-audit-opinion.md', title: '审计意见书', gate: 'G6', exists: true, commit: 'eee0005', committedAt: '2026-09-26T08:24:00+08:00', lines: 15 },
    { kind: 'retro', path: 'docs/retro/default-RFD-001-retrospective.md', title: '复盘报告', gate: 'G6', exists: false, commit: null, committedAt: null, lines: 0 },
  ],
  devBranches: [
    { ref: 'origin/feat/DEV-PAYCORE', commit: 'fc7e13c', updatedAt: '2026-09-27' },
    { ref: 'origin/feat/DEV-CHWX', commit: 'd658954', updatedAt: '2026-09-27' },
    { ref: 'origin/feat/DEV-CHALI', commit: 'a411c1a', updatedAt: '2026-09-27' },
    { ref: 'origin/feat/DEV-MP', commit: 'c15ecab', updatedAt: '2026-09-27' },
  ],
  pendingReviews: 1,
}

function makeI18n(locale = 'zh') {
  return createI18n({
    legacy: false,
    locale,
    messages: { zh: governanceMessages.zh, en: governanceMessages.en } as Record<string, any>,
  })
}

async function mountView() {
  const GovernanceView = (await import('@/custom/ia2/views/GovernanceView.vue')).default
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] })
  const wrapper = mount(GovernanceView, { global: { plugins: [makeI18n(), router] } })
  await flushPromises()
  return wrapper
}

describe('治理中心前端', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchGovernanceOverview).mockResolvedValue(overviewFixture as any)
    vi.mocked(api.fetchGovernanceDoc).mockResolvedValue({
      ok: true, kind: 'freeze', title: 'G1 需求冻结', gate: 'G1',
      commit: 'abc1234', committedAt: '2026-09-26T00:24:00+08:00',
      markdown: '# RFD-001 G1 冻结标记\n\nAC-1 下单幂等\n\nfrozen: true',
    } as any)
    vi.mocked(approvals.fetchPendingApprovals).mockResolvedValue({
      items: [{ id: 'review:r1', kind: 'review', title: 'demo-rfd001-review', detail: '概设评审', createdAt: Date.now() }],
    } as any)
    vi.mocked(approvals.decideApproval).mockResolvedValue({ ok: true } as any)
  })

  it('路由表含 ia2.governance（/app/gov）', async () => {
    const { buildIaRoutes } = await import('@/custom/ia2/routes')
    const routes = buildIaRoutes()
    const flat = JSON.stringify(routes)
    expect(flat).toContain('"ia2.governance"')
    expect(flat).toContain('"gov"')
  })

  it('渲染六闸卡（G3 以分支数为证据）+ 工件清单 + 待裁决评审', async () => {
    const wrapper = await mountView()
    const gates = wrapper.findAll('.ia-gov__gate')
    expect(gates).toHaveLength(6)
    expect(wrapper.find('[data-testid="gov-gate-G1"]').text()).toContain('在仓')
    expect(wrapper.find('[data-testid="gov-gate-G3"]').text()).toContain('4')
    // 工件库分组渲染（六闸工件 + 管理档案同屏）
    const groupTitles = wrapper.findAll('.ia-gov__group-title').map(n => n.text())
    expect(groupTitles).toContain('六闸工件')
    expect(groupTitles).toContain('管理档案')
    expect(wrapper.find('[data-testid="gov-doc-roster"]').exists()).toBe(true)
    // 六闸卡计数不受管理档案掺入（roster gate='' 不计入任何闸）
    expect(wrapper.find('[data-testid="gov-gate-G1"]').text()).toContain('1/1')
    // 缺失工件禁用态
    const retroBtn = wrapper.find('[data-testid="gov-doc-retro"]')
    expect(retroBtn.attributes('disabled')).toBeDefined()
    // 待裁决评审在列
    expect(wrapper.find('[data-testid="gov-review-review:r1"]').exists()).toBe(true)
  })

  it('点击工件渲染 markdown 全文（含 frozen:true 与 commit 锚点）', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="gov-doc-freeze"]').trigger('click')
    await flushPromises()
    const md = wrapper.find('[data-testid="gov-doc-md"]')
    expect(md.text()).toContain('frozen: true')
    expect(wrapper.find('.ia-gov__docview-meta').text()).toContain('abc1234')
  })

  it('裁决按钮走 decideApproval 并刷新', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="gov-review-review:r1"] .ia-gov__btn.is-approve').trigger('click')
    await flushPromises()
    expect(approvals.decideApproval).toHaveBeenCalledWith('review:r1', 'approve')
    expect(api.fetchGovernanceOverview).toHaveBeenCalledTimes(2)
  })

  it('六域体检区渲染（台账最新判定+运行按钮链）', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="gov-domain-audit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gov-audit-L0"]').text()).toContain('通过')
    expect(wrapper.find('[data-testid="gov-audit-L0"]').text()).toContain('AC 可判定 7 条')
    expect(wrapper.text()).toContain('1 轮')
    // 运行按钮 → runDomainAudit → 台账重读
    await wrapper.find('[data-testid="gov-audit-run"]').trigger('click')
    await flushPromises()
    const { runDomainAudit } = await import('@/custom/governance/api/governance')
    expect(runDomainAudit).toHaveBeenCalled()
  })

  it('i18n zh/en 键集合一致', () => {
    const zhKeys = Object.keys(governanceMessages.zh.governance).sort()
    const enKeys = Object.keys(governanceMessages.en.governance).sort()
    expect(enKeys).toEqual(zhKeys)
    expect(zhKeys.length).toBeGreaterThanOrEqual(20)
  })
})
