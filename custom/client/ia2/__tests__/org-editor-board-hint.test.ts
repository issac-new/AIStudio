// 驾驶舱 P1 残项：OrgEditor「板（team）」列格式说明条（编辑语义零改动）。
// 契约：hint 渲染在表格上方、说明 slug 填法；表格仍为原始行编辑（正身语义不变）。
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockRegistry = vi.hoisted(() => ({
  fetchRegistry: vi.fn(),
  saveRegistry: vi.fn(),
  offboardAccount: vi.fn(),
  fetchOrgCosign: vi.fn(),
  openOrgCosign: vi.fn(),
  resolveOrgCosign: vi.fn(),
}))
vi.mock('@/custom/governance/api/adminRegistry', () => mockRegistry)
vi.mock('../../matrix-server-info', () => ({ fetchMatrixServerInfo: vi.fn().mockResolvedValue({ homeserverUrl: 'https://x' }) }))
// 离职向导（批一 Task 10）：前置检查走通用 request；改派/取卡/指派对象列表走看板客户端
const mockClient = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api/client', () => mockClient)
const mockKanban = vi.hoisted(() => ({ getTask: vi.fn(), reassignTask: vi.fn(), getAssignees: vi.fn() }))
vi.mock('@/api/hermes/kanban', () => mockKanban)

import OrgEditor from '../components/gov/OrgEditor.vue'

const MARKDOWN = [
  '# org',
  '',
  '| 账号 | 角色 | 汇报线(lead) | 板（team） | matrix 账号 |',
  '| --- | --- | --- | --- | --- |',
  '| bella | 业务分析 | fanfan | bella-req-intake(requirements-analyst) | @bella:x |',
  '',
].join('\n')

describe('OrgEditor 板列说明条（P1-2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRegistry.fetchRegistry.mockResolvedValue({ commit: 'abc1234', markdown: MARKDOWN })
    mockRegistry.fetchOrgCosign.mockResolvedValue({ pending: null })
  })

  it('hint 渲染：说明 slug 填法且含示例；表格原文行不受影响', async () => {
    const w = mount(OrgEditor)
    await flushPromises()

    const hint = w.find('[data-testid="org-editor-board-hint"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('bella-req-intake(requirements-analyst)')

    // 正身语义不变：首行数据仍是原文 slug 串（可编辑 input）
    const firstRowInputs = w.findAll('tbody tr')[0]!.findAll('input')
    expect(firstRowInputs[3]!.element.value).toBe('bella-req-intake(requirements-analyst)')
  })

  it('会签不再询问账号：批准/驳回只传决议与意见，由服务端采用登录人', async () => {
    mockRegistry.fetchOrgCosign.mockResolvedValue({
      pending: {
        status: 'pending', initiator: 'admin', created: '2026-10-26T00:00:00Z',
        message: 'admin 变更', detail: ['变更 admin 行'], markdown: MARKDOWN,
      },
    })
    mockRegistry.resolveOrgCosign.mockResolvedValue({ orgCommit: 'org1', commit: 'decision1' })
    const w = mount(OrgEditor)
    await flushPromises()

    expect(w.find('[data-testid="org-cosign-approver"]').exists()).toBe(false)
    const approve = w.find('[data-testid="org-cosign-approve"]')
    expect(approve.attributes('disabled')).toBeUndefined()
    await w.find('[data-testid="org-cosign-reason"]').setValue('复核通过')
    await approve.trigger('click')
    await flushPromises()
    expect(mockRegistry.resolveOrgCosign).toHaveBeenCalledWith('approve', '', '复核通过')
  })
})

