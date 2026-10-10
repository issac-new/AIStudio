// overlay/custom/client/ia2/__tests__/orchestration.test.ts
// 任务协同图数据面守门（2026-10-10 麦肯锡概念一轮）：纯函数层锚点——
// 执行者分类口径、控制点判定、根卡推导、树构建（防环/悬空引用）、
// 五问推导（估算覆盖率诚实口径）、分层布局（环兜底不死循环）。
import { describe, it, expect } from 'vitest'
import {
  classifyExecutor, controlPointReasons, deriveMissionRoots, buildMissionTree,
  deriveFiveQuestions, layoutMissionDag,
  type OrchTaskRaw, type AutonomyEntry, type EscalationRecord, type StoredSpecSummary,
} from '../api/orchestration'

const t = (over: Partial<OrchTaskRaw>): OrchTaskRaw => ({
  id: 'x', title: 'x', status: 'todo', assignee: null, ...over,
})

describe('classifyExecutor（-agent 后缀口径）', () => {
  it('后缀判 agent；空判未指派；其余判人', () => {
    expect(classifyExecutor('chen-agent')).toBe('agent')
    expect(classifyExecutor('chen')).toBe('human')
    expect(classifyExecutor(null)).toBe('unassigned')
    expect(classifyExecutor(undefined)).toBe('unassigned')
  })
})

describe('controlPointReasons', () => {
  const ladder = new Map<string, AutonomyEntry>([
    ['wei-agent', { target: 'wei-agent', level: 'assist', approvalPoints: ['merge'], maxRiskTier: 'medium' }],
  ])
  it('RACI 审批人 / review 状态 / 阶梯审批点三源各自命中', () => {
    expect(controlPointReasons(t({ raci: { approver: 'bella' } }), ladder)).toEqual(['RACI 审批人：bella'])
    expect(controlPointReasons(t({ status: 'review' }), ladder)).toEqual(['处于 review 状态，待人复核'])
    expect(controlPointReasons(t({ assignee: 'wei-agent' }), ladder)[0]).toContain('审批点 1 处')
  })
  it('三源皆无 → 非控制点（空理由）', () => {
    expect(controlPointReasons(t({ assignee: 'chen' }), ladder)).toEqual([])
  })
})

describe('deriveMissionRoots', () => {
  it('无父有子才是根；树大在前；有父或有子缺失的不算', () => {
    const roots = deriveMissionRoots([
      t({ id: 'r1', title: '大链', children: ['a', 'b', 'a2'] }),
      t({ id: 'a', parents: ['r1'], children: ['a2'] }),
      t({ id: 'a2', parents: ['r1', 'a'] }),
      t({ id: 'b', parents: ['r1'] }),
      t({ id: 'r2', title: '小链', children: ['c'] }),
      t({ id: 'c', parents: ['r2'] }),
      t({ id: '孤儿', parents: [], children: [] }),
    ])
    expect(roots.map(r => r.taskId)).toEqual(['r1', 'r2'])
    expect(roots[0]).toMatchObject({ treeSize: 4, childCount: 3 })
    expect(roots[1]).toMatchObject({ treeSize: 2 })
  })
  it('环引用不炸（visited 截断）', () => {
    const roots = deriveMissionRoots([
      t({ id: 'p', children: ['q'] }),
      t({ id: 'q', parents: ['p'], children: ['p'] }),
    ])
    expect(roots.map(r => r.taskId)).toEqual(['p'])
  })
})

describe('buildMissionTree', () => {
  const ladder = new Map<string, AutonomyEntry>()
  it('双向 BFS 收全树；悬空引用跳过；控制点落节点', () => {
    const { nodes, edges } = buildMissionTree('r', [
      t({ id: 'r', children: ['c1', 'ghost'] }),
      t({ id: 'c1', parents: ['r'], assignee: 'hu-agent', estimate_days: 0.5 }),
      t({ id: 'c0', parents: ['r'], status: 'review' }), // c0 是 r 的子但 r.children 漏记——parents 边补收
    ], ladder)
    const ids = nodes.map(n => n.taskId).sort()
    expect(ids).toEqual(['c0', 'c1', 'r'])
    expect(edges).toContainEqual({ from: 'r', to: 'c0' })
    const c1 = nodes.find(n => n.taskId === 'c1')!
    expect(c1.executor).toBe('agent')
    expect(c1.estimateDays).toBe(0.5)
    expect(nodes.find(n => n.taskId === 'c0')!.controlReasons.length).toBeGreaterThan(0)
  })
})

