// @vitest-environment jsdom
// overlay/custom/client/kanban/components/__tests__/outcome-section.test.ts
// 根任务结果面板守门（批一 Task 13）：有合同渲染状态与 measures；unknown 结算
// 缺口文案与强制字段；门关（outcome_workbench_disabled）整段不渲染；非 owner
// 按钮禁用并示因；测量提交前校验；无合同根卡/非根卡渲染边界；API 失败不炸段。
// api 层 mock 用 importActual 展开保留真 OutcomeWorkbenchDisabledError 类
// （组件 instanceof 判定依赖同一类身份——drawer-room-actions.test.ts 同范式）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const apiMocks = vi.hoisted(() => ({
  fetchOutcomeByRoot: vi.fn(),
  fetchOutcomeSnapshots: vi.fn(),
  fetchOutcomeMeasurements: vi.fn(),
  fetchOutcomeSettlement: vi.fn(),
  transitionOutcome: vi.fn(),
  submitMeasurement: vi.fn(),
  settleOutcome: vi.fn(),
  fetchOutcomeComparison: vi.fn(),
  createOutcome: vi.fn(),
}))
vi.mock('@/custom/kanban/api/outcome', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/outcome')>()
  return { ...actual, ...apiMocks }
})
const auth = vi.hoisted(() => ({ actor: { value: 'alice' } }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => auth.actor.value }))

import OutcomeSection from '../OutcomeSection.vue'
import { OutcomeApiError, OutcomeWorkbenchDisabledError, type OutcomeContract } from '../../api/outcome'

function makeContract(over: Partial<OutcomeContract> = {}): OutcomeContract {
  return {
    schemaVersion: 1,
    outcomeId: 'oc-test1',
    rootTaskId: 'root-1',
    version: 2,
    title: '降低工单积压',
    valueStatement: '把积压压到 50 以内',
    ownerPersonId: 'alice',
    verificationOwnerId: 'vera',
    measures: [
      { measureId: 'm1', name: '工单积压量', definition: '未结工单数', unit: '张', operator: 'lte', baseline: 120, target: 50, sourceRef: 'helpdesk/db' },
      { measureId: 'm2', name: '按期结单率', definition: 'on-time %', unit: '%', operator: 'gte', baseline: 70, target: 90, sourceRef: 'helpdesk/report' },
    ],
    acceptance: { statements: ['积压 ≤50'], requiredEvidenceKinds: ['db_query'] },
    scope: { included: ['helpdesk'], excluded: [] },
    riskTier: 'medium',
    defaultReversibility: 'reversible',
    contextPolicy: { allowedScopes: [], excludedSourceKinds: [] },
    learningOptIn: false,
    status: 'draft',
    createdAt: 1731000000000,
    updatedAt: 1731000100000,
    ...over,
  }
}

