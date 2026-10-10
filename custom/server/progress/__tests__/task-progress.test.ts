// 研发任务进度域测试：聚合口径（任务关联/阶段时间线/活跃判定/冷窗如实）+ REST 信封。
import { describe, expect, it } from 'vitest'
import { taskProgressOverview } from '../task-progress-analytics'
import type { DispatchLedgerEntry } from '../../governance/dispatch-ledger'
import type { ProjectionSession } from '../../zcode/session-projection'

function entry(over: Partial<DispatchLedgerEntry>): DispatchLedgerEntry {
  return { ts: 1000, kind: 'mention', target: 'zcode', reason: 'queued', ...over } as DispatchLedgerEntry
}

function session(over: Partial<ProjectionSession>): ProjectionSession {
  return { sessionId: 's1', ...over } as ProjectionSession
}

describe('taskProgressOverview 聚合口径', () => {
  const ledger: DispatchLedgerEntry[] = [
    entry({ taskId: 't_aaa', target: 'zcode', reason: 'queued', sessionId: 's1', ts: 100, workspaceId: '/ws/a' }),
    entry({ taskId: 't_aaa', target: 'zcode', reason: 'command_rejected', ts: 200 }),
    entry({ taskId: 't_aaa', target: 'zcode', reason: 'coalesced', sessionId: 's1', ts: 300 }),
    entry({ taskId: 't_bbb', target: 'hu-agent', reason: 'queued', sessionId: 's2', ts: 400 }),
    entry({ taskId: undefined, reason: 'queued', ts: 500 }), // 无 taskId 的旧条目不进聚合
  ]

  it('任务分组与派发计数：queued+coalesced 计成功，command_rejected 不计', () => {
    const r = taskProgressOverview(ledger, new Map())
    expect(r.total).toBe(2)
    const aaa = r.tasks.find((t) => t.taskId === 't_aaa')!
    expect(aaa.dispatchCount).toBe(3)
    expect(aaa.dispatchOkCount).toBe(2)
    expect(aaa.lastDispatchAt).toBe(300)
    expect(aaa.sessionId).toBe('s1')
  })

  it('会话面联表：阶段时间线/当前阶段/活跃判定来自最近成功派发的会话', () => {
    const sessions = new Map<string, ProjectionSession>([
      ['s1', session({
        sessionId: 's1', phase: 'running', goalStatus: 'verifying', lastActivityAt: 999,
        workflowActivity: { runs: [{ runId: 'r1', status: 'running', startedAt: 90, currentPhase: '编码实现', phases: [
          { name: '需求理解', status: 'done' }, { name: '编码实现', status: 'running' }, { name: '测试验证', status: 'pending' },
        ] }] },
      })],
      ['s2', session({ sessionId: 's2', phase: 'completedSuccess', sessionEnded: true })],
    ])
    const r = taskProgressOverview(ledger, sessions)
    const aaa = r.tasks.find((t) => t.taskId === 't_aaa')!
    expect(aaa.sessionKnown).toBe(true)
    expect(aaa.phases.map((p) => `${p.name}:${p.status}`)).toEqual(['需求理解:done', '编码实现:running', '测试验证:pending'])
    expect(aaa.currentPhase).toBe('编码实现')
    expect(aaa.goalStatus).toBe('verifying')
    expect(aaa.active).toBe(true)
    const bbb = r.tasks.find((t) => t.taskId === 't_bbb')!
    expect(bbb.active).toBe(false) // completedSuccess+ended
    expect(r.activeCount).toBe(1)
  })

  it('冷窗如实：会话存储查不到 → sessionKnown=false 不编造阶段；activeOnly 过滤', () => {
    const r = taskProgressOverview(ledger, new Map())
    expect(r.tasks.every((t) => !t.sessionKnown)).toBe(true)
    expect(r.tasks.every((t) => t.phases.length === 0)).toBe(true)
    expect(r.sessionPendingCount).toBe(2)
    const active = taskProgressOverview(ledger, new Map(), { activeOnly: true })
    expect(active.total).toBe(0)
  })

  it('活跃任务排前；limit 截断', () => {
    const sessions = new Map([['s1', session({ sessionId: 's1', phase: 'running' })]])
    const r = taskProgressOverview(ledger, sessions)
    expect(r.tasks[0]!.taskId).toBe('t_aaa')
    expect(taskProgressOverview(ledger, sessions, { limit: 1 }).tasks.length).toBe(1)
  })
})