describe('deriveFiveQuestions', () => {
  const ladder = new Map<string, AutonomyEntry>()
  const tasks: OrchTaskRaw[] = [
    t({ id: 'r', title: '支付对账提速', assignee: 'bella', children: ['c1', 'c2'], raci: { approver: 'mei' } }),
    t({ id: 'c1', parents: ['r'], assignee: 'hu-agent', estimate_days: 1.0 }),
    t({ id: 'c2', parents: ['r'], assignee: 'chen', estimate_days: 0.5 }),
    t({ id: 'c3', parents: ['r'], assignee: null }),
  ]
  const tree = buildMissionTree('r', tasks, ladder)
  const esc: EscalationRecord[] = [
    { escalationId: 'e1', fromAgent: 'hu-agent', urgency: 'urgent', reason: '需要生产库只读权限', taskId: 'c1', state: 'pending' },
    { escalationId: 'e2', fromAgent: 'x-agent', urgency: 'normal', reason: '无关任务', taskId: 'other', state: 'pending' },
    { escalationId: 'e3', fromAgent: 'y-agent', urgency: 'normal', reason: '已决', taskId: 'c1', state: 'approved' },
  ]
  const specs: StoredSpecSummary[] = [
    { id: 's1', version: 1, spec: { id: 's1', origin: 'template', meta: { goal: '支付回归图' } } },
    { id: 's2', version: 1, spec: { id: 's2', origin: 'editor' } },
  ]

  it('五问各字段如实：负责人/审批人、人机卡数与人日、覆盖率、关联升级、模板资产', () => {
    const q = deriveFiveQuestions(tree, { id: 'r', title: '支付对账提速', status: 'todo', owner: 'bella', approver: 'mei' }, esc, specs)
    expect(q.outcome).toMatchObject({ owner: 'bella', approver: 'mei', taskCount: 4 })
    expect(q.division).toMatchObject({ human: 2, agent: 1, unassigned: 1, humanDays: 0.5, agentDays: 1.0 })
    expect(q.division.coverage).toBeCloseTo(2 / 4)
    expect(q.escalation).toMatchObject({ pendingTotal: 2, linkedToMission: 1 })
    expect(q.escalation.examples[0]).toMatchObject({ fromAgent: 'hu-agent' })
    expect(q.assets.specs.map(s => s.id)).toEqual(['s1']) // editor origin 不入资产列
  })
  it('无控制点/无升级时给空态而非 undefined 崩', () => {
    // 独立最小链（无 RACI/无 review/无阶梯）：控制点与升级才是真空态
    const plain: OrchTaskRaw[] = [
      t({ id: 'p', assignee: 'chen', children: ['q'] }),
      t({ id: 'q', parents: ['p'], assignee: 'hu-agent' }),
    ]
    const plainTree = buildMissionTree('p', plain, ladder)
    const q = deriveFiveQuestions(plainTree, { id: 'p', title: 'x', status: 'todo', owner: 'chen', approver: null }, [], [])
    expect(q.checkpoints.length).toBe(0)
    expect(q.escalation.pendingTotal).toBe(0)
    expect(q.assets.specs).toEqual([])
  })
})

describe('layoutMissionDag', () => {
  it('根居上层、子按层下探；每层水平铺开不重叠', () => {
    const pos = layoutMissionDag('r', [
      { from: 'r', to: 'a' }, { from: 'r', to: 'b' }, { from: 'a', to: 'c' },
    ])
    expect(pos.get('r')!.y).toBe(0)
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y).toBe(130)
    expect(pos.get('c')!.y).toBe(260)
    expect(pos.get('a')!.x).not.toBe(pos.get('b')!.x)
  })
  it('环边不死循环（深度上限 + 兜底层）', () => {
    const pos = layoutMissionDag('r', [{ from: 'r', to: 'a' }, { from: 'a', to: 'r' }])
    expect(pos.has('r')).toBe(true)
    expect(pos.has('a')).toBe(true)
  })
})