/** datetime-local 本地时间串（now+1 天，保证晚于签署时刻校验）。 */
function tomorrowLocalInput(): string {
  const d = new Date(Date.now() + 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

async function mountSection(taskId = 'root-1', isRootTask = true) {
  const w = mount(OutcomeSection, { props: { taskId, isRootTask } })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.actor.value = 'alice'
  apiMocks.fetchOutcomeByRoot.mockResolvedValue(null)
  apiMocks.fetchOutcomeComparison.mockResolvedValue(null)
  apiMocks.fetchOutcomeSnapshots.mockResolvedValue([])
  apiMocks.fetchOutcomeMeasurements.mockResolvedValue({
    outcomeId: 'oc-test1', contractVersion: 2, measurements: [], latest: {},
  })
  apiMocks.fetchOutcomeSettlement.mockResolvedValue({
    outcomeId: 'oc-test1', settlement: null, superseded: [],
  })
  apiMocks.transitionOutcome.mockResolvedValue(makeContract({ status: 'active' }))
  apiMocks.createOutcome.mockResolvedValue({ contract: makeContract(), replayed: false })
  apiMocks.submitMeasurement.mockImplementation(async (_id: string, input: { measureId: string; actual: number | null }) => ({
    measurementId: 'mea-x1', outcomeId: 'oc-test1', measureId: input.measureId, contractVersion: 2,
    actual: input.actual, availability: 'available', evidenceRefs: ['evid://1'],
    observedAt: Date.now(), recordedBy: 'alice', recordedAt: Date.now(),
  }))
  apiMocks.settleOutcome.mockImplementation(async (_id: string, input: { verdict: string; gapNote?: string }) => ({
    settlementId: 'set-x1', outcomeId: 'oc-test1', contractVersion: 2, verdict: input.verdict,
    rationale: 'r'.repeat(24), measurementIds: [], gapNote: input.gapNote, signedBy: 'alice', signedAt: Date.now(),
  }))
})

describe('OutcomeSection — 渲染面', () => {
  it('有合同渲染：状态徽标/版本/measures 定义/快照计数/责任分工', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    apiMocks.fetchOutcomeSnapshots.mockResolvedValue([
      { snapshotId: 'snap-1', contractVersion: 2, createdAt: 1, sha256: 'a'.repeat(64) },
      { snapshotId: 'snap-2', contractVersion: 2, createdAt: 2, sha256: 'b'.repeat(64) },
    ])
    const w = await mountSection()
    const sec = w.find('[data-testid="outcome-section"]')
    expect(sec.exists()).toBe(true)
    expect(sec.text()).toContain('草稿')
    expect(sec.text()).toContain('v2')
    expect(w.find('[data-testid="outcome-measure-m1"]').text()).toContain('工单积压量')
    expect(w.find('[data-testid="outcome-measure-m1"]').text()).toContain('120') // baseline
    expect(w.find('[data-testid="outcome-measure-m1"]').text()).toContain('≤50') // operator+target
    expect(w.find('[data-testid="outcome-snapshot-count"]').text()).toContain('2')
    expect(sec.text()).toContain('责任人 alice')
    expect(sec.text()).toContain('验证 vera')
  })

  it('门关（outcome_workbench_disabled）→ 整段不渲染、无报错', async () => {
    apiMocks.fetchOutcomeByRoot.mockRejectedValue(new OutcomeWorkbenchDisabledError())
    const w = await mountSection()
    expect(w.find('[data-testid="outcome-section"]').exists()).toBe(false)
    expect(w.text()).toBe('')
  })

  it('无合同：根卡显示建模入口；非根卡整段不渲染', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(null)
  apiMocks.fetchOutcomeComparison.mockResolvedValue(null)
    const root = await mountSection('root-1', true)
    expect(root.find('[data-testid="outcome-model-hint"]').exists()).toBe(true)
    const child = await mountSection('child-1', false)
    expect(child.find('[data-testid="outcome-section"]').exists()).toBe(false)
  })

  it('非门类 API 失败 → 本段显示不可用，不炸抽屉', async () => {
    apiMocks.fetchOutcomeByRoot.mockRejectedValue(new Error('网关超时（504）'))
    const w = await mountSection()
    expect(w.find('[data-testid="outcome-error"]').text()).toContain('业务结果面板不可用')
    expect(w.find('[data-testid="outcome-error"]').text()).toContain('504')
  })
})

