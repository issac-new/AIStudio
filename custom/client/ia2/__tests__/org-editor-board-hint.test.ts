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
