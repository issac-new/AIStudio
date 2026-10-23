// @vitest-environment jsdom
// 「改进实验」面板守门：八面/提案/门禁/经验库渲染，错误降级，动作触发。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))

const api = vi.hoisted(() => ({
  fetchWorkbenchOverview: vi.fn(),
  startAutoProbe: vi.fn(),
  createWorkbenchProposal: vi.fn(),
  attachWorkbenchBaseline: vi.fn(),
  submitWorkbenchProposal: vi.fn(),
  decideWorkbenchProposal: vi.fn(),
  createWorkbenchProbes: vi.fn(),
  recordWorkbenchProbe: vi.fn(),
  composeWorkbenchProposal: vi.fn(),
  promoteWorkbenchProposal: vi.fn(),
  rollbackWorkbenchProposal: vi.fn(),
  importWorkbenchExperiences: vi.fn(),
  addWorkbenchExperience: vi.fn(),
  setWorkbenchExperienceStatus: vi.fn(),
  calibrateWorkbenchNoise: vi.fn(),
  suggestWorkbenchProposal: vi.fn(),
}))

vi.mock('@/custom/governance/api/workbench', () => api)

import HarnessImprovePanel from '../views/gov/HarnessImprovePanel.vue'

const surface = (key: string, nameZh: string, managed = false) => ({
  key, nameZh, nameEn: key,
  source: { components: ['c1'], context: 'always_on', opencode: `${key}.md`, codex: 'AGENTS.md' },
  applyMode: managed ? 'managed' : 'advisory', risk: managed ? 'medium' : 'high',
  editable: managed, available: true,
  artifacts: { count: 2, samples: [`${key}/a.md`] },
  revision: '0123456789abcdef', writableRoots: managed ? [key] : null,
  expected: `${key}/expected`, managedBy: 'test', note: '',
})

