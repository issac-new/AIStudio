// overlay/custom/client/cockpit/__tests__/approval-panel.test.ts
// P1 审批面板守门：待审双组渲染 + 就地裁决调用链 + 历史表 + 空态/错误态。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ApprovalPanel from '../components/ApprovalPanel.vue'
import * as approvalsApi from '../api/approvals'

// U2 改版（locale 时间随界面语言）：mock 需带 locale ref，否则 fmtTime 读 locale.value 炸挂载
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k), locale: ref('zh-CN') }) }))
// mock 整个 approvals API 模块：经 @/api/client 会连锁拉入上游 router（node 环境无 location）
vi.mock('../api/approvals', async () => {
  const state = { pending: { items: [] as unknown[] }, history: { entries: [] as unknown[] }, decideResult: { ok: true } as Record<string, unknown> }
  return {
    dedupePending: (items: unknown[]) => items,
    fetchPendingApprovals: vi.fn(async () => JSON.parse(JSON.stringify(state.pending))),
    fetchApprovalHistory: vi.fn(async () => JSON.parse(JSON.stringify(state.history))),
    decideApproval: vi.fn(async () => state.decideResult),
    __setState: (s: Partial<typeof state>) => Object.assign(state, s),
  }
})

const pendingItems = [
  {
    id: 'fleet:s1:a1', kind: 'command' as const, title: '会话 A', detail: 'git push origin main',
    sessionId: 's1', choices: ['once', 'session', 'deny'], createdAt: 1759000000000,
  },
  {
    id: 'review:rev-1', kind: 'review' as const, title: '评审 · t_100', detail: '基线对照 main',
    taskId: 't_100', createdAt: 1759000100000,
  },
]
const historyEntries = [
  { id: 'fleet:s0:a0', ts: 1759000200000, actor: 'qa-lead', targetKind: 'command' as const, targetId: 'a0', targetTitle: '会话 B · a0', decision: 'once', note: '放行' },
]

describe('ApprovalPanel（P1 审批面板）', () => {
  const api = approvalsApi as unknown as { __setState: (s: Record<string, unknown>) => void
    fetchPendingApprovals: ReturnType<typeof vi.fn>, fetchApprovalHistory: ReturnType<typeof vi.fn>, decideApproval: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    api.__setState({ pending: { items: [] }, history: { entries: [] }, decideResult: { ok: true } })
    api.fetchPendingApprovals.mockClear()
    api.fetchApprovalHistory.mockClear()
    api.decideApproval.mockClear()
  })

  it('待审双组渲染：命令审批 + 评审卡，计数徽标到位', async () => {
    api.__setState({ pending: { items: pendingItems }, history: { entries: historyEntries } })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: true } })
    await flushPromises()
    expect(wrap.find('[data-testid="approval-row-command"]').exists()).toBe(true)
    expect(wrap.find('[data-testid="approval-row-review"]').exists()).toBe(true)
    expect(wrap.find('[data-testid="approval-pending-count"]').text()).toContain('2')
  })

  it('就地裁决：approve 点击 → decideApproval 正确入参 → 刷新 + changed 事件', async () => {
    api.__setState({ pending: { items: pendingItems }, history: { entries: [] }, decideResult: { ok: true } })
    const decide = api.decideApproval
    const fetchP = api.fetchPendingApprovals
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0 } })
    await flushPromises()
    fetchP.mockClear()
    await wrap.find('[data-testid="approval-btn-approve"]').trigger('click')
    await flushPromises()
    expect(decide).toHaveBeenCalledWith('review:rev-1', 'approve')
    expect(fetchP).toHaveBeenCalled()
    expect(wrap.emitted('changed')).toBeTruthy()
  })

  it('命令审批按 choices 渲染按钮；deny 点击走 deny 决策', async () => {
    api.__setState({ pending: { items: pendingItems }, history: { entries: [] }, decideResult: { ok: true } })
    const decide = api.decideApproval
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: false } })
    await flushPromises()
    expect(wrap.find('[data-testid="approval-btn-once"]').exists()).toBe(true)
    expect(wrap.find('[data-testid="approval-btn-session"]').exists()).toBe(true)
    expect(wrap.find('[data-testid="approval-btn-always"]').exists()).toBe(false)
    await wrap.find('[data-testid="approval-btn-deny"]').trigger('click')
    await flushPromises()
    expect(decide).toHaveBeenCalledWith('fleet:s1:a1', 'deny')
  })

  it('历史表渲染（时间/操作人/对象/结果）；空态文案', async () => {
    api.__setState({ pending: { items: [] }, history: { entries: historyEntries } })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: true } })
    await flushPromises()
    expect(wrap.find('[data-testid="approval-empty"]').exists()).toBe(true)
    const rows = wrap.findAll('[data-testid="approval-history"] tbody tr')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('qa-lead')
    expect(rows[0].text()).toContain('once')
  })

  // V4-N1 风险三档：分区渲染 + 高危置顶 + 缺档兜底 medium + 历史档位徽标
  it('V4-N1：按风险档分区渲染（高危置顶红标、低风险带抽检标、缺档归 medium）', async () => {
    api.__setState({
      pending: {
        items: [
          { id: 'fleet:s1:a1', kind: 'command', title: '会话 A', detail: 'git push origin main', risk: 'high', choices: ['once', 'deny'], createdAt: 1759000000000 },
          { id: 'fleet:s1:a2', kind: 'command', title: '会话 A', detail: 'git status', risk: 'low', choices: ['once', 'deny'], createdAt: 1759000001000 },
          { id: 'review:rev-1', kind: 'review', title: '评审 · t_100', detail: '基线对照 main', taskId: 't_100', createdAt: 1759000100000 },
        ],
      },
      history: { entries: [{ ...historyEntries[0], risk: 'high' }] },
    })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: true } })
    await flushPromises()

    const tiers = wrap.findAll('[data-testid^="approval-tier-"]')
    expect(tiers.map((s) => s.attributes('data-testid'))).toEqual(['approval-tier-high', 'approval-tier-medium', 'approval-tier-low'])
    expect(wrap.find('[data-testid="approval-tier-high"] .approval-row--high').exists()).toBe(true)
    expect(wrap.find('[data-testid="approval-tier-low"]').text()).toContain('approvals.risk.autoSample')
    // 缺档的 review 卡归入 medium 区
    expect(wrap.find('[data-testid="approval-tier-medium"] [data-testid="approval-row-review"]').exists()).toBe(true)
    // 历史档位徽标
    expect(wrap.find('[data-testid="approval-history-risk"]').classes()).toContain('risk-badge--high')
  })
})
