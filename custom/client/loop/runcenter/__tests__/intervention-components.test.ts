// @vitest-environment jsdom
// overlay/custom/client/loop/runcenter/__tests__/intervention-components.test.ts
// 介入层组件 jsdom 冒烟（task-7）：ApprovalPanel 审批提交（reject 必填原因/乐观投影/
// 超时自动通过横幅）/ InboxPanel 两态切换与空态 / NodeInspector attach 档与重跑动作。
// i18n 用全局 setup 的 key 直返 mock；store 走真实 Pinia + REST mock。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// ── runcenter api mock（与 runs-store.test.ts 同一形状 + startRun）──
const { rest } = vi.hoisted(() => ({
  rest: {
    listRuns: vi.fn(async () => []),
    getRun: vi.fn(async () => { throw new Error('not implemented') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'src-fork-1', forkedFrom: 'run-1', superStep: 3 })),
    startRun: vi.fn(async () => ({ runId: 'src-fork-1', instance: {} })),
    replay: vi.fn(async () => []),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest: rest,
  connectGraph: () => ({ connected: false, on: () => {}, emit: () => {}, disconnect: () => {} }),
  disconnectGraph: () => {},
}))

import ApprovalPanel from '@/custom/loop/runcenter/components/ApprovalPanel.vue'
import InboxPanel from '@/custom/loop/runcenter/components/InboxPanel.vue'
import NodeInspector from '@/custom/loop/runcenter/components/NodeInspector.vue'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import type { RunSummary } from '@/custom/loop/runcenter/types'
import type { RunGraphNode } from '@/custom/loop/runcenter/adapters/run-graph'

const node = (over: Partial<RunGraphNode> & { id: string }): RunGraphNode => ({
  label: over.id,
  type: 'phase-validation',
  status: 'done',
  iteration: 1,
  durationMs: 1500,
  ...over,
})

/** awaiting-input run 夹具（socket 词汇事件缓冲：审批 interrupt 已挂起） */
const approvalValue = {
  kind: 'approval',
  contractId: 'c1',
  loopId: 'loop1',
  prompt: 'Approval required for contract c1 (fix login): 修复登录',
  contractSummary: { id: 'c1', source: 'issue', ref: 'ISSUE-7', summary: 'fix login', artifactType: 'patch', attempts: 1 },
  policy: { approvers: ['alice', 'bob'], policy: 'all', onReject: { goto: 'handoff' }, timeout: { ms: 72 * 3600_000, onTimeout: 'escalate' } },
}

const awaitingRun = (over: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'run-1',
  graphId: 'loop-loop1',
  status: 'awaiting-input',
  updatedAt: '2026-09-10T00:00:00Z',
  stage: 'validation',
  iteration: 2,
  lastActivityAt: '2026-09-10T00:05:00Z',
  cost: 0.4,
  events: [
    { type: 'graph.started', threadId: 'run-1', ts: '2026-09-10T00:00:00Z' } as RunSummary['events'][number],
    {
      type: 'graph.interrupt', graphId: 'loop-loop1', threadId: 'run-1', nodeId: 'validation',
      interruptId: 'approval:c1@1', value: approvalValue, ts: '2026-09-10T00:01:00Z',
    } as RunSummary['events'][number],
  ],
  pendingInterruptId: 'approval:c1@1',
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  try { localStorage.clear() } catch { /* ignore */ }
})

// ---------------------------------------------------------------------------
// ApprovalPanel
// ---------------------------------------------------------------------------