const overview = {
  ok: true,
  surfaces: [
    surface('system_prompt', '系统提示词', true),
    surface('guardrails', '护栏'),
    surface('memory', '记忆'),
    surface('tool_guidance', '工具指导'),
    surface('subagents', '子智能体'),
    surface('skills', 'Skills', true),
    surface('scripts', '脚本'),
    surface('plugins', '插件'),
  ],
  counts: { surfaces: 8, managedSurfaces: 2, proposals: 1, openProposals: 1, recordedProbes: 2, champions: 0, experiences: 1, adoptedExperiences: 0 },
  budget: { observedUsd: 2, capUsd: 5, proposalsWithBudget: 1 },
  proposals: [{
    id: 'hw-001', title: '收紧提示词', hypothesis: '减少返工', surfaceKey: 'system_prompt',
    targetPath: 'profiles/p1/SOUL.md', risk: 'medium', mode: 'parallel', status: 'probing', domain: 'legal',
    budgetCapUsd: 5, evidenceRefs: ['task:t1'], experienceIds: [], baselineRunId: 'run-base', baseline: null,
    base: { content: 'old', digest: 'd', revision: null, exists: true },
    variants: [
      {
        id: 'v1', label: '候选 A', content: 'A', digest: 'a', diffSummary: { added: 4, removed: 1, unchanged: 2 },
        files: [
          { path: 'profiles/p1/SOUL.md', content: 'A', digest: 'd1' },
          { path: 'skills/new_skill/SKILL.md', content: 'B', digest: 'd2' },
        ],
        deletions: ['scripts/old.py'],
      },
      { id: 'v2', label: '候选 B', content: 'B', digest: 'b', diffSummary: { added: 3, removed: 2, unchanged: 1 } },
    ],
    probes: [
      {
        id: 'pr-1', variantId: 'v1', status: 'recorded',
        autoRun: { status: 'done', setId: '探测集', tasksTotal: 5, tasksDone: 5, costUsd: 1.2, estimatedTasks: 1, startedAt: 'now', finishedAt: 'now' },
        evidence: { evalRunId: 'run-p', setId: 's', k: 2, passAt1: 0.8, passAtK: 0.8, resultPassRate: 0.8, trajectoryPassRate: 0.7, unknownRatio: 0, riskVeto: false, judgeOnline: true, statisticallyInsufficient: false, tokens: 1200, costUsd: 1, steps: 10, latencyMs: 900, regression: { runId: 'r', suiteName: '回归样本库', total: 2, failed: 0, failedTaskIds: [], passAt1: 1 } }, contrast: { quality: 'improved', reasons: [], passAt1Delta: 0.3, passAtKDelta: 0.3, resultPassRateDelta: 0.3, trajectoryPassRateDelta: 0.1, unknownRatioDelta: 0, tokenDeltaPct: 0.2, costDeltaPct: 0, stepDeltaPct: 0, latencyDeltaPct: -0.1, regressionFailed: 0 } },
      { id: 'pr-2', variantId: 'v2', status: 'planned' },
    ],
    approval: { decision: 'approved', actor: 'reviewer', note: '', variantSetDigest: 'x', at: 'now', approvalLogId: 'al-1' },
    composition: null, promotion: null, rollback: null, createdBy: 'op', createdAt: 'now', updatedAt: 'now',
    derived: {
      gate: { ok: false, blockers: [{ code: 'regression_missing', message: '未绑定历史回归运行' }], warnings: [] },
      cost: { total: 2, complete: false, missing: ['pr-2'] },
      recordedProbes: 1, totalProbes: 2, selectedVariantId: null, selectedContrast: null,
      diversity: { n: 2, nDistinct: 2, meanLineJaccard: 0.25 },
      regularization: {
        round: 1, horizon: 20, editBudget: 4, maxEditCount: 3, editBudgetExceeded: false,
        noiseDelta: null, noiseRuns: 0, stalled: true, stallWindow: 3, firstOnSurface: false,
        hypothesisRetry: [{ proposalId: 'hw-000', title: '旧提案', status: 'rejected', similarity: 0.72 }],
      },
    },
  }],
  evolution: {
    config: { horizon: 20, bMin: 1, bMax: 4, stallWindow: 3, pruneN: 4, beta0: 0.1, beta1PerPoint: 0.25, requireNoise: false },
    surfaces: [{
      surfaceKey: 'system_prompt', rounds: 2, proposalsTotal: 4, promoted: 2, rejected: 1, rolledBack: 0, open: 1,
      failedProbes: 0, stalled: true, pruneSuggested: false,
      timeline: [
        { round: 1, proposalId: 'hw-000', variantLabel: 'A', promotedAt: '2026-10-01T00:00:00Z', rolledBack: false, passAt1: 0.6, tokens: 1000, costUsd: 1, noiseDelta: 0.02, passAt1Delta: 0.1 },
        { round: 2, proposalId: 'hw-001', variantLabel: 'B', promotedAt: '2026-10-02T00:00:00Z', rolledBack: false, passAt1: 0.7, tokens: 1100, costUsd: 1.1, noiseDelta: 0.02, passAt1Delta: 0.1 },
      ],
    }],
    unexercised: ['memory', 'plugins'],
  },
  champions: [],
  experiences: [{
    id: 'exp-001', surfaceKey: null, statement: '先复现再改代码', evidenceRefs: ['exp-1', 'task:t1'],
    confidence: 'medium', status: 'candidate', createdAt: 'now', updatedAt: 'now',
  }],
  meta: { note: 'n', source: 's', boundary: '可直接写盘仅系统提示词与 Skills，且需 HARNESS2_APPLY=1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchWorkbenchOverview.mockResolvedValue(overview)
  api.importWorkbenchExperiences.mockResolvedValue({ ok: true, imported: 1, skipped: 0 })
  api.startAutoProbe.mockResolvedValue({ ok: true, job: { proposalId: 'hw-001', status: 'running', variantsTotal: 1, variantsDone: 0, costUsd: 0, estimatedTasks: 0 } })
})