describe('task-progress REST 信封（控制器）', () => {
  it('路由前缀与任务端点在位', async () => {
    const mod = await import('../task-progress-controller')
    expect(mod.progressRoutes).toBeTruthy()
    // prefix 断言：koa-router 暴露 opts；不整 boot koa（重），契约由挂载 patch+走查覆盖。
    expect(String((mod.progressRoutes as unknown as { opts?: { prefix?: string } }).opts?.prefix)).toBe('/api/progress')
  })
})

describe('里程碑联合（消费收口）', () => {
  const ledger2: DispatchLedgerEntry[] = [
    entry({ taskId: 't_manual', target: 'zcode', reason: 'queued', sessionId: 's9', ts: 100, workspaceId: '/ws/manual' }),
  ]
  it('无引擎站点面时以 --task 归卡里程碑回退 currentPhase；非本卡条目不入', () => {
    const idx = new Map([['/ws/manual', [
      { ts: '2026-10-10T10:00:00Z', milestone: '需求理解', status: 'done', note: '四要素过', task: 't_manual' },
      { ts: '2026-10-10T11:00:00Z', milestone: '编码实现', status: 'done', note: 'T01 全绿', task: 't_manual' },
      { ts: '2026-10-10T11:30:00Z', milestone: '测试验证', status: 'started', task: 't_other' },
    ]]])
    const r = taskProgressOverview(ledger2, new Map(), { milestonesByWorkspace: idx })
    const m = r.tasks.find((x) => x.taskId === 't_manual')!
    expect(m.milestones.length).toBe(2)
    expect(m.milestones[1]!.milestone).toBe('编码实现')
    expect(m.currentPhase).toBe('编码实现') // 引擎面缺席 → 最近里程碑回退
    expect(m.phases.length).toBe(0)
  })
  it('引擎站点面在位时 currentPhase 不被里程碑覆盖', () => {
    const sessions = new Map([['s9', session({ sessionId: 's9', phase: 'running', workflowActivity: { runs: [{ runId: 'r1', status: 'running', currentPhase: '站点X', phases: [{ name: '站点X', status: 'running' }] }] } })]])
    const idx = new Map([['/ws/manual', [{ ts: '2026-10-10T10:00:00Z', milestone: '需求理解', status: 'done', task: 't_manual' }]]])
    const r = taskProgressOverview(ledger2, sessions, { milestonesByWorkspace: idx })
    expect(r.tasks[0]!.currentPhase).toBe('站点X')
  })
  it('里程碑文件读取：工作区根+wt-* 兄弟，坏行跳过有界', async () => {
    const { readWorkspaceMilestones } = await import('../task-progress-store')
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = mkdtempSync(join(tmpdir(), 'ms-'))
    mkdirSync(join(root, 'wsA', '.swarm-yuan'), { recursive: true })
    writeFileSync(join(root, 'wsA', '.swarm-yuan', 'milestones.jsonl'),
      '{"ts":"2026-10-10T10:00:00Z","milestone":"需求理解","status":"done","task":"t_a"}\nnot-json\n')
    mkdirSync(join(root, 'wt-t_a', '.swarm-yuan'), { recursive: true })
    writeFileSync(join(root, 'wt-t_a', '.swarm-yuan', 'milestones.jsonl'),
      '{"ts":"2026-10-10T12:00:00Z","milestone":"测试验证","status":"done","task":"t_a"}\n')
    const got = readWorkspaceMilestones(join(root, 'wsA'))
    expect(got.length).toBe(2)
    expect(got[0]!.milestone).toBe('需求理解')
    expect(got[1]!.milestone).toBe('测试验证')
  })
})
