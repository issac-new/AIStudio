// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/orchestration-team.test.ts
// 批三 T6：协同图第 1 问团队版本显示守门。有合同时消费 GET /api/hermes/outcomes/:id
// 扩展面（team 面）：已确认团队显示版本＋成员角色（subjectId（role））；
// team=null 显示未成队；团队面读取失败只标团队行不可用（第 1 问其余内容不受影响）；
// 无合同保持现状标注（不渲染团队行）。
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

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

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

const CONTRACT = {
  schemaVersion: 1, outcomeId: 'oc-team1', rootTaskId: ROOT_ID, version: 3,
  title: '支付对账周期从 10 小时压到 6 小时', valueStatement: '对账时效决定结算窗口',
  ownerPersonId: 'plusprimer', measures: [], acceptance: { statements: [], requiredEvidenceKinds: [] },
  scope: { included: [], excluded: [] }, riskTier: 'medium', defaultReversibility: 'costly',
  verificationOwnerId: 'mei', contextPolicy: { allowedScopes: [], excludedSourceKinds: [] },
  learningOptIn: false, status: 'active', createdAt: 1, updatedAt: 2,
}

const ROSTER = { ok: true, people: [{ id: 'plusprimer', name: '史石', emails: [], active: true, source: 'manual', createdAt: 1 }] }

/** GET /:id 响应（合同＋team 面）：详情键在列表键之后匹配（includes 顺序），列表键带 query。 */
function teamFace(team: unknown): () => Response {
  return () => jsonResponse({ ok: true, contract: CONTRACT, team, readScope: 'full' })
}

beforeEach(() => {
  vi.clearAllMocks()
  seedBoard()
})

describe('OrchestrationView 团队版本显示（批三 T6）', () => {
  it('有合同＋已确认团队：显示团队版本与成员角色（subjectId（role）列表）', async () => {
    mockApi({
      [`/api/hermes/outcomes?rootTaskId=`]: () => jsonResponse({ ok: true, items: [CONTRACT] }),
      [`/api/hermes/outcomes/${CONTRACT.outcomeId}`]: teamFace({
        outcomeId: 'oc-team1', version: 4, status: 'active', changeReason: '确认初版', updatedBy: 'plusprimer', updatedAt: 9,
        members: [
          { subjectKind: 'person', subjectId: 'plusprimer', role: 'accountable', responsibility: '对结果负责' },
          { subjectKind: 'agent', subjectId: 'recon-agent', role: 'executor', responsibility: '执行对账' },
        ],
      }),
      '/api/governance/people': () => jsonResponse(ROSTER),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    const team = w.find('[data-testid="ia-orchestration-team"]')
    expect(team.exists()).toBe(true)
    expect(team.text()).toContain('v4')
    expect(team.text()).toContain('plusprimer（accountable）')
    expect(team.text()).toContain('recon-agent（executor）')
    w.unmount()
  })

  it('team=null：显示未成队（不伪装成员）', async () => {
    mockApi({
      ['/api/hermes/outcomes?rootTaskId=']: () => jsonResponse({ ok: true, items: [CONTRACT] }),
      [`/api/hermes/outcomes/${CONTRACT.outcomeId}`]: teamFace(null),
      '/api/governance/people': () => jsonResponse(ROSTER),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    const team = w.find('[data-testid="ia-orchestration-team"]')
    expect(team.exists()).toBe(true)
    expect(team.text()).toContain('未成队')
    w.unmount()
  })

  it('团队面读取失败：只标团队行不可用，第 1 问其余内容照常', async () => {
    mockApi({
      ['/api/hermes/outcomes?rootTaskId=']: () => jsonResponse({ ok: true, items: [CONTRACT] }),
      [`/api/hermes/outcomes/${CONTRACT.outcomeId}`]: () => jsonResponse({ ok: false, error: '内部错误' }, 500),
      '/api/governance/people': () => jsonResponse(ROSTER),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    const team = w.find('[data-testid="ia-orchestration-team"]')
    expect(team.exists()).toBe(true)
    expect(team.text()).toContain('团队信息读取失败')
    const sec = w.find('[data-testid="ia-orchestration-outcome-contract"]')
    expect(sec.exists()).toBe(true)
    expect(sec.text()).toContain('支付对账周期从 10 小时压到 6 小时')
    w.unmount()
  })

  it('无合同：保持现状标注，不渲染团队行', async () => {
    mockApi({
      ['/api/hermes/outcomes?rootTaskId=']: () => jsonResponse({ ok: true, items: [] }),
      '/api/governance/people': () => jsonResponse(ROSTER),
    })
    const w = mount(OrchestrationView)
    await flushPromises()
    expect(w.find('[data-testid="ia-orchestration-outcome-unmodeled"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-orchestration-team"]').exists()).toBe(false)
    w.unmount()
  })
})
