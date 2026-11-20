// @vitest-environment jsdom
// overlay/custom/client/governance/__tests__/org-workbench-sections.test.ts
// 组织工作台三 Section 守门（批三 T6，spec 2026-11-21-ai-native-orgworkbench-batch3 §六）：
//   DecisionAgendaSection——逐源折叠组/失败≠空态分文案/age 巨值「时刻未知」/
//     sourceRef 指引回原权威域/零写面；
//   OutcomeTeamSection——输入根任务或 outcomeId 解析/draft-null 两态分文案/owner
//     确认走 PUT（changeReason 必填＋expectedVersion 当前版本）/409 冲突提示刷新重试/
//     高风险警示色；
//   ContributionReviewSection——六面渲染（第六面暂未接通如实标注）/签署表单校验/
//     person 自评前端拦截＋服务端 422 兜底/无总分排名 UI。
// api 层 mock 用 importActual 展开保留真 OrgWorkbenchDisabledError/ApiError 类身份
// （组件 instanceof 判定依赖同一类——outcome-section.test.ts 同范式）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  fetchAgenda: vi.fn(),
  resolveOutcomeFace: vi.fn(),
  confirmOutcomeTeam: vi.fn(),
  fetchContribution: vi.fn(),
  submitContributionReview: vi.fn(),
}))
vi.mock('@/custom/governance/api/org-workbench', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/org-workbench')>()
  return { ...actual, ...apiMocks }
})
const auth = vi.hoisted(() => ({ actor: { value: 'alice' } }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => auth.actor.value }))

import DecisionAgendaSection from '../components/DecisionAgendaSection.vue'
import OutcomeTeamSection from '../components/OutcomeTeamSection.vue'
import ContributionReviewSection from '../components/ContributionReviewSection.vue'
import {
  ApiError, OrgWorkbenchDisabledError,
  type AgendaResult, type OutcomeTeamFace, type OutcomeTeam, type ContributionRead,
} from '../api/org-workbench'

// ── fixtures ──

function makeAgenda(over: Partial<AgendaResult['sources']> = {}): AgendaResult {
  return {
    generatedAt: 1_760_000_000_000,
    sources: {
      approvals: {
        available: true, itemCount: 1,
        items: [{
          agendaId: 'dual_sign_pending:ap-1', outcomeId: 'oc-1', kind: 'dual_sign_pending',
          question: '双签待决：「上线工单系统」需合同 owner 与 verifier 两笔批准',
          owner: 'alice', evidenceRefs: ['ap-1'], riskTier: 'high', age: 2.5,
          sourceRef: 'approval-inbox:ap-1',
        }],
      },
      outcome_contracts: { available: true, itemCount: 0, items: [] },
      premises: { available: false, itemCount: 0, error: 'premiselog 读取失败（磁盘 IO 错误）' },
      review_cases: { available: true, itemCount: 0, items: [] },
      escalations: { available: true, itemCount: 0, items: [] },
      exp_candidates: {
        available: true, itemCount: 1,
        items: [{
          // mx createdAt=0 会算出约 2 万天——显示层不得渲染巨数
          agendaId: 'learning_candidate:exp-9', kind: 'learning_candidate',
          question: '学习候选待审核（rule）：「先查缓存再落库」',
          evidenceRefs: ['exp-9'], age: 20871.3, sourceRef: 'expcandidates:exp-9',
        }],
      },
      outcome_teams: { available: true, itemCount: 0, items: [] },
      ...over,
    },
  }
}

function makeTeam(over: Partial<OutcomeTeam> = {}): OutcomeTeam {
  return {
    outcomeId: 'oc-1', version: 2, status: 'draft', changeReason: '初版候选', updatedBy: 'system', updatedAt: 3,
    members: [
      { subjectKind: 'person', subjectId: 'alice', role: 'accountable', responsibility: '对结果负责并签署结算' },
      { subjectKind: 'agent', subjectId: 'bot-agent', role: 'executor', responsibility: '执行对账脚本并记录证据' },
    ],
    ...over,
  }
}