describe('HarnessImprovePanel', () => {
  it('渲染八面、提案候选、门禁阻塞与经验库', async () => {
    const w = mount(HarnessImprovePanel, )
    await flushPromises()
    expect(w.find('[data-testid="hi-summary"]').exists()).toBe(true)
    expect(w.find('[data-testid="hi-surface-system_prompt"]').text()).toContain('系统提示词')
    expect(w.find('[data-testid="hi-proposal-hw-001"]').text()).toContain('收紧提示词')
    expect(w.find('[data-testid="hi-gate-hw-001"]').text()).toContain('regression_missing')
    expect(w.find('[data-testid="hi-experiences"]').text()).toContain('先复现再改代码')
    expect(w.text()).toContain('HARNESS2_APPLY=1')
    expect(w.find('[data-testid="hi-proposal-hw-001"]').text()).toContain('提升')
    expect(w.find('[data-testid="hi-proposal-hw-001"]').text()).toContain('profiles/p1/SOUL.md')
    expect(w.find('[data-testid="hi-proposal-hw-001"]').text()).toContain('skills/new_skill/SKILL.md')
    w.unmount()
  })

  it('加载失败如实显示错误，不渲染空数据卡片', async () => {
    api.fetchWorkbenchOverview.mockRejectedValueOnce(new Error('boom'))
    const w = mount(HarnessImprovePanel, )
    await flushPromises()
    expect(w.find('[data-testid="hi-error"]').text()).toContain('boom')
    expect(w.find('[data-testid="hi-summary"]').exists()).toBe(false)
    w.unmount()
  })

  it('导入经验候选会调用端点并刷新', async () => {
    const w = mount(HarnessImprovePanel, )
    await flushPromises()
    await w.find('[data-testid="hi-exp-import"]').trigger('click')
    await flushPromises()
    expect(api.importWorkbenchExperiences).toHaveBeenCalledTimes(1)
    expect(api.fetchWorkbenchOverview).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('新建入口展开表单', async () => {
    const w = mount(HarnessImprovePanel, )
    await flushPromises()
    expect(w.find('[data-testid="hi-create"]').exists()).toBe(false)
    await w.find('[data-testid="hi-create-toggle"]').trigger('click')
    expect(w.find('[data-testid="hi-create"]').exists()).toBe(true)
    w.unmount()
  })

  it('一键自动探测：按钮触发端点并展示任务态', async () => {
    const w = mount(HarnessImprovePanel, )
    await flushPromises()
    expect(w.find('[data-testid="hi-auto-hw-001"]').exists()).toBe(true)
    expect(w.find('[data-testid="hi-auto-state-pr-1"]').text()).toContain('完成')
    expect(w.find('[data-testid="hi-auto-state-pr-1"]').text()).toContain('5/5')
    expect(w.find('[data-testid="hi-auto-state-pr-1"]').text()).toContain('估值记账')
    await w.find('[data-testid="hi-auto-set-hw-001"]').setValue('探测集')
    await w.find('[data-testid="hi-auto-run-hw-001"]').trigger('click')
    await flushPromises()
    expect(api.startAutoProbe).toHaveBeenCalledWith('hw-001', expect.objectContaining({ setId: '探测集', maxTasks: 5 }))
    w.unmount()
  })

  it('RRSI 进化与正则化区：曲线/去向/正则化表/未探索面；提案卡带正则化读数与失败假设警示', async () => {
    const w = mount(HarnessImprovePanel)
    await flushPromises()
    const evo = w.find('[data-testid="hi-evolution"]')
    expect(evo.exists()).toBe(true)
    expect(w.find('[data-testid="hi-evo-curve-system_prompt"]').exists()).toBe(true)
    expect(w.findAll('[data-testid="hi-evo-curve-system_prompt"] circle').length).toBe(2)
    expect(w.find('[data-testid="hi-evo-curve-system_prompt"] path').attributes('d')).toMatch(/^M/)
    expect(w.find('[data-testid="hi-evo-outcome-system_prompt"]').text()).toContain('被采纳 2')
    expect(w.find('[data-testid="hi-reg-row-system_prompt"]').text()).toContain('系统提示词')
    expect(w.find('[data-testid="hi-evo-unexercised"]').text()).toContain('记忆')
    expect(w.find('[data-testid="hi-evo-unexercised"]').text()).toContain('插件')
    const strip = w.find('[data-testid="hi-reg-hw-001"]')
    expect(strip.text()).toContain('1/20')
    expect(strip.text()).toContain('未标定')
    expect(strip.text()).toContain('搜索停滞')
    expect(w.find('[data-testid="hi-hypothesis-retry-hw-001"]').text()).toContain('hw-000')
    w.unmount()
  })

  it('噪声标定：输入运行 ID 并点击触发端点（逗号/换行分隔）', async () => {
    api.calibrateWorkbenchNoise.mockResolvedValue({ ok: true, proposal: overview.proposals[0] })
    const w = mount(HarnessImprovePanel)
    await flushPromises()
    const row = w.find('[data-testid="hi-noise-hw-001"]')
    expect(row.exists()).toBe(true)
    await row.find('textarea').setValue('run-a, run-b\nrun-c')
    await row.find('button').trigger('click')
    await flushPromises()
    expect(api.calibrateWorkbenchNoise).toHaveBeenCalledWith('hw-001', ['run-a', 'run-b', 'run-c'])
    w.unmount()
  })

  it('旧载荷（无 evolution/regularization）不渲染新区块也不报错', async () => {
    const legacy = { ...overview, evolution: undefined, proposals: [{ ...overview.proposals[0], derived: { ...overview.proposals[0].derived, regularization: undefined } }] }
    api.fetchWorkbenchOverview.mockResolvedValueOnce(legacy)
    const w = mount(HarnessImprovePanel)
    await flushPromises()
    expect(w.find('[data-testid="hi-evolution"]').exists()).toBe(false)
    expect(w.find('[data-testid="hi-reg-hw-001"]').exists()).toBe(false)
    expect(w.find('[data-testid="hi-proposal-hw-001"]').exists()).toBe(true)
    w.unmount()
  })

  it('AI 起草行渲染并触发端点（面+目标文件透传）', async () => {
    api.suggestWorkbenchProposal.mockResolvedValue({ ok: true, proposal: overview.proposals[0] })
    const w = mount(HarnessImprovePanel)
    await flushPromises()
    const row = w.find('[data-testid="hi-suggest"]')
    expect(row.exists()).toBe(true)
    await w.find('[data-testid="hi-suggest-target"]').setValue('profiles/orchestrator/SOUL.md')
    await w.find('[data-testid="hi-suggest-run"]').trigger('click')
    await flushPromises()
    expect(api.suggestWorkbenchProposal).toHaveBeenCalledWith(expect.objectContaining({
      surfaceKey: 'system_prompt', targetPath: 'profiles/orchestrator/SOUL.md',
    }))
    w.unmount()
  })

  it('选中候选带回归证据时显示 evolve vs held-out 并排读数', async () => {
    const now = 'now'
    const withSelection = {
      ...overview,
      proposals: [{
        ...overview.proposals[0],
        composition: { variantId: 'v1', digest: 'a', rationale: 'r', actor: 'x', at: now },
        derived: { ...overview.proposals[0].derived, selectedVariantId: 'v1' },
      }],
    }
    api.fetchWorkbenchOverview.mockResolvedValueOnce(withSelection)
    const w = mount(HarnessImprovePanel)
    await flushPromises()
    const row = w.find('[data-testid="hi-heldout-compare"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('进化集通过率')
    expect(row.text()).toContain('回归集')
    expect(row.text()).toContain('80.0%')
    w.unmount()
  })

  it('树候选开关：展开文件清单并可加文件行', async () => {
    const w = mount(HarnessImprovePanel, )
    await flushPromises()
    await w.find('[data-testid="hi-create-toggle"]').trigger('click')
    expect(w.find('[data-testid="hi-create-treeform-0"]').exists()).toBe(false)
    await w.find('[data-testid="hi-create-tree-0"]').setValue(true)
    expect(w.find('[data-testid="hi-create-treeform-0"]').exists()).toBe(true)
    expect(w.find('[data-testid="hi-create-file-path-0-0"]').exists()).toBe(true)
    const rows = w.findAll('.hi__fileRow').length
    await w.find('[data-testid="hi-create-treeform-0"] > button').trigger('click')
    expect(w.findAll('.hi__fileRow').length).toBe(rows + 1)
    w.unmount()
  })
})