describe('OutcomeSection — 测量/结算读面（Task 15）', () => {
  it('服务端 latest 渲染「最新实际值」（有值/未知/未测三分）；settled 合同渲染结算正身与取代链', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract({ status: 'settled' }))
    apiMocks.fetchOutcomeMeasurements.mockResolvedValue({
      outcomeId: 'oc-test1', contractVersion: 2,
      measurements: [],
      latest: {
        m1: {
          measurementId: 'mea-1', outcomeId: 'oc-test1', measureId: 'm1', contractVersion: 2,
          actual: 45, availability: 'available', evidenceRefs: ['evid://1'],
          observedAt: 1731000200000, recordedBy: 'alice', recordedAt: 1731000200000,
        },
        m2: {
          measurementId: 'mea-2', outcomeId: 'oc-test1', measureId: 'm2', contractVersion: 2,
          actual: null, availability: 'unavailable', evidenceRefs: ['evid://2'],
          observedAt: 1731000200000, recordedBy: 'vera', recordedAt: 1731000200000,
        },
      },
    })
    apiMocks.fetchOutcomeSettlement.mockResolvedValue({
      outcomeId: 'oc-test1',
      settlement: {
        settlementId: 'set-2', outcomeId: 'oc-test1', contractVersion: 2, verdict: 'achieved',
        rationale: '积压压到 45 张低于目标 50，准予结算。', measurementIds: ['mea-1'],
        signedBy: 'alice', signedAt: 1731000300000,
      },
      superseded: [
        { settlementId: 'set-1', reason: 'root_task_reopened', supersededAt: 1731000250000, settlement: null },
      ],
    })
    const w = await mountSection()
    // 三分：m1 有值 45；m2 null=未知；最新口径注脚不再宣称「无读端点」
    expect(w.find('[data-testid="outcome-actual-m1"]').text()).toBe('45')
    expect(w.find('[data-testid="outcome-actual-m2"]').text()).toBe('未知')
    expect(w.find('[data-testid="outcome-actual-hint"]').text()).toContain('当前合同版本口径')
    // 结算正身来自读端点（非会话回显）
    const summary = w.find('[data-testid="outcome-settlement-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('达成')
    expect(summary.text()).toContain('由 alice 于')
    expect(w.find('[data-testid="outcome-settlement-superseded"]').text()).toContain('1 笔已被取代')
  })

  it('读面失败（非门关）→ 降级标注＋表格回退未测（—），不炸段', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    apiMocks.fetchOutcomeMeasurements.mockRejectedValue(new Error('测量读取失败（503）'))
    apiMocks.fetchOutcomeSettlement.mockRejectedValue(new Error('结算读取失败（503）'))
    const w = await mountSection()
    expect(w.find('[data-testid="outcome-section"]').exists()).toBe(true)
    expect(w.find('[data-testid="outcome-actual-m1"]').text()).toBe('—')
    expect(w.find('[data-testid="outcome-actual-hint"]').text()).toContain('读取不可用，仅回显本面板提交')
    expect(w.find('[data-testid="outcome-settlement-summary"]').exists()).toBe(false)
  })
})

describe('OutcomeSection — 权限面', () => {
  it('非 owner/verifier：激活与测量入口禁用并示因', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    auth.actor.value = 'bob'
    const w = await mountSection()
    expect((w.find('[data-testid="outcome-activate"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((w.find('[data-testid="outcome-measure-toggle"]').element as HTMLButtonElement).disabled).toBe(true)
    // M-1 取消入口（不只确认钮）对非 owner 同样禁用，示因已在操作区
    expect((w.find('[data-testid="outcome-cancel-toggle"]').element as HTMLButtonElement).disabled).toBe(true)
    const note = w.find('[data-testid="outcome-authz-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('bob')
  })

  it('verifier 可测量但不得代签结算（observing 合同示因）', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract({ status: 'observing' }))
    auth.actor.value = 'vera'
    const w = await mountSection()
    expect((w.find('[data-testid="outcome-measure-toggle"]').element as HTMLButtonElement).disabled).toBe(false)
    const settleAuthz = w.find('[data-testid="outcome-settle-authz"]')
    expect(settleAuthz.exists()).toBe(true)
    expect(settleAuthz.text()).toContain('不得代签')
    expect(w.find('[data-testid="outcome-settle-submit"]').exists()).toBe(false)
  })
})

describe('OutcomeSection — 测量提交', () => {
  it('校验拦截（实际值/证据缺一不可）→ 不发请求；补齐后按当前版本提交并回显', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    const w = await mountSection()
    await w.find('[data-testid="outcome-measure-toggle"]').trigger('click')
    // 空 actual + 空 evidence → 前端拦截
    await w.find('[data-testid="outcome-measure-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-measure-err"]').text()).toContain('实际值必填')
    expect(apiMocks.submitMeasurement).not.toHaveBeenCalled()
    await w.find('[data-testid="outcome-measure-actual"]').setValue('45')
    await w.find('[data-testid="outcome-measure-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-measure-err"]').text()).toContain('证据引用必填')
    expect(apiMocks.submitMeasurement).not.toHaveBeenCalled()
    // 补齐证据 → 提交（contractVersion=当前 v2，evidenceRefs 按行拆分）
    await w.find('[data-testid="outcome-measure-evidence"]').setValue('evid://run/1\nevid://db/2')
    await w.find('[data-testid="outcome-measure-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.submitMeasurement).toHaveBeenCalledTimes(1)
    expect(apiMocks.submitMeasurement.mock.calls[0]![1]).toMatchObject({
      measureId: 'm1', contractVersion: 2, actual: 45, availability: 'available',
      evidenceRefs: ['evid://run/1', 'evid://db/2'],
    })
    expect(w.find('[data-testid="outcome-actual-m1"]').text()).toBe('45')
    // M-2 连续提交流程：成功后实际值输入清空（防误带旧值），度量选择保留便于批量录入
    expect((w.find('[data-testid="outcome-measure-actual"]').element as HTMLInputElement).value).toBe('')
    expect((w.find('[data-testid="outcome-measure-select"]').element as HTMLSelectElement).value).toBe('m1')
  })
})