describe('ApprovalPanel (jsdom)', () => {
  it('渲染 interrupt payload：prompt/契约摘要/policy/approvers/已等时长/超时策略', () => {
    const w = mount(ApprovalPanel, { props: { run: awaitingRun() } })
    expect(w.find('[data-approval-panel]').exists()).toBe(true)
    expect(w.text()).toContain('Approval required for contract c1')
    expect(w.text()).toContain('fix login') // 契约摘要
    expect(w.text()).toContain('runcenter.approval.policy.all') // policy 走 i18n key
    expect(w.text()).toContain('alice, bob')
    expect(w.text()).toContain('handoff') // onReject 去向
    expect(w.text()).toContain('escalate') // 超时策略
    expect(w.find('.ap-panel__waiting').text()).toContain('runcenter.approval.waiting')
  })

  it('approve → store.resumeRun 携带结构化值；乐观投影立即生效（running/未决关闭）', async () => {
    const store = useRunCenterStore()
    store.runs.push(awaitingRun())
    const w = mount(ApprovalPanel, { props: { run: store.runs[0] } })

    await w.findAll('.ap-panel__decision')[0].trigger('click') // approve

    expect(rest.resumeRun).toHaveBeenCalledWith('run-1', 'approval:c1@1', { decision: 'approved' })
    expect(store.runs[0].status).toBe('running') // 乐观：不等 socket
    expect(store.runs[0].pendingInterruptId).toBeNull()
  })

  it('reject 必填原因：空原因不发请求并提示；填原因后发出 comment', async () => {
    const store = useRunCenterStore()
    store.runs.push(awaitingRun())
    const w = mount(ApprovalPanel, { props: { run: store.runs[0] } })

    await w.findAll('.ap-panel__decision')[1].trigger('click') // reject 空原因
    expect(rest.resumeRun).not.toHaveBeenCalled()
    expect(w.find('.ap-panel__reason-error').exists()).toBe(true)

    await w.find('.ap-panel__reason').setValue('覆盖不足')
    await w.findAll('.ap-panel__decision')[1].trigger('click')
    expect(rest.resumeRun).toHaveBeenCalledWith('run-1', 'approval:c1@1', { decision: 'rejected', comment: '覆盖不足' })
  })

  it('REST 失败显示错误且不误报成功', async () => {
    const store = useRunCenterStore()
    store.runs.push(awaitingRun())
    rest.resumeRun.mockRejectedValueOnce(new Error('policy rejected'))
    const w = mount(ApprovalPanel, { props: { run: store.runs[0] } })
    await w.findAll('.ap-panel__decision')[0].trigger('click')
    await new Promise(r => setTimeout(r, 0)) // 拒绝链路晚一拍落 catch
    expect(w.find('.ap-panel__error').text()).toContain('policy rejected')
    expect(store.runs[0].status).toBe('awaiting-input') // 状态未被误改
  })

  it('日志词汇（graph:history 形状：payload.value + epoch ms）同样渲染——验收主路径回归', () => {
    // 全新打开运行中心的常见场景：run 已 awaiting-input，store 缓冲来自订阅回放的
    // GraphLogEvent（runId/kind/epoch ts/payload），而非实时 graph:event
    const run = awaitingRun({
      events: [
        { runId: 'run-1', kind: 'run.started', ts: 1700000000000, payload: {} },
        {
          runId: 'run-1', kind: 'interrupt.raised', nodeId: 'validation',
          interruptId: 'approval:c1@1', ts: 1700000000060_000,
          payload: { interruptId: 'approval:c1@1', value: approvalValue },
        },
      ],
    } as Partial<RunSummary>)
    const w = mount(ApprovalPanel, { props: { run } })
    expect(w.text()).toContain('Approval required for contract c1')
    // epoch-ms raisedAt 不再 Date.parse 失败——已等时长标签正常渲染
    expect(w.find('.ap-panel__waiting').exists()).toBe(true)
  })

  it('上一轮 resume 为超时自动通过时显示横幅（A2 联动：repair 后新 interrupt 重开）', () => {
    const run = awaitingRun({
      events: [
        { type: 'graph.interrupt', threadId: 'run-1', nodeId: 'validation', interruptId: 'approval:c1@1', value: approvalValue, ts: '2026-09-10T00:01:00Z' },
        { type: 'graph.resume', threadId: 'run-1', interruptId: 'approval:c1@1', resumeValue: { auto: true, decision: 'approved', reason: 'timeout', autoApproved: true }, ts: '2026-09-10T00:02:00Z' },
        { type: 'graph.interrupt', threadId: 'run-1', nodeId: 'validation', interruptId: 'approval:c1@2', value: approvalValue, ts: '2026-09-10T00:03:00Z' },
      ],
      pendingInterruptId: 'approval:c1@2',
    })
    const w = mount(ApprovalPanel, { props: { run } })
    expect(w.find('.ap-panel__auto').text()).toContain('runcenter.approval.autoBanner')
  })

  it('无未决 interrupt → 面板渲染空壳不显示决策按钮', () => {
    const run = awaitingRun({ pendingInterruptId: null, events: [] })
    const w = mount(ApprovalPanel, { props: { run } })
    expect(w.find('[data-approval-panel]').exists()).toBe(true)
    expect(w.findAll('.ap-panel__decision')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// InboxPanel
// ---------------------------------------------------------------------------

describe('InboxPanel (jsdom)', () => {
  it('待处理 tab 列出 pending runs（runId/graphId/等待）；默认展示待处理', () => {
    const w = mount(InboxPanel, {
      props: { pending: [awaitingRun()], archived: [] },
    })
    const rows = w.findAll('.ib-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('run-1')
    expect(rows[0].text()).toContain('loop-loop1')
    expect(w.find('.ib-panel__empty').exists()).toBe(false)
  })

  it('两态切换：点已归档 tab 展示 archived；各自空态文案独立', async () => {
    const w = mount(InboxPanel, {
      props: { pending: [], archived: [awaitingRun({ runId: 'run-archived' })] },
    })
    // 待处理空态
    expect(w.find('.ib-panel__empty').text()).toContain('runcenter.inbox.empty')
    // 切到已归档
    await w.findAll('.ib-panel__tab')[1].trigger('click')
    expect(w.findAll('.ib-row')).toHaveLength(1)
    expect(w.findAll('.ib-row')[0].text()).toContain('run-archived')
    // 已归档空态（切回待处理再断言已归档空态需先清空 archived —— 直接以 props 重挂）
    const w2 = mount(InboxPanel, {
      props: { pending: [awaitingRun()], archived: [] },
    })
    await w2.findAll('.ib-panel__tab')[1].trigger('click')
    expect(w2.find('.ib-panel__empty').text()).toContain('runcenter.inbox.archivedEmpty')
  })

  it('归档/取消归档按钮 emit 对应事件（不改 run 状态——由 store 落 kv）', async () => {
    const w = mount(InboxPanel, {
      props: { pending: [awaitingRun()], archived: [awaitingRun({ runId: 'run-archived' })] },
    })
    await w.find('.ib-row__archive').trigger('click')
    expect(w.emitted('archive')![0][0]).toMatchObject({ runId: 'run-1' })

    await w.findAll('.ib-panel__tab')[1].trigger('click')
    await w.find('.ib-row__archive').trigger('click')
    expect(w.emitted('unarchive')![0][0]).toMatchObject({ runId: 'run-archived' })
  })

  it('展开行渲染 ApprovalPanel（内联审批不进详情页）；detail 按钮 emit detail', async () => {
    const w = mount(InboxPanel, {
      props: { pending: [awaitingRun()], archived: [] },
    })
    expect(w.find('[data-approval-panel]').exists()).toBe(false)
    await w.find('.ib-row__expand').trigger('click')
    expect(w.find('[data-approval-panel]').exists()).toBe(true)

    await w.find('.ib-row__detail').trigger('click')
    expect(w.emitted('detail')![0][0]).toMatchObject({ runId: 'run-1' })
  })
})

// ---------------------------------------------------------------------------
// NodeInspector
// ---------------------------------------------------------------------------

describe('NodeInspector (jsdom)', () => {
  it('未选中节点 → 空态提示', () => {
    const w = mount(NodeInspector, { props: { node: null, events: [], runId: 'run-1' } })
    expect(w.find('.ni-panel__empty').exists()).toBe(true)
  })

  it('attach 档：类型/状态/迭代/耗时 + 最近 update channel 键值', () => {
    const events = [
      { type: 'graph.node-start', nodeId: 'validation', ts: '2026-09-10T00:00:00Z' },
      {
        type: 'graph.node-complete', nodeId: 'validation', ts: '2026-09-10T00:01:30Z',
        result: { update: { verifications: [{ id: 'v1' }], stage: 'validation' }, goto: ['persistence'] },
      },
    ]
    const w = mount(NodeInspector, {
      props: { node: node({ id: 'validation', type: 'phase-validation', status: 'done', iteration: 2, durationMs: 90_000 }), events, runId: 'run-1' },
    })
    expect(w.text()).toContain('validation')
    expect(w.text()).toContain('phase-validation')
    expect(w.text()).toContain('runcenter.graph.nodeStatus.done')
    expect(w.text()).toContain('2') // 迭代（完成次数）
    expect(w.text()).toContain('1m30s') // 耗时
    // channel 键值（socket 词汇真实键值）
    expect(w.find('.ni-panel__update').text()).toContain('verifications')
    expect(w.find('.ni-panel__update').text()).toContain('stage')
    // 关联事件（verbose 档）
    expect(w.findAll('.ni-panel__event')).toHaveLength(2)
  })

  it('事件日志词汇：update 只有键名（日志不落值），不显示值列', () => {
    const events = [
      { kind: 'node.completed', nodeId: 'gate', payload: { updateKeys: ['contracts', 'stage'] }, ts: 1000 },
    ]
    const w = mount(NodeInspector, {
      props: { node: node({ id: 'gate', status: 'done' }), events, runId: 'run-1' },
    })
    expect(w.find('.ni-panel__update').text()).toContain('contracts')
    expect(w.findAll('.ni-panel__update-value')).toHaveLength(0)
  })

  it('failed 节点：人类可读原因 + 建议动作 + 重跑按钮（fork → start 成功提示新 runId）', async () => {
    const events = [
      { type: 'graph.node-start', nodeId: 'gate', ts: '2026-09-10T00:00:00Z' },
      { type: 'graph.node-error', nodeId: 'gate', error: 'gate rejected: coverage 41% < 80%', ts: '2026-09-10T00:00:20Z' },
    ]
    const w = mount(NodeInspector, {
      props: { node: node({ id: 'gate', type: 'loop-gate', status: 'failed' }), events, runId: 'run-1' },
    })
    expect(w.find('.ni-panel__error').text()).toContain('coverage 41% < 80%')
    expect(w.find('.ni-panel__hint').exists()).toBe(true)

    await w.find('.ni-panel__rerun').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(rest.forkRun).toHaveBeenCalledWith('run-1') // superStep 缺省 → 最新 checkpoint
    expect(rest.startRun).toHaveBeenCalledWith('src-fork-1')
    const note = w.find('.ni-panel__rerun-note')
    expect(note.classes()).toContain('ni-panel__rerun-note--ok')
    expect(note.text()).toContain('src-fork-1') // 新 runId 原样可见
  })

  it('重跑失败（fork/start 抛错）显示错误不误报', async () => {
    rest.startRun.mockRejectedValueOnce(new Error('start conflict'))
    const w = mount(NodeInspector, {
      props: { node: node({ id: 'gate', status: 'failed' }), events: [], runId: 'run-1' },
    })
    await w.find('.ni-panel__rerun').trigger('click')
    await new Promise(r => setTimeout(r, 0))
    expect(rest.forkRun).toHaveBeenCalled()
    expect(w.find('.ni-panel__rerun-note').classes()).toContain('ni-panel__rerun-note--error')
    expect(w.find('.ni-panel__rerun-note').text()).toContain('start conflict')
  })
})