// 数字员工批一 Task 10：离职向导——前置检查（只读）→ 逐卡改派（不回收在跑任务）→ 离职；
// 半完成状态（已改派但离职失败）提供「改回原指派对象」恢复入口。
describe('OrgEditor 离职向导（批一 Task 10）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRegistry.fetchRegistry.mockResolvedValue({ commit: 'abc1234', markdown: MARKDOWN })
    mockRegistry.fetchOrgCosign.mockResolvedValue({ pending: null })
    mockKanban.getAssignees.mockResolvedValue([{ name: 'chen-agent', on_disk: true, counts: null }])
  })

  /** 打开离职向导、填齐第一步（含管理员令牌与接手执行单元）并执行 */
  async function fillAndRun(w: ReturnType<typeof mount>, taskIds = 'T-1, T-2') {
    await w.find('[data-testid="oed-offboard-0"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="wiz-handover"]').setValue('chen')
    await w.find('[data-testid="wiz-tasks"]').setValue(taskIds)
    await w.find('[data-testid="wiz-reason"]').setValue('个人原因')
    await w.find('[data-testid="wiz-token"]').setValue('tok-admin')
    await w.find('[data-testid="wiz-profile"]').setValue('chen-agent')
    await w.find('[data-testid="wiz-next2"]').trigger('click')
    await w.find('[data-testid="wiz-run"]').trigger('click')
    await flushPromises()
  }

  it('前置检查被阻止 → 显示在岗执行单元名单，不发起改派与离职', async () => {
    mockClient.request.mockResolvedValue({
      ok: true,
      blockedUnits: [{ identityId: 'aid-9', name: 'req-bot', stage: 'running' }],
      person: { status: 'not-linked' },
    })
    const w = mount(OrgEditor)
    await flushPromises()
    await fillAndRun(w)

    expect(mockClient.request).toHaveBeenCalledWith(
      '/api/governance/matrix-offboard/precheck', expect.objectContaining({ method: 'POST' }))
    // 被拦单元名如实展示；改派与离职均未发起
    expect(w.find('[data-testid="offboard-wizard"]').text()).toContain('req-bot')
    expect(mockKanban.reassignTask).not.toHaveBeenCalled()
    expect(mockRegistry.offboardAccount).not.toHaveBeenCalled()
  })

  // 审查挂账6/6：被拦后此前结果页只有「关闭」，须关掉重开——已填内容丢失。
  // 守门钉住「被拦后返回→表单值仍在」，返回后可径直再执行。
  it('前置检查被拦 → 返回修改入口回到第一步且已填内容保留，可直接再执行', async () => {
    mockClient.request.mockResolvedValue({
      ok: true,
      blockedUnits: [{ identityId: 'aid-9', name: 'req-bot', stage: 'running' }],
    })
    const w = mount(OrgEditor)
    await flushPromises()
    await fillAndRun(w)

    const back = w.find('[data-testid="wiz-back-edit"]')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    // 回到第一步：表单值全部仍在（wizard state 不重置）
    expect((w.find('[data-testid="wiz-handover"]').element as HTMLInputElement).value).toBe('chen')
    expect((w.find('[data-testid="wiz-tasks"]').element as HTMLInputElement).value).toBe('T-1, T-2')
    expect((w.find('[data-testid="wiz-reason"]').element as HTMLInputElement).value).toBe('个人原因')
    expect((w.find('[data-testid="wiz-token"]').element as HTMLInputElement).value).toBe('tok-admin')
    expect((w.find('[data-testid="wiz-profile"]').element as HTMLSelectElement).value).toBe('chen-agent')
    // 被拦名单已清：改完可直接再走「下一步 → 执行」，旧被拦名单不再残留
    expect(w.find('[data-testid="wiz-back-edit"]').exists()).toBe(false)
    await w.find('[data-testid="wiz-next2"]').trigger('click')
    expect((w.find('[data-testid="wiz-run"]').element as HTMLButtonElement).disabled).toBe(false)
  })

  it('前置检查通过 → 先改派再离职，结果显示逐卡核实与自然人联动', async () => {
    mockClient.request.mockResolvedValue({
      ok: true, blockedUnits: [], person: { status: 'deactivated', personId: 'p-1' },
    })
    mockKanban.getTask.mockImplementation(async (id: string) => ({ task: { id, assignee: 'bella' }, latest_summary: null, comments: [], events: [], runs: [] }))
    mockKanban.reassignTask.mockResolvedValue({ ok: true })
    mockRegistry.offboardAccount.mockResolvedValue({
      handoverCommit: 'h1', deactivated: ['@bella:x', '@bella-agent:x'], auditCommit: 'a1',
      taskHandover: [
        { taskId: 'T-1', before: null, after: 'chen-agent', reassigned: true, note: '已改派至 chen-agent（服务端核实）' },
        { taskId: 'T-2', before: null, after: 'chen-agent', reassigned: true, note: '已改派至 chen-agent（服务端核实）' },
      ],
      person: { status: 'deactivated', personId: 'p-1' },
    })
    const w = mount(OrgEditor)
    await flushPromises()
    await fillAndRun(w)

    // 调用顺序：precheck → reassign ×2 → offboard
    expect(mockKanban.reassignTask).toHaveBeenCalledTimes(2)
    const preOrder = mockClient.request.mock.invocationCallOrder[0]!
    const offOrder = mockRegistry.offboardAccount.mock.invocationCallOrder[0]!
    expect(preOrder).toBeLessThan(mockKanban.reassignTask.mock.invocationCallOrder[0]!)
    expect(mockKanban.reassignTask.mock.invocationCallOrder[1]!).toBeLessThan(offOrder)
    // 离职移交不回收在跑任务：改派调用不得带 reclaim
    expect(mockKanban.reassignTask).toHaveBeenCalledWith('T-1', 'chen-agent', { reason: '离职移交' })
    expect(mockKanban.reassignTask).toHaveBeenCalledWith('T-2', 'chen-agent', { reason: '离职移交' })
    // 接手执行单元透传离职接口，供服务端逐卡只读核实
    expect(mockRegistry.offboardAccount).toHaveBeenCalledWith(
      expect.objectContaining({ localName: 'bella', handoverProfile: 'chen-agent' }))
    // 结果区：逐卡核实 + 自然人联动
    const text = w.find('[data-testid="offboard-wizard"]').text()
    expect(text).toContain('已改派至 chen-agent（服务端核实）')
    expect(w.find('[data-testid="wiz-person"]').text()).toContain('p-1')
  })

  it('离职失败且已有改派 → 列出已改派的卡并提供改回入口', async () => {
    mockClient.request.mockResolvedValue({ ok: true, blockedUnits: [], person: { status: 'not-linked' } })
    mockKanban.getTask.mockResolvedValue({ task: { id: 'T-1', assignee: 'bella' }, latest_summary: null, comments: [], events: [], runs: [] })
    mockKanban.reassignTask.mockResolvedValue({ ok: true })
    mockRegistry.offboardAccount.mockRejectedValue(new Error('API Error 502: 停用失败'))
    const w = mount(OrgEditor)
    await flushPromises()
    await fillAndRun(w, 'T-1')

    // 半完成状态：列出已改派的卡与原指派对象，提供恢复入口
    const revertBtn = w.find('[data-testid="wiz-revert-T-1"]')
    expect(revertBtn.exists()).toBe(true)
    expect(revertBtn.text()).toContain('改回原指派对象')
    expect(w.find('[data-testid="wiz-revert"]').text()).toContain('bella')

    await revertBtn.trigger('click')
    await flushPromises()
    // 改回=以原指派对象再调同一改派接口（同样不带 reclaim）
    expect(mockKanban.reassignTask).toHaveBeenLastCalledWith('T-1', 'bella', { reason: '离职中止改回' })
  })

  it('管理员令牌为空时不能进入执行', async () => {
    const w = mount(OrgEditor)
    await flushPromises()
    await w.find('[data-testid="oed-offboard-0"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="wiz-handover"]').setValue('chen')
    // 令牌留空：进不了第二步（执行按钮在第二步）
    expect((w.find('[data-testid="wiz-next2"]').element as HTMLButtonElement).disabled).toBe(true)
    await w.find('[data-testid="wiz-token"]').setValue('tok-admin')
    expect((w.find('[data-testid="wiz-next2"]').element as HTMLButtonElement).disabled).toBe(false)
    await w.find('[data-testid="wiz-next2"]').trigger('click')
    expect((w.find('[data-testid="wiz-run"]').element as HTMLButtonElement).disabled).toBe(false)
  })
})