describe('OutcomeSection — 结算签署', () => {
  async function mountObserving() {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract({ status: 'observing' }))
    const w = await mountSection()
    return w
  }

  it('空表单提交 → verdict/rationale 前端提示；rationale<20 字拒发', async () => {
    const w = await mountObserving()
    await w.find('[data-testid="outcome-settle-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-settle-err"]').text()).toContain('请选择裁决')
    expect(apiMocks.settleOutcome).not.toHaveBeenCalled()
    await w.find('[data-testid="outcome-settle-verdict"]').setValue('achieved')
    await w.find('[data-testid="outcome-settle-rationale"]').setValue('太短')
    await w.find('[data-testid="outcome-settle-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-settle-err"]').text()).toContain('至少 20 字')
    expect(apiMocks.settleOutcome).not.toHaveBeenCalled()
  })

  it('unknown：gapNote/nextReviewAt 强制字段出现且缺失拦截', async () => {
    const w = await mountObserving()
    await w.find('[data-testid="outcome-settle-verdict"]').setValue('unknown')
    expect(w.find('[data-testid="outcome-settle-gapnote"]').exists()).toBe(true)
    expect(w.find('[data-testid="outcome-settle-nextreview"]').exists()).toBe(true)
    await w.find('[data-testid="outcome-settle-rationale"]').setValue('积压达标但按期结单率数据源断供，先挂账复审')
    await w.find('[data-testid="outcome-settle-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-settle-err"]').text()).toContain('gapNote')
    expect(apiMocks.settleOutcome).not.toHaveBeenCalled()
    // 只补 gapNote 不填复审时间 → 仍拦截
    await w.find('[data-testid="outcome-settle-gapnote"]').setValue('按期结单率数据源不可用，缺一个口径')
    await w.find('[data-testid="outcome-settle-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-settle-err"]').text()).toContain('下次复审')
    expect(apiMocks.settleOutcome).not.toHaveBeenCalled()
  })

  it('unknown 结算成功 → 结算摘要显示缺口文案与复审安排', async () => {
    const w = await mountObserving()
    await w.find('[data-testid="outcome-settle-verdict"]').setValue('unknown')
    await w.find('[data-testid="outcome-settle-rationale"]').setValue('积压达标但按期结单率数据源断供，先挂账复审')
    await w.find('[data-testid="outcome-settle-gapnote"]').setValue('按期结单率数据源不可用，缺一个口径')
    await w.find('[data-testid="outcome-settle-nextreview"]').setValue(tomorrowLocalInput())
    await w.find('[data-testid="outcome-settle-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.settleOutcome).toHaveBeenCalledTimes(1)
    const arg = apiMocks.settleOutcome.mock.calls[0]![1]
    expect(arg.verdict).toBe('unknown')
    expect(arg.gapNote).toContain('按期结单率')
    expect(arg.nextReviewAt).toBeGreaterThan(Date.now())
    const summary = w.find('[data-testid="outcome-settlement-summary"]')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('无法判定')
    const gap = w.find('[data-testid="outcome-settlement-gap"]')
    expect(gap.exists()).toBe(true)
    expect(gap.text()).toContain('证据缺口：按期结单率数据源不可用')
    expect(gap.text()).toContain('下次复审')
  })

  it('结算引用集＝本会话 ∪ 服务端在账最新（终审 I-2：刷新后 session 空，不空引用提交）', async () => {
    // 服务端已有 m1 在账最新（本会话零提交）——doSettle 须并入 mea-1，不得空数组
    apiMocks.fetchOutcomeMeasurements.mockResolvedValue({
      outcomeId: 'oc-test1', contractVersion: 2,
      measurements: [],
      latest: {
        m1: {
          measurementId: 'mea-1', outcomeId: 'oc-test1', measureId: 'm1', contractVersion: 2,
          actual: 45, availability: 'available', evidenceRefs: ['evid://1'],
          observedAt: 1731000200000, recordedBy: 'alice', recordedAt: 1731000200000,
        },
      },
    })
    const w = await mountObserving()
    await w.find('[data-testid="outcome-settle-verdict"]').setValue('achieved')
    await w.find('[data-testid="outcome-settle-rationale"]').setValue('积压压到 45 张低于目标 50，准予结算。')
    await w.find('[data-testid="outcome-settle-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.settleOutcome).toHaveBeenCalledTimes(1)
    const arg = apiMocks.settleOutcome.mock.calls[0]![1]
    expect(arg.measurementIds).toContain('mea-1')
    expect(arg.measurementIds.length).toBeGreaterThan(0)
  })
})

