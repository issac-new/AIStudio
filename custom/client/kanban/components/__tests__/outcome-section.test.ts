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
  transitionOutcome: vi.fn(),
  submitMeasurement: vi.fn(),
  settleOutcome: vi.fn(),
}))
vi.mock('@/custom/kanban/api/outcome', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/outcome')>()
  return { ...actual, ...apiMocks }
})
const auth = vi.hoisted(() => ({ actor: { value: 'alice' } }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => auth.actor.value }))

import OutcomeSection from '../OutcomeSection.vue'
import { OutcomeWorkbenchDisabledError, type OutcomeContract } from '../../api/outcome'

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
  apiMocks.fetchOutcomeSnapshots.mockResolvedValue([])
  apiMocks.transitionOutcome.mockResolvedValue(makeContract({ status: 'active' }))
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
})