function makeFace(team: OutcomeTeam | null = makeTeam(), over: Partial<OutcomeTeamFace> = {}): OutcomeTeamFace {
  return {
    contract: {
      outcomeId: 'oc-1', rootTaskId: 'root-1', version: 3, title: '支付对账周期压到 6 小时',
      ownerPersonId: 'alice', verificationOwnerId: 'vera', riskTier: 'medium', status: 'active',
    },
    team, readScope: 'full',
    ...over,
  }
}

function makeContribution(over: Partial<ContributionRead> = {}): ContributionRead {
  return {
    outcomeId: 'oc-1', readScope: 'full',
    measurements: {
      available: true,
      items: [{
        measurementId: 'mea-1', measureId: 'm1', contractVersion: 3, actual: 5.5,
        availability: 'available', observedAt: 1731000200000, recordedBy: 'alice',
      }],
    },
    team: { available: true, item: makeTeam({ status: 'active' }) },
    reviews: {
      available: true,
      items: [{
        id: 'cr-1', outcomeId: 'oc-1', subject: { subjectKind: 'agent', subjectId: 'bot-agent' },
        assessment: 'effective', rationale: '对账脚本按期完成且证据链完整，贡献明确。'.repeat(2),
        evidenceRefs: ['mea-1'], signedBy: 'alice', signedAt: 1731000300000, source: 'human-entry',
      }],
    },
    learning: {
      available: true,
      candidates: [{ id: 'exp-9', type: 'rule', status: 'candidate', outcomeId: 'oc-1' }],
      injections: [{ ids: ['exp-9'], at: 1731000400000 }],
    },
    events: {
      available: true,
      timeline: [{ eventId: 'ev-1', type: 'contract_created', at: 1731000000000, actor: 'alice', contractVersion: 1 }],
    },
    reviewConclusions: { available: false, reason: 'review_linkage_not_built' },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.actor.value = 'alice'
})

// ── DecisionAgendaSection ──