describe('OutcomeSection — 状态迁移', () => {
  it('draft 合同：owner 激活走 transitions 端点；取消缺理由前端拦截', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    apiMocks.transitionOutcome.mockResolvedValue(makeContract({ status: 'active' }))
    const w = await mountSection()
    const activate = w.find('[data-testid="outcome-activate"]')
    expect((activate.element as HTMLButtonElement).disabled).toBe(false)
    // owner 取消入口可用（M-1 只收紧非 owner）
    expect((w.find('[data-testid="outcome-cancel-toggle"]').element as HTMLButtonElement).disabled).toBe(false)
    await activate.trigger('click')
    await flushPromises()
    expect(apiMocks.transitionOutcome).toHaveBeenCalledWith('oc-test1', { to: 'active' })
    expect(w.find('[data-testid="outcome-action-msg"]').text()).toContain('已激活')
    // 取消：缺理由拦截
    await w.find('[data-testid="outcome-cancel-toggle"]').trigger('click')
    await w.find('[data-testid="outcome-cancel-confirm"]').trigger('click')
    expect(w.text()).toContain('取消必须填写理由')
    await w.find('[data-testid="outcome-cancel-reason"]').setValue('需求方向调整，不再追求该结果')
    await w.find('[data-testid="outcome-cancel-confirm"]').trigger('click')
    await flushPromises()
    expect(apiMocks.transitionOutcome).toHaveBeenCalledWith('oc-test1', { to: 'cancelled', reason: '需求方向调整，不再追求该结果' })
  })

  it('active 合同：进入观察按钮带终态门槛提示文案', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract({ status: 'active' }))
    const w = await mountSection()
    const observe = w.find('[data-testid="outcome-observe"]')
    expect(observe.exists()).toBe(true)
    expect(observe.attributes('title')).toContain('全部同 outcome 子任务')
    expect(w.text()).toContain('观察门槛')
  })

  it('服务端 422 拒绝（tasks_unfinished）→ 面板如实显示 problems，不炸', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract({ status: 'active' }))
    apiMocks.transitionOutcome.mockRejectedValue(
      new Error('状态迁移被拒：根任务及全部同 outcome 子任务未全部终结，不得进入 observing'))
    const w = await mountSection()
    await w.find('[data-testid="outcome-observe"]').trigger('click')
    await flushPromises()
    const msg = w.find('[data-testid="outcome-action-msg"]')
    expect(msg.exists()).toBe(true)
    expect(msg.text()).toContain('未全部终结')
  })

  it('激活 422 code=schema_missing（批四 F3）→ 按码定向文案（缺列修库指引），非原文回显', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    apiMocks.transitionOutcome.mockRejectedValue(new OutcomeApiError(
      422, '激活失败（schema_missing）：看板库缺 outcome_id 列（805 迁移面未覆盖该库）',
      'schema_missing', ['看板库缺 outcome_id 列（805 迁移面未覆盖该库）']))
    const w = await mountSection()
    await w.find('[data-testid="outcome-activate"]').trigger('click')
    await flushPromises()
    const msg = w.find('[data-testid="outcome-action-msg"]')
    expect(msg.exists()).toBe(true)
    expect(msg.text()).toContain('看板库缺 outcome_id 列')
    expect(msg.text()).toContain('python CLI')
    expect(msg.text()).toContain('手工补列后重试')
  })
})


