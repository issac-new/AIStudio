// @vitest-environment jsdom
// 身份面板（2026-11-24 数字员工批一 Task 8）：户口五要素登记表单 / 户口缺口列 /
// 补全编辑（runtimeBindings 整体替换）/ 执法范围说明。数据面 fetch 全 mock——
// 服务端契约由 agentidentity 域测试覆盖，本层只守门渲染与请求体形状。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

const FULL = {
  id: 'aid-001', name: 'full-unit', kind: 'agent', owner: 'alice',
  toolAllowlist: ['read_file'],
  capabilityBoundary: { can: ['跑回归测试'], cannot: ['改生产配置'] },
  auditRequirement: { sampling: 0.1, retentionDays: 30 },
  credentials: [], delegations: [],
}
const GAP = {
  id: 'aid-002', name: 'gap-unit', kind: 'agent', owner: 'bob',
  toolAllowlist: [], credentials: [], delegations: [],
}

const listBody = {
  ok: true,
  identities: [FULL, GAP],
  events: [],
  gaps: [
    { id: 'aid-001', name: 'full-unit', kind: 'agent', status: 'complete', gaps: [] },
    {
      id: 'aid-002', name: 'gap-unit', kind: 'agent', status: 'blocked',
      gaps: [
        { field: 'capability-boundary-can', detail: '缺能力边界（能做什么）——只写许可不写设计意图，能力与权限会被混同' },
        { field: 'permission-scope', detail: '缺权限范围——空白名单是「未声明」，不等于无限制' },
      ],
    },
  ],
}

function mockList(): void {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/governance/agent-identity') return jsonResponse(listBody)
    return jsonResponse({ ok: true })
  })
}

beforeEach(() => { fetchMock.mockReset() })
afterEach(() => { vi.clearAllMocks() })

describe('AgentIdentitySection（数字员工批一 Task 8）', () => {
  it('表格有「户口缺口」列，缺口身份显示缺口说明', async () => {
    mockList()
    const { default: C } = await import('../components/AgentIdentitySection.vue')
    const w = mount(C)
    await flushPromises()

    expect(w.find('[data-testid="gov-agent-identity-table"]').text()).toContain('户口缺口')
    const gapCell = w.find('[data-testid="gov-ai-gap-gap-unit"]')
    expect(gapCell.exists()).toBe(true)
    expect(gapCell.text()).toContain('能力边界')
    expect(gapCell.text()).toContain('权限范围')
    // 齐备行不渲染缺口说明
    expect(w.find('[data-testid="gov-ai-gap-full-unit"]').exists()).toBe(false)
    w.unmount()
  })

  it('登记表单可填能力边界与审计要求，并随请求发出', async () => {
    mockList()
    const { default: C } = await import('../components/AgentIdentitySection.vue')
    const w = mount(C)
    await flushPromises()

    await w.find('[data-testid="gov-ai-reg-name"]').setValue('new-unit')
    await w.find('[data-testid="gov-ai-reg-owner"]').setValue('alice')
    await w.find('[data-testid="gov-ai-reg-allowlist"]').setValue('read_file\nrun_tests')
    await w.find('[data-testid="gov-ai-reg-can"]').setValue('跑回归测试\n出报告')
    await w.find('[data-testid="gov-ai-reg-cannot"]').setValue('改生产配置')
    await w.find('[data-testid="gov-ai-reg-sampling"]').setValue('0.2')
    await w.find('[data-testid="gov-ai-reg-retention"]').setValue('30')
    await w.find('[data-testid="gov-ai-reg-do"]').trigger('click')
    await flushPromises()

    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/governance/agent-identity/register')
    expect(call).toBeTruthy()
    const body = JSON.parse(String(call![1]?.body))
    expect(body.toolAllowlist).toEqual(['read_file', 'run_tests'])
    expect(body.capabilityBoundary).toEqual({ can: ['跑回归测试', '出报告'], cannot: ['改生产配置'] })
    expect(body.auditRequirement).toEqual({ sampling: 0.2, retentionDays: 30 })
    w.unmount()
  })

  it('补全编辑把 runtimeBindings 与五要素发给 update', async () => {
    mockList()
    const { default: C } = await import('../components/AgentIdentitySection.vue')
    const w = mount(C)
    await flushPromises()

    await w.find('[data-testid="gov-ai-edit-gap-unit"]').trigger('click')
    await w.find('[data-testid="gov-ai-ed-allowlist"]').setValue('read_file')
    await w.find('[data-testid="gov-ai-ed-can"]').setValue('跑回归')
    await w.find('[data-testid="gov-ai-ed-cannot"]').setValue('改生产')
    await w.find('[data-testid="gov-ai-ed-sampling"]').setValue('0.5')
    await w.find('[data-testid="gov-ai-ed-retention"]').setValue('14')
    await w.find('[data-testid="gov-ai-ed-agents"]').setValue('worker-coder')
    await w.find('[data-testid="gov-ai-ed-do"]').trigger('click')
    await flushPromises()

    const call = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/governance/agent-identity/aid-002/update')
    expect(call).toBeTruthy()
    expect(call![1]?.method).toBe('POST')
    const body = JSON.parse(String(call![1]?.body))
    // 整体替换语义：两个数组一起发（matrixAccounts 未填也要带上，否则误删另一类）
    expect(body.runtimeBindings).toEqual({ agents: ['worker-coder'], matrixAccounts: [] })
    expect(body.toolAllowlist).toEqual(['read_file'])
    expect(body.capabilityBoundary).toEqual({ can: ['跑回归'], cannot: ['改生产'] })
    expect(body.auditRequirement).toEqual({ sampling: 0.5, retentionDays: 14 })
    w.unmount()
  })

  it('界面说明如实写明执法范围', async () => {
    mockList()
    const { default: C } = await import('../components/AgentIdentitySection.vue')
    const w = mount(C)
    await flushPromises()

    const boundary = w.find('[data-testid="gov-ai-boundary"]')
    expect(boundary.exists()).toBe(true)
    expect(boundary.text()).toContain('工具白名单')
    expect(boundary.text()).toContain('凭证')
    expect(boundary.text()).not.toContain('台账不是鉴权')
    w.unmount()
  })
})