describe('DecisionAgendaSection', () => {
  it('渲染七源折叠组：源名＋计数＋available 徽标；源失败≠空态（分文案）', async () => {
    apiMocks.fetchAgenda.mockResolvedValue(makeAgenda())
    const w = mount(DecisionAgendaSection)
    await flushPromises()
    const sec = w.find('[data-testid="org-agenda-section"]')
    expect(sec.exists()).toBe(true)
    // 七源组齐全
    for (const kind of ['approvals', 'outcome_contracts', 'premises', 'review_cases', 'escalations', 'exp_candidates', 'outcome_teams']) {
      expect(w.find(`[data-testid="org-agenda-src-${kind}"]`).exists(), kind).toBe(true)
    }
    // 失败源：来源不可用＋错误原文（不是「没有待决事项」）
    const fail = w.find('[data-testid="org-agenda-src-premises-fail"]')
    expect(fail.exists()).toBe(true)
    expect(fail.text()).toContain('来源不可用')
    expect(fail.text()).toContain('磁盘 IO 错误')
    expect(fail.text()).not.toContain('没有待决事项')
    // 空源：没有待决事项（不是失败文案）
    const empty = w.find('[data-testid="org-agenda-src-outcome_contracts-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('没有待决事项')
    expect(empty.text()).not.toContain('来源不可用')
    // 失败源头部计数如实为 0 项＋徽标不可用
    expect(w.find('[data-testid="org-agenda-src-head-premises"]').text()).toContain('来源不可用')
  })

  it('展开源组：条目显示 question/owner/kind/age/证据计数＋sourceRef 指引；高风险警示（非绿）', async () => {
    apiMocks.fetchAgenda.mockResolvedValue(makeAgenda())
    const w = mount(DecisionAgendaSection)
    await flushPromises()
    await w.find('[data-testid="org-agenda-src-head-approvals"]').trigger('click')
    const item = w.find('[data-testid="org-agenda-item-dual_sign_pending:ap-1"]')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('双签待决')
    expect(item.text()).toContain('alice')
    expect(item.text()).toContain('2.5 天')
    expect(item.text()).toContain('证据 1 处')
    expect(item.text()).toContain('approval-inbox:ap-1')
    expect(item.text()).toContain('回原权威域处理')
    // 高风险：警示类（非 success/green 系）
    const risk = item.find('.is-risk-high')
    expect(risk.exists()).toBe(true)
    expect(risk.text()).toContain('高风险')
    expect(risk.classes().some((c) => /success|green|ok/.test(c))).toBe(false)
  })

  it('age 巨值（mx createdAt=0 ≈ 2 万天）显示「时刻未知」，不渲染巨数', async () => {
    apiMocks.fetchAgenda.mockResolvedValue(makeAgenda())
    const w = mount(DecisionAgendaSection)
    await flushPromises()
    await w.find('[data-testid="org-agenda-src-head-exp_candidates"]').trigger('click')
    const item = w.find('[data-testid="org-agenda-item-learning_candidate:exp-9"]')
    expect(item.text()).toContain('时刻未知')
    expect(item.text()).not.toContain('20871')
  })

  it('功能门关（outcome_workbench_disabled）→ 整段不渲染、无报错', async () => {
    apiMocks.fetchAgenda.mockRejectedValue(new OrgWorkbenchDisabledError())
    const w = mount(DecisionAgendaSection)
    await flushPromises()
    expect(w.find('[data-testid="org-agenda-section"]').exists()).toBe(false)
    expect(w.text()).toBe('')
  })

  it('非门类读取失败 → 面板级错误文案（不伪装零数据）', async () => {
    apiMocks.fetchAgenda.mockRejectedValue(new Error('网关超时（504）'))
    const w = mount(DecisionAgendaSection)
    await flushPromises()
    const err = w.find('[data-testid="org-agenda-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('决策议程读取失败')
    expect(err.text()).toContain('504')
  })
})

// ── OutcomeTeamSection ──

describe('OutcomeTeamSection', () => {
  it('输入 outcomeId 解析 → 合同头＋成员表（subjectKind 徽标/role/responsibility）＋draft 态文案', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace())
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    expect(apiMocks.resolveOutcomeFace).toHaveBeenCalledWith('oc-1')
    const sec = w.find('[data-testid="org-team-section"]')
    expect(sec.text()).toContain('支付对账周期压到 6 小时')
    // draft 态文案（≠null 态）
    expect(w.find('[data-testid="org-team-draft"]').text()).toContain('候选团队')
    expect(w.find('[data-testid="org-team-draft"]').text()).toContain('待 owner 确认')
    // 成员表：自然人/Agent 徽标＋角色＋责任
    const person = w.find('[data-testid="org-team-member-alice"]')
    expect(person.text()).toContain('自然人')
    expect(person.text()).toContain('accountable')
    expect(person.text()).toContain('对结果负责并签署结算')
    const agent = w.find('[data-testid="org-team-member-bot-agent"]')
    expect(agent.text()).toContain('Agent')
    expect(agent.text()).toContain('bot-agent')
  })

  it('team=null 与 draft 两态文案区分；解析无果提示未找到', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace(null))
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('root-404')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="org-team-none"]').text()).toContain('尚未建立团队记录')
    apiMocks.resolveOutcomeFace.mockResolvedValue(null)
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="org-team-error"]').text()).toContain('未找到')
  })

  it('确认团队：changeReason 必填前端拦截；提交带 expectedVersion=当前版本＋status=active；成功回显', async () => {
    const draft = makeTeam()
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace(draft))
    apiMocks.confirmOutcomeTeam.mockResolvedValue(makeTeam({ status: 'active', version: 3, changeReason: '确认初版候选' }))
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    // 空理由拦截
    await w.find('[data-testid="org-team-confirm"]').trigger('click')
    expect(w.find('[data-testid="org-team-formerr"]').text()).toContain('变更理由必填')
    expect(apiMocks.confirmOutcomeTeam).not.toHaveBeenCalled()
    // 补理由提交：expectedVersion=draft.version、members 原样、status=active
    await w.find('[data-testid="org-team-reason"]').setValue('候选齐备，确认转 active')
    await w.find('[data-testid="org-team-confirm"]').trigger('click')
    await flushPromises()
    expect(apiMocks.confirmOutcomeTeam).toHaveBeenCalledWith('oc-1', {
      expectedVersion: 2, members: draft.members, status: 'active', changeReason: '候选齐备，确认转 active',
    })
    expect(w.find('[data-testid="org-team-active"]').text()).toContain('已确认团队')
  })

  it('409 version_conflict → 提示刷新重试；刷新重拉 team 面', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace())
    apiMocks.confirmOutcomeTeam.mockRejectedValue(new ApiError('团队确认失败（version_conflict）', 409, 'version_conflict'))
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="org-team-reason"]').setValue('候选齐备，确认转 active')
    await w.find('[data-testid="org-team-confirm"]').trigger('click')
    await flushPromises()
    const conflict = w.find('[data-testid="org-team-conflict"]')
    expect(conflict.exists()).toBe(true)
    expect(conflict.text()).toContain('版本已变化')
    expect(conflict.text()).toContain('刷新后重试')
    // 刷新按钮重拉 face
    apiMocks.resolveOutcomeFace.mockClear()
    await w.find('[data-testid="org-team-refresh"]').trigger('click')
    await flushPromises()
    expect(apiMocks.resolveOutcomeFace).toHaveBeenCalledWith('oc-1')
  })

  it('走查 F2：PUT 422（成员约束校验失败）→ 表单区「确认失败：」文案带上服务端 problems', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace())
    // 错误形态照 api 层 request() 实抛：message 已拼 problems（服务端 422 invalid_input）
    apiMocks.confirmOutcomeTeam.mockRejectedValue(new ApiError(
      '团队约束校验失败：owner 与验证责任人须各有一名对应成员', 422, 'invalid_input',
      ['owner 与验证责任人须各有一名对应成员'],
    ))
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="org-team-reason"]').setValue('候选齐备，确认转 active')
    await w.find('[data-testid="org-team-confirm"]').trigger('click')
    await flushPromises()
    const err = w.find('[data-testid="org-team-formerr"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('确认失败')
    expect(err.text()).toContain('各有一名对应成员')
    expect(w.find('[data-testid="org-team-msg"]').exists()).toBe(false) // 失败不得伪装成功文案
  })

  it('走查 F2 修复面：失败后再次提交成功 → 错误文案清除，成功消息与 active 态回显', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace())
    apiMocks.confirmOutcomeTeam.mockRejectedValueOnce(new ApiError(
      '团队约束校验失败：owner 与验证责任人须各有一名对应成员', 422, 'invalid_input',
      ['owner 与验证责任人须各有一名对应成员'],
    ))
    apiMocks.confirmOutcomeTeam.mockResolvedValueOnce(makeTeam({ status: 'active', version: 3, changeReason: '候选齐备，确认转 active' }))
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="org-team-reason"]').setValue('候选齐备，确认转 active')
    // 第一次提交：422 显错
    await w.find('[data-testid="org-team-confirm"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="org-team-formerr"]').exists()).toBe(true)
    // 第二次提交（成员补齐后）：成功清错＋成功文案＋active 态
    await w.find('[data-testid="org-team-confirm"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="org-team-formerr"]').exists()).toBe(false)
    expect(w.find('[data-testid="org-team-msg"]').text()).toContain('团队已确认')
    expect(w.find('[data-testid="org-team-active"]').text()).toContain('已确认团队')
  })

  it('高风险合同：警示文案与警示色（非绿）', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace(makeTeam(), {
      contract: { ...makeFace().contract, riskTier: 'high' },
    }))
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    const hi = w.find('[data-testid="org-team-highrisk"]')
    expect(hi.exists()).toBe(true)
    expect(hi.text()).toContain('高风险')
    expect(hi.classes().some((c) => /success|green|ok/.test(c))).toBe(false)
  })

  it('非 owner：确认按钮禁用并示因（服务端 403 终裁）；门关整段不渲染', async () => {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace())
    auth.actor.value = 'bob'
    const w = mount(OutcomeTeamSection)
    await flushPromises()
    await w.find('[data-testid="org-team-input"]').setValue('oc-1')
    await w.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    expect((w.find('[data-testid="org-team-confirm"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(w.find('[data-testid="org-team-authz"]').text()).toContain('bob')
    // 门关：首次查询发现 404 outcome_workbench_disabled → 整段隐藏
    apiMocks.resolveOutcomeFace.mockReset()
    apiMocks.resolveOutcomeFace.mockRejectedValue(new OrgWorkbenchDisabledError())
    const w2 = mount(OutcomeTeamSection)
    await flushPromises()
    await w2.find('[data-testid="org-team-input"]').setValue('oc-2')
    await w2.find('[data-testid="org-team-load"]').trigger('click')
    await flushPromises()
    expect(w2.find('[data-testid="org-team-section"]').exists()).toBe(false)
  })
})