// ---- 批二 T6：同口径对照行（只读投影） ----
describe('OutcomeSection — 对照投影渲染', () => {
  it('settled＋对照返回 → effect 徽标＋缺口说明＋行读数；comparison 缺席 → 不渲染', async () => {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract({ status: 'settled' }))
    apiMocks.fetchOutcomeComparison.mockResolvedValue({
      evaluationOutcomeId: 'oc-test1', baselineOutcomeId: null, effect: 'unknown',
      gapNote: '不足两个同口径已结算结果，效果恒未知',
      rows: [{ measureId: 'm1', name: '工单积压量', definition: 'd', target: 50, operator: 'lte',
        baseline: null, evaluation: { outcomeId: 'oc-test1', actual: 45, availability: 'available' } }],
    })
    let w = await mountSection()
    expect(w.find('[data-testid="outcome-comparison"]').exists()).toBe(true)
    expect(w.find('[data-testid="outcome-comparison-effect"]').text()).toContain('效果未知')
    expect(w.find('[data-testid="outcome-comparison"]').text()).toContain('不足两个同口径')
    expect(w.find('[data-testid="outcome-comparison-eval"]').text()).toBe('45')
    // 缺席（无对照）
    apiMocks.fetchOutcomeComparison.mockResolvedValue(null)
    w = await mountSection()
    expect(w.find('[data-testid="outcome-comparison"]').exists()).toBe(false)
  })
})


