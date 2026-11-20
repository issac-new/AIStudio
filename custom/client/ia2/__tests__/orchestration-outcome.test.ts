// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/orchestration-outcome.test.ts
// Task 14（2026-11-20 批一）：协同图五问面板第 1 问接入真实结果合同守门。
// 契约（GET /api/hermes/outcomes?rootTaskId=，T7 端点）：
//   - 有合同 → 第 1 问渲染合同 title/owner（people 名单解析，名不可得显示
//     ownerPersonId 并标注）/status/measures 摘要/合同版本，脚注口径句同步；
//   - 无合同（200 空列表或 404 outcome_workbench_disabled 门关）→ 保留看板
//     启发式并亮「未建模业务结果」徽标，不报错；
//   - API 失败（5xx/网络）→ 第 1 问小节标不可用，画布与其余四问不受影响。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@vue-flow/core', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    VueFlow: defineComponent({
      name: 'VueFlow',
      props: { nodes: { type: Array, default: () => [] } },
      setup: () => () => h('div', { 'data-testid': 'vue-flow-stub' }),
    }),
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useVueFlow: () => ({ fitView: vi.fn() }),
  }
})

const workspaceStubs = vi.hoisted(() => {
  const state = {
    rawTasks: [] as Array<{ task: Record<string, unknown> }>,
    refreshAllBoards: vi.fn(async () => true),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/shared/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import OrchestrationView from '../views/orchestration/OrchestrationView.vue'

const mockedFetch = vi.mocked(authFetch)

/** Response 桩（authFetch 消费面只有 ok/status/json 三键）。 */
function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

/** 按路径前缀路由的 authFetch 桩；未命中路径回 200 ok 空态（阶梯/升级/模板三源）。 */
function mockApi(handlers: Record<string, () => Response>): void {
  mockedFetch.mockImplementation(((input: RequestInfo | URL) => {
    const url = String(input)
    for (const key of Object.keys(handlers)) {
      if (url.includes(key)) return Promise.resolve(handlers[key]!())
    }
    return Promise.resolve(jsonResponse({ ok: true }))
  }) as typeof authFetch)
}

const ROOT_ID = 'r1'

function seedBoard(): void {
  workspaceStubs.state.rawTasks = [
    { task: { id: ROOT_ID, title: '支付对账提速', status: 'todo', assignee: 'bella', children: ['c1'] } },
    { task: { id: 'c1', title: '子任务', status: 'todo', assignee: null, parents: [ROOT_ID] } },
  ]
}

/** 合同正身（服务端 outcome/types.ts OutcomeContract 形状的完整一行）。 */
const CONTRACT = {
  schemaVersion: 1,
  outcomeId: 'oc-test1',
  rootTaskId: ROOT_ID,
  version: 3,
  title: '支付对账周期从 10 小时压到 6 小时',
  valueStatement: '对账时效决定结算窗口',
  ownerPersonId: 'plusprimer',
  measures: [
    { measureId: 'm1', name: '对账周期', definition: '月末批量对账耗时', unit: '小时', operator: 'lte', baseline: 10, target: 6, sourceRef: 'log' },
  ],
  acceptance: { statements: [], requiredEvidenceKinds: [] },
  scope: { included: [], excluded: [] },
  riskTier: 'medium',
  defaultReversibility: 'costly',
  verificationOwnerId: 'mei',
  contextPolicy: { allowedScopes: [], excludedSourceKinds: [] },
  learningOptIn: false,
  status: 'active',
  createdAt: 1,
  updatedAt: 2,
}

const ROSTER = { ok: true, people: [{ id: 'plusprimer', name: '史石', emails: [], active: true, source: 'manual', createdAt: 1 }] }

beforeEach(() => {
  vi.clearAllMocks()
  seedBoard()
})

describe('OrchestrationView 第 1 问——真实结果合同', () => {
  it('有合同：渲染合同 title/owner（people 名）/状态/度量摘要/版本；脚注口径句同步', async () => {
    mockApi({
      '/api/hermes/outcomes': () => jsonResponse({ ok: true, items: [CONTRACT] }),
      '/api/governance/people': () => jsonResponse(ROSTER),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    expect(mockedFetch).toHaveBeenCalledWith(`/api/hermes/outcomes?rootTaskId=${ROOT_ID}`)
    const sec = w.find('[data-testid="ia-orchestration-outcome-contract"]')
    expect(sec.exists()).toBe(true)
    expect(sec.text()).toContain('支付对账周期从 10 小时压到 6 小时')
    expect(sec.text()).toContain('史石')
    expect(sec.text()).toContain('active')
    expect(sec.text()).toContain('对账周期')
    expect(sec.text()).toContain('v3')
    expect(w.find('[data-testid="ia-orchestration-outcome-unmodeled"]').exists()).toBe(false)
    expect(w.find('[data-testid="ia-orchestration-fiveq"]').text()).toContain('OutcomeContract v3')
    w.unmount()
  })

  it('people 名不可得：显示 ownerPersonId 并标注（不显示空白负责人）', async () => {
    mockApi({
      '/api/hermes/outcomes': () => jsonResponse({ ok: true, items: [CONTRACT] }),
      '/api/governance/people': () => jsonResponse({ ok: true, people: [] }),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    const sec = w.find('[data-testid="ia-orchestration-outcome-contract"]')
    expect(sec.exists()).toBe(true)
    expect(sec.text()).toContain('plusprimer')
    expect(sec.text()).toContain('未匹配人员名单')
    w.unmount()
  })

  it('无合同（200 空列表）：保留看板启发式并亮「未建模业务结果」徽标', async () => {
    mockApi({
      '/api/hermes/outcomes': () => jsonResponse({ ok: true, items: [] }),
      '/api/governance/people': () => jsonResponse(ROSTER),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    expect(w.find('[data-testid="ia-orchestration-outcome-unmodeled"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-orchestration-outcome-contract"]').exists()).toBe(false)
    // 启发式仍在：负责人＝根卡 assignee
    expect(w.find('[data-testid="ia-orchestration-fiveq"]').text()).toContain('bella')
    w.unmount()
  })

  it('门关 404（outcome_workbench_disabled）：等同无合同——徽标不报错，不标不可用', async () => {
    mockApi({
      '/api/hermes/outcomes': () => jsonResponse({ ok: false, code: 'outcome_workbench_disabled' }, 404),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    expect(w.find('[data-testid="ia-orchestration-outcome-unmodeled"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-orchestration-outcome-unavailable"]').exists()).toBe(false)
    w.unmount()
  })

  it('API 500：第 1 问标不可用不炸；画布与其余四问不受影响', async () => {
    mockApi({
      '/api/hermes/outcomes': () => jsonResponse({ ok: false, error: '内部错误' }, 500),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    expect(w.find('[data-testid="ia-orchestration-outcome-unavailable"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-orchestration-outcome-unmodeled"]').exists()).toBe(false)
    // 画布与其余四问原样：五问面板在、第 2 问在、VueFlow 画布在
    expect(w.find('[data-testid="ia-orchestration-fiveq"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-orchestration-fiveq"]').text()).toContain('2. 任务链人机分工')
    expect(w.find('[data-testid="vue-flow-stub"]').exists()).toBe(true)
    w.unmount()
  })
})