// ── ContributionReviewSection ──

describe('ContributionReviewSection', () => {
  async function mountLoaded(over: Partial<ContributionRead> = {}) {
    apiMocks.resolveOutcomeFace.mockResolvedValue(makeFace(null))
    apiMocks.fetchContribution.mockResolvedValue(makeContribution(over))
    const w = mount(ContributionReviewSection)
    await flushPromises()
    await w.find('[data-testid="org-contrib-input"]').setValue('oc-1')
    await w.find('[data-testid="org-contrib-load"]').trigger('click')
    await flushPromises()
    return w
  }

  it('六面渲染：五面事实＋第六面「评审结论暂未接通」如实标注；无总分/排名 UI', async () => {
    const w = await mountLoaded()
    // 测量
    const meas = w.find('[data-testid="org-contrib-measurements"]')
    expect(meas.text()).toContain('m1')
    expect(meas.text()).toContain('5.5')
    // 团队角色
    expect(w.find('[data-testid="org-contrib-team"]').text()).toContain('bot-agent')
    // 人署名评价
    expect(w.find('[data-testid="org-contrib-reviews"]').text()).toContain('bot-agent')
    expect(w.find('[data-testid="org-contrib-reviews"]').text()).toContain('alice')
    // 学习候选与召回留痕
    expect(w.find('[data-testid="org-contrib-learning"]').text()).toContain('exp-9')
    expect(w.find('[data-testid="org-contrib-learning"]').text()).toContain('1 条召回留痕')
    // 事件时间线
    expect(w.find('[data-testid="org-contrib-events"]').text()).toContain('contract_created')
    // 第六面：暂未接通（不伪造）
    const rc = w.find('[data-testid="org-contrib-review-conclusions"]')
    expect(rc.text()).toContain('暂未接通')
    expect(rc.text()).toContain('review_linkage_not_built')
    // 反目标：页面无总分/排名/得分
    const all = w.find('[data-testid="org-contribution-section"]').text()
    expect(all).not.toMatch(/总分|排名|得分/)
  })

  it('逐面 fail-soft：失败面「来源不可用」＋原因；team=null 面显示未成队；reviews 空态', async () => {
    const w = await mountLoaded({
      measurements: { available: false, reason: '测量源读取失败（事件账派生）：ENOENT' },
      team: { available: true, item: null },
      reviews: { available: true, items: [] },
    })
    const meas = w.find('[data-testid="org-contrib-measurements"]')
    expect(meas.text()).toContain('来源不可用')
    expect(meas.text()).toContain('ENOENT')
    expect(w.find('[data-testid="org-contrib-team"]').text()).toContain('未成队')
    expect(w.find('[data-testid="org-contrib-reviews"]').text()).toContain('尚无署名评价')
  })

  it('签署表单：rationale<20 字/空证据前端拦截不发；person 自评拦截（服务端 422 兜底同禁）', async () => {
    apiMocks.submitContributionReview.mockResolvedValue(makeContribution().reviews.items[0]!)
    const w = await mountLoaded()
    await w.find('[data-testid="org-contrib-kind"]').setValue('person')
    await w.find('[data-testid="org-contrib-subject"]').setValue('carol')
    await w.find('[data-testid="org-contrib-assessment"]').setValue('effective')
    await w.find('[data-testid="org-contrib-rationale"]').setValue('太短')
    await w.find('[data-testid="org-contrib-evidence"]').setValue('mea-1')
    await w.find('[data-testid="org-contrib-submit"]').trigger('click')
    expect(w.find('[data-testid="org-contrib-formerr"]').text()).toContain('至少 20 字')
    expect(apiMocks.submitContributionReview).not.toHaveBeenCalled()
    // 理由达标但证据空 → 拦截
    await w.find('[data-testid="org-contrib-rationale"]').setValue('对账脚本按期完成且证据链完整，贡献明确。')
    await w.find('[data-testid="org-contrib-evidence"]').setValue('')
    await w.find('[data-testid="org-contrib-submit"]').trigger('click')
    expect(w.find('[data-testid="org-contrib-formerr"]').text()).toContain('证据引用必填')
    expect(apiMocks.submitContributionReview).not.toHaveBeenCalled()
    // person 自评：被评价人=签署人（alice）→ 前端拦截（先用短理由也会先命中自评）
    await w.find('[data-testid="org-contrib-subject"]').setValue('alice')
    await w.find('[data-testid="org-contrib-evidence"]').setValue('mea-1')
    await w.find('[data-testid="org-contrib-submit"]').trigger('click')
    expect(w.find('[data-testid="org-contrib-formerr"]').text()).toContain('自评')
    expect(apiMocks.submitContributionReview).not.toHaveBeenCalled()
  })

  it('签署成功走 POST 传 subject/assessment/rationale/evidenceRefs；服务端 422 兜底显示', async () => {
    apiMocks.submitContributionReview.mockResolvedValue({
      id: 'cr-2', outcomeId: 'oc-1', subject: { subjectKind: 'agent', subjectId: 'bot-agent' },
      assessment: 'mixed', rationale: 'x'.repeat(20), evidenceRefs: ['mea-1'],
      signedBy: 'alice', signedAt: 1, source: 'human-entry',
    })
    const w = await mountLoaded()
    await w.find('[data-testid="org-contrib-kind"]').setValue('agent')
    await w.find('[data-testid="org-contrib-subject"]').setValue('bot-agent')
    await w.find('[data-testid="org-contrib-assessment"]').setValue('mixed')
    await w.find('[data-testid="org-contrib-rationale"]').setValue('自动化完成主体但两处需人工返工，贡献混合。')
    await w.find('[data-testid="org-contrib-evidence"]').setValue('mea-1\nev-1')
    await w.find('[data-testid="org-contrib-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.submitContributionReview).toHaveBeenCalledWith('oc-1', {
      subjectKind: 'agent', subjectId: 'bot-agent', assessment: 'mixed',
      rationale: '自动化完成主体但两处需人工返工，贡献混合。',
      evidenceRefs: ['mea-1', 'ev-1'],
    })
    // 服务端 422 兜底：换主体评另一 agent 被拒（如 inactive）——表单字段在成功后被
    // 清空，须重填再提交才能到达服务端；错误形态照 api 层 request() 实抛
    // （message 已拼 problems，code 保留机器判据）
    apiMocks.submitContributionReview.mockRejectedValue(
      new ApiError('贡献评价入参非法：subjectId 未在人员名单激活', 422, 'invalid_input', ['subjectId 未在人员名单激活']))
    await w.find('[data-testid="org-contrib-subject"]').setValue('ghost-agent')
    await w.find('[data-testid="org-contrib-rationale"]').setValue('自动化完成主体但两处需人工返工，贡献混合。')
    await w.find('[data-testid="org-contrib-evidence"]').setValue('mea-1\nev-1')
    await w.find('[data-testid="org-contrib-submit"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="org-contrib-formerr"]').text()).toContain('未在人员名单激活')
  })
})