// ---- 批四 T1：建模表单（空态根卡「建合同」，POST / 接线） ----
describe('OutcomeSection — 建模表单（批四 T1）', () => {
  /** 空态根卡挂载（无合同）；taskTitle 可选预填卡标题。 */
  async function mountEmptyRoot(taskTitle?: string) {
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(null)
    const w = mount(OutcomeSection, {
      props: { taskId: 'root-1', isRootTask: true, ...(taskTitle !== undefined ? { taskTitle } : {}) },
    })
    await flushPromises()
    return w
  }

  async function openForm(w: Awaited<ReturnType<typeof mountEmptyRoot>>) {
    await w.find('[data-testid="outcome-create-toggle"]').trigger('click')
    return w
  }

  /** 填必填集（title 依赖预填/已填）；statements 传空串=走度量/陈述联合校验。 */
  async function fillRequired(w: Awaited<ReturnType<typeof mountEmptyRoot>>, statements: string) {
    await w.find('[data-testid="outcome-create-value"]').setValue('把工单积压压到 50 以内，释放人力')
    await w.find('[data-testid="outcome-create-verifier"]').setValue('vera')
    await w.find('[data-testid="outcome-create-risktier"]').setValue('medium')
    await w.find('[data-testid="outcome-create-reversibility"]').setValue('reversible')
    await w.find('[data-testid="outcome-create-statements"]').setValue(statements)
  }

  it('空态根卡：折叠表单默认收起；打开后 title=卡标题、owner=当前登录人预填（可改），rootTaskId 不暴露输入', async () => {
    const w = await mountEmptyRoot('降低工单积压')
    expect(w.find('[data-testid="outcome-model-hint"]').exists()).toBe(true)
    expect(w.find('[data-testid="outcome-create-form"]').exists()).toBe(false)
    await openForm(w)
    const form = w.find('[data-testid="outcome-create-form"]')
    expect(form.exists()).toBe(true)
    expect((w.find('[data-testid="outcome-create-title"]').element as HTMLInputElement).value).toBe('降低工单积压')
    expect((w.find('[data-testid="outcome-create-owner"]').element as HTMLInputElement).value).toBe('alice')
    // rootTaskId 自动携带：表单内不出现 rootTaskId 输入控件
    expect(w.find('[data-testid="outcome-create-roottaskid"]').exists()).toBe(false)
    expect(w.find('[data-testid="outcome-create-submit"]').exists()).toBe(true)
  })

  it('必填非空提示：空表单提交不发请求，缺项逐名列出；度量与陈述同空拦截', async () => {
    const w = await openForm(await mountEmptyRoot()) // 无 taskTitle → title 空
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    const err = w.find('[data-testid="outcome-create-err"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('必填未填')
    expect(err.text()).toContain('标题')
    expect(err.text()).toContain('验证责任人')
    expect(err.text()).toContain('风险档')
    expect(err.text()).toContain('默认可逆性')
    expect(err.text()).toContain('至少填一项')
    expect(apiMocks.createOutcome).not.toHaveBeenCalled()
    // 非空级联合规则：只填必填、无度量无陈述 → 仍拦截（服务端 measures/statements 同源规则）
    await w.find('[data-testid="outcome-create-title"]').setValue('降低工单积压')
    await fillRequired(w, '')
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-create-err"]').text()).toContain('至少填一项')
    expect(apiMocks.createOutcome).not.toHaveBeenCalled()
  })

  it('度量行增删：半行提交拦截行内缺项；补齐后度量口径随载荷（baseline 留空=null）', async () => {
    const w = await openForm(await mountEmptyRoot('降低工单积压'))
    await fillRequired(w, '') // 走纯定量合同：不加陈述
    await w.find('[data-testid="outcome-create-measure-add"]').trigger('click')
    expect(w.find('[data-testid="outcome-create-measure-0"]').exists()).toBe(true)
    expect((w.find('[data-testid="outcome-create-measure-measureid"]').element as HTMLInputElement).value).toBe('m1')
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    expect(w.find('[data-testid="outcome-create-err"]').text()).toContain('度量1')
    expect(w.find('[data-testid="outcome-create-err"]').text()).toContain('口径定义')
    expect(apiMocks.createOutcome).not.toHaveBeenCalled()
    // 补齐行内字段（measureId 已预填 m1、operator 默认 gte）
    await w.find('[data-testid="outcome-create-measure-name"]').setValue('工单积压量')
    await w.find('[data-testid="outcome-create-measure-unit"]').setValue('张')
    await w.find('[data-testid="outcome-create-measure-target"]').setValue('50')
    await w.find('[data-testid="outcome-create-measure-definition"]').setValue('未结工单数')
    await w.find('[data-testid="outcome-create-measure-sourceref"]').setValue('helpdesk/db')
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createOutcome).toHaveBeenCalledTimes(1)
    const payload = apiMocks.createOutcome.mock.calls[0]![0]
    expect(payload.measures).toEqual([{
      measureId: 'm1', name: '工单积压量', unit: '张', operator: 'gte',
      target: 50, baseline: null, definition: '未结工单数', sourceRef: 'helpdesk/db',
    }])
    expect(payload.acceptance.statements).toEqual([])
    expect(payload.scope).toEqual({ included: [], excluded: [] })
    // 删行 → 回到定性合同路径（无度量无陈述再次拦截）
    const w2 = await openForm(await mountEmptyRoot('降低工单积压'))
    await w2.find('[data-testid="outcome-create-measure-add"]').trigger('click')
    await w2.find('[data-testid="outcome-create-measure-remove-0"]').trigger('click')
    expect(w2.find('[data-testid="outcome-create-measure-0"]').exists()).toBe(false)
  })

  it('422 problems 逐条显示；失败重试同 clientRequestId（幂等键稳定）', async () => {
    const w = await openForm(await mountEmptyRoot('降低工单积压'))
    await fillRequired(w, '积压 ≤50 张\n按期结单率 ≥90%')
    apiMocks.createOutcome.mockRejectedValueOnce(new OutcomeApiError(
      422, '创建失败（invalid_input）：两条问题', 'invalid_input', [
        'ownerPersonId alice 未在人员名单中激活（owner/verifier 必须为 active 自然人）',
        'valueStatement 与验收口径冲突，请补充价值陈述',
      ]))
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    await flushPromises()
    const items = w.findAll('[data-testid="outcome-create-problems"] li')
    expect(items.length).toBe(2)
    expect(items[0]!.text()).toContain('未在人员名单中激活')
    expect(items[1]!.text()).toContain('价值陈述')
    // 表单保持展开（键不换）；补正后重试 → 两次调用同键、载荷键 creq- 前缀
    apiMocks.createOutcome.mockResolvedValueOnce({ contract: makeContract(), replayed: false })
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createOutcome).toHaveBeenCalledTimes(2)
    const first = apiMocks.createOutcome.mock.calls[0]![0]
    const second = apiMocks.createOutcome.mock.calls[1]![0]
    expect(second.clientRequestId).toBe(first.clientRequestId)
    expect(first.clientRequestId).toMatch(/^creq-/)
    expect(first.rootTaskId).toBe('root-1')
    expect(first.title).toBe('降低工单积压')
    expect(first.ownerPersonId).toBe('alice')
    expect(first.learningOptIn).toBe(false)
    expect(first.riskTier).toBe('medium')
    expect(first.defaultReversibility).toBe('reversible')
    expect(first.acceptance.statements).toEqual(['积压 ≤50 张', '按期结单率 ≥90%'])
  })

  it('创建成功 → 表单收起、面板复用 load 刷新进合同态', async () => {
    // 初次读=null（空态）；创建成功后 load 重读=合同
    apiMocks.fetchOutcomeByRoot.mockReset()
    apiMocks.fetchOutcomeByRoot.mockResolvedValueOnce(null).mockResolvedValue(makeContract())
    const w = mount(OutcomeSection, { props: { taskId: 'root-1', isRootTask: true, taskTitle: '降低工单积压' } })
    await flushPromises()
    await w.find('[data-testid="outcome-create-toggle"]').trigger('click')
    await fillRequired(w, '积压 ≤50 张')
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createOutcome).toHaveBeenCalledTimes(1)
    expect(apiMocks.fetchOutcomeByRoot).toHaveBeenCalledTimes(2)
    expect(w.find('[data-testid="outcome-create-form"]').exists()).toBe(false)
    expect(w.find('[data-testid="outcome-measure-m1"]').exists()).toBe(true)
    expect(w.find('[data-testid="outcome-section"]').text()).toContain('业务结果 · 降低工单积压')
  })

  it('409 冲突（root_task_taken）→ 提示刷新而非重试；点「刷新面板」重读进合同态', async () => {
    const w = await openForm(await mountEmptyRoot('降低工单积压'))
    await fillRequired(w, '积压 ≤50 张')
    apiMocks.createOutcome.mockRejectedValueOnce(new OutcomeApiError(
      409, '创建失败（root_task_taken）', 'root_task_taken'))
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    await flushPromises()
    const conflict = w.find('[data-testid="outcome-create-conflict"]')
    expect(conflict.exists()).toBe(true)
    expect(conflict.text()).toContain('已存在')
    expect(w.find('[data-testid="outcome-create-problems"]').exists()).toBe(false)
    // 冲突面板刷新：load 重读返回合同 → 进合同态
    apiMocks.fetchOutcomeByRoot.mockResolvedValue(makeContract())
    await w.find('[data-testid="outcome-create-conflict-refresh"]').trigger('click')
    await flushPromises()
    expect(apiMocks.fetchOutcomeByRoot).toHaveBeenCalledTimes(2)
    expect(w.find('[data-testid="outcome-measure-m1"]').exists()).toBe(true)
  })

  it('高风险/不可逆预警文案出现且用警示样式（非绿色）；预警只提示不硬阻断', async () => {
    const w = await openForm(await mountEmptyRoot('降低工单积压'))
    // 未选档位时无预警
    expect(w.find('[data-testid="outcome-create-risk-hint"]').exists()).toBe(false)
    await fillRequired(w, '积压 ≤50 张') // 先填必填（medium/reversible），再换高风险档验证预警
    await w.find('[data-testid="outcome-create-risktier"]').setValue('high')
    const riskHint = w.find('[data-testid="outcome-create-risk-hint"]')
    expect(riskHint.exists()).toBe(true)
    expect(riskHint.text()).toContain('分离')
    expect(riskHint.classes()).toContain('outcome-warn')
    expect(riskHint.classes()).not.toContain('is-ok')
    await w.find('[data-testid="outcome-create-reversibility"]').setValue('one-way')
    const revHint = w.find('[data-testid="outcome-create-reversibility-hint"]')
    expect(revHint.exists()).toBe(true)
    expect(revHint.text()).toContain('不可逆')
    expect(revHint.classes()).toContain('outcome-warn')
    // 预警不阻断：仍可发请求（高风险同人分离由服务端 422 终裁）
    await w.find('[data-testid="outcome-create-submit"]').trigger('click')
    await flushPromises()
    expect(apiMocks.createOutcome).toHaveBeenCalledTimes(1)
    expect(apiMocks.createOutcome.mock.calls[0]![0].riskTier).toBe('high')
    expect(apiMocks.createOutcome.mock.calls[0]![0].defaultReversibility).toBe('one-way')
  })
})
