// overlay/custom/client/cockpit/__tests__/approval-panel.test.ts
// P1 审批面板守门：待审双组渲染 + 就地裁决调用链 + 历史表 + 空态/错误态。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import ApprovalPanel from '../components/ApprovalPanel.vue'
import * as approvalsApi from '../api/approvals'


// UX 裁决 C（2026-10-03）：审批一键直通改确认制——点击动作后须在离散 dialog 确认
// （positiveText 走 t('common.confirm')，mock 的 t 返回键名）。取消路径见行为守门。
async function confirmDecision(): Promise<void> {
  await flushPromises()
  await new Promise((r) => setTimeout(r, 30))
  // 取最后一个确定钮：离散 dialog 残留（前例）会遮蔽后例
  const btn = [...document.querySelectorAll('button')].reverse().find((b) => (b.textContent || '').includes('common.confirm'))
  if (btn) (btn as HTMLElement).click()
  await flushPromises()
}

// U2 改版（locale 时间随界面语言）：mock 需带 locale ref，否则 fmtTime 读 locale.value 炸挂载
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, named?: Record<string, unknown>) => (named ? `${k}:${JSON.stringify(named)}` : k), locale: ref('zh-CN') }) }))
// mock 整个 approvals API 模块：经 @/api/client 会连锁拉入上游 router（node 环境无 location）
vi.mock('../api/approvals', async () => {
  const state = {
    pending: { items: [] as unknown[] }, history: { entries: [] as unknown[] },
    spotcheck: { items: [] as unknown[], resolved: [] as unknown[] },
    decideResult: { ok: true } as Record<string, unknown>,
    spotResolveResult: { ok: true } as Record<string, unknown>,
  }
  return {
    dedupePending: (items: unknown[]) => items,
    fetchPendingApprovals: vi.fn(async () => JSON.parse(JSON.stringify(state.pending))),
    fetchApprovalHistory: vi.fn(async () => JSON.parse(JSON.stringify(state.history))),
    fetchSpotChecks: vi.fn(async () => JSON.parse(JSON.stringify(state.spotcheck))),
    decideApproval: vi.fn(async () => state.decideResult),
    resolveSpotCheck: vi.fn(async () => state.spotResolveResult),
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
    api.__setState({ pending: { items: [] }, history: { entries: [] }, spotcheck: { items: [], resolved: [] }, decideResult: { ok: true }, spotResolveResult: { ok: true } })
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

  // 2026-10-04 影响面预览（Blast Radius）：impact 命中渲染展开块；无 impact 不渲染
  it('影响面预览：高危命令展开块（危险徽章+目标数+清单）；无 impact 不渲染', async () => {
    api.__setState({
      pending: {
        items: [
          {
            ...pendingItems[0]!,
            detail: 'rm -rf dist build',
            risk: 'high' as const,
            impact: { danger: 'delete' as const, targets: [{ spec: 'dist', kind: 'path' as const }, { spec: 'build', kind: 'path' as const }], unbounded: false },
          },
          pendingItems[1]!,
        ],
      },
      history: { entries: [] },
    })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0 } })
    await flushPromises()
    const impact = wrap.find('[data-testid="approval-impact"]')
    expect(impact.exists()).toBe(true)
    expect(impact.text()).toContain('影响面预览')
    expect(impact.text()).toContain('2')
    expect(impact.text()).toContain('dist')
    // review 卡无 impact 块
    expect(wrap.findAll('[data-testid="approval-impact"]')).toHaveLength(1)
  })

  it('就地裁决：approve 点击 → decideApproval 正确入参 → 刷新 + changed 事件', async () => {
    api.__setState({ pending: { items: pendingItems }, history: { entries: [] }, decideResult: { ok: true } })
    const decide = api.decideApproval
    const fetchP = api.fetchPendingApprovals
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0 } })
    await flushPromises()
    fetchP.mockClear()
    await wrap.find('[data-testid="approval-btn-approve"]').trigger('click')
    await confirmDecision()
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
    await confirmDecision()
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

  // V4.1 §七 抽检器：低风险自动放行的事后回看（待抽检行 + 认可/误放行处置 + 空态计数）
  it('V4.1：抽检区渲染待抽检行；veto 点击 → resolveSpotCheck(veto) → 刷新；showHistory=false 不渲染', async () => {
    const api2 = approvalsApi as unknown as { __setState: (s: Record<string, unknown>) => void
      fetchSpotChecks: ReturnType<typeof vi.fn>, resolveSpotCheck: ReturnType<typeof vi.fn> }
    api2.__setState({
      pending: { items: [] },
      history: { entries: [] },
      spotcheck: {
        items: [{ id: 'fleetfile:rq-1', ts: 1759000030000, title: 'unattended:single_query 的命令审批', detail: 'git status', profile: 'wei' }],
        resolved: [{ id: 'fleetfile:rq-0', ts: 1759000010000, title: 'x', detail: 'ls', verdict: 'confirmed' }],
      },
    })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: true } })
    await flushPromises()
    const row = wrap.find('[data-testid="approval-spotcheck-row"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('git status')
    // 词条走本地字典（i18n-approvals.ts——键族已从注入词表丢失），非 t() key 直出
    expect(wrap.find('[data-testid="approval-spotcheck"]').text()).toContain('抽检 · 自动放行回看')

    api2.fetchSpotChecks.mockClear()
    await wrap.find('[data-testid="spotcheck-btn-veto"]').trigger('click')
    await confirmDecision()
    await flushPromises()
    expect(api2.resolveSpotCheck).toHaveBeenCalledWith('fleetfile:rq-1', 'veto')
    expect(api2.fetchSpotChecks).toHaveBeenCalled()

    // 嵌入条（showHistory=false）不渲染抽检区——抽检是收件箱治理面，不进看板窄条
    const narrow = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: false } })
    await flushPromises()
    expect(narrow.find('[data-testid="approval-spotcheck"]').exists()).toBe(false)
  })

  it('V4.1：抽检空态（仅已处置计数，无待抽检行）；已处置条目回看列表可见', async () => {
    const api2 = approvalsApi as unknown as { __setState: (s: Record<string, unknown>) => void }
    api2.__setState({
      pending: { items: [] }, history: { entries: [] },
      spotcheck: { items: [], resolved: [{ id: 'x1', ts: 1, title: 't', detail: 'd', verdict: 'vetoed' }] },
    })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: true } })
    await flushPromises()
    expect(wrap.find('[data-testid="approval-spotcheck-row"]').exists()).toBe(false)
    expect(wrap.find('[data-testid="approval-spotcheck-empty"]').exists()).toBe(true)
    // 回看内容不得只留计数：已处置条目逐条渲染，vetoed 判红徽标（2026-10-01 修复）
    const resRow = wrap.find('[data-testid="approval-spotcheck-resolved-row"]')
    expect(resRow.exists()).toBe(true)
    expect(resRow.text()).toContain('t')
    expect(wrap.find('[data-testid="approval-spotcheck-verdict"]').classes()).toContain('risk-badge--high')
    expect(wrap.find('[data-testid="approval-spotcheck-resolved"]').text()).toContain('已处置回看')
  })

  it('V4.1：已处置 confirmed 条目绿徽标 + 操作人/处置时间随行', async () => {
    const api2 = approvalsApi as unknown as { __setState: (s: Record<string, unknown>) => void }
    api2.__setState({
      pending: { items: [] }, history: { entries: [] },
      spotcheck: {
        items: [], resolved: [
          { id: 'y1', ts: 1759000010000, title: 'git status', detail: 'git status', verdict: 'confirmed', verdictTs: 1759000090000, verdictActor: 'qa-lead' },
        ],
      },
    })
    const wrap = mount(ApprovalPanel, { props: { pollMs: 0, showHistory: true } })
    await flushPromises()
    expect(wrap.find('[data-testid="approval-spotcheck-verdict"]').classes()).toContain('risk-badge--low')
    expect(wrap.find('[data-testid="approval-spotcheck-resolved-row"]').text()).toContain('qa-lead')
  })
})
