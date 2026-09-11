// overlay/custom/client/loop/graph/__tests__/spec-runtime.test.ts
// P4 T2/T3 — 编辑器节点类型注册表 + 自建 spec 起跑链路（验收门禁：循环内含审批的图成功运行）
import { describe, it, expect } from 'vitest'
import {
  createSpecRuntimeRegistry, validateEditorSpec, CustomSpecRuntime, EditorSpecError,
} from '../../../../server/loop/graph/spec-runtime'
import type { GraphSpec } from '../../../../server/loop/graph/graph-spec'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'

function channels(extra: Record<string, { reducer: string; default?: unknown }> = {}): GraphSpec['channels'] {
  return {
    stopMet: { reducer: 'overwrite', default: false },
    approvalResult: { reducer: 'append', default: [] },
    ...extra,
  }
}

function node(id: string, type: string, config: Record<string, unknown> = {}): GraphSpec['nodes'][number] {
  return { id, type, config }
}

// ---------------------------------------------------------------------------
// 单节点工厂语义
// ---------------------------------------------------------------------------

describe('spec-runtime 节点工厂', () => {
  const registry = createSpecRuntimeRegistry()

  it('function 节点写 config.set 字面量到通道', async () => {
    const n = registry.create('function', { id: 'seed', set: { rounds: 1, worked: true } })
    const r = await n.execute({}, {} as never)
    expect(r.update).toEqual({ rounds: 1, worked: true })
  })

  it('plan 节点首轮 interrupt 携带计划载荷与三出口', async () => {
    const n = registry.create('plan', { id: 'p1', planText: '落地方案 A', todo: ['调研', '实现'] })
    const r = await n.execute({ planResult: [] }, {} as never)
    expect(r.interrupt?.id).toBe('plan:p1@0')
    expect(r.interrupt?.value).toMatchObject({
      kind: 'plan', nodeId: 'p1', planText: '落地方案 A',
      todo: ['调研', '实现'], exits: ['approve-auto', 'approve-stepwise', 'reject'],
    })
    expect(r.goto).toEqual(['p1']) // 自路由：resume 后重入消费裁决
  })

  it('plan 批准（默认 auto 档）写三通道，无 goto', async () => {
    const n = registry.create('plan', { id: 'p1', planText: '原始' })
    const r = await n.execute({ [`__resume:plan:p1@0`]: { decision: 'approve' } }, {} as never)
    expect(r.update).toMatchObject({ planDecision: 'approve', planMode: 'auto' })
    expect(r.goto).toBeUndefined()
  })

  it('plan 批准 stepwise 档 + 改计划文本（计划是数据）', async () => {
    const n = registry.create('plan', { id: 'p1', planText: '原始' })
    const r = await n.execute(
      { [`__resume:plan:p1@0`]: { decision: 'approve', mode: 'stepwise', planText: '改后的计划' } },
      {} as never,
    )
    expect(r.update).toMatchObject({
      planDecision: 'approve', planMode: 'stepwise',
      planResult: [{ nodeId: 'p1', decision: 'approve', mode: 'stepwise', planText: '改后的计划' }],
    })
  })

  it('plan 打回（reject）按 onReject 路由；fail 档抛错', async () => {
    const n = registry.create('plan', { id: 'p1', onReject: 'rework' })
    const r = await n.execute({ [`__resume:plan:p1@0`]: { decision: 'reject' } }, {} as never)
    expect(r.goto).toEqual(['rework'])
    expect(r.update).toMatchObject({ planDecision: 'reject' })
    const failing = registry.create('plan', { id: 'p1' })
    await expect(failing.execute(
      { [`__resume:plan:p1@0`]: { decision: 'reject' } }, {} as never,
    )).rejects.toThrow(/onReject=fail/)
  })

  it('plan 非法 resume.decision 抛清晰错误', async () => {
    const n = registry.create('plan', { id: 'p1' })
    await expect(n.execute({ [`__resume:plan:p1@0`]: { decision: 'maybe' } }, {} as never))
      .rejects.toThrow(/decision must be/)
  })

  it('bo-n-variant 追加候选；converge score 档自动选优', async () => {
    const v = registry.create('bo-n-variant', { id: 'v1', collectChannel: 'boN.candidates', variant: 'A', score: 3 })
    const rv = await v.execute({}, {} as never)
    expect(rv.update?.['boN.candidates']).toEqual([
      expect.objectContaining({ variant: 'A', score: 3 }),
    ])
    const c = registry.create('converge', {
      id: 'pick', expect: 2, collectChannel: 'boN.candidates', winnerChannel: 'boN.winner', pick: 'score',
    })
    const rc = await c.execute({
      'boN.candidates': [
        { variant: 'A', score: 3 }, { variant: 'B', score: 7 },
      ],
      'boN.winner': [],
    }, {} as never)
    expect(rc.update?.['boN.winner']).toMatchObject([{ pick: 'score', index: 1, winner: { variant: 'B', score: 7 } }])
  })

  it('converge human 档 interrupt 列变体，resume {pick} 定选', async () => {
    const c = registry.create('converge', {
      id: 'pick', expect: 2, collectChannel: 'boN.candidates', winnerChannel: 'boN.winner', pick: 'human',
    })
    const first = await c.execute({
      'boN.candidates': [{ variant: 'A', score: 1 }, { variant: 'B', score: 2 }],
      'boN.winner': [],
    }, {} as never)
    expect(first.interrupt?.value).toMatchObject({ kind: 'best-of-n', nodeId: 'pick', expect: 2 })
    expect(first.goto).toEqual(['pick'])
    const resumed = await c.execute({
      'boN.candidates': [{ variant: 'A', score: 1 }, { variant: 'B', score: 2 }],
      'boN.winner': [],
      [`__resume:bo-n:pick@0`]: { pick: 0 },
    }, {} as never)
    expect(resumed.update?.['boN.winner']).toMatchObject([{ pick: 'human', index: 0, winner: { variant: 'A', score: 1 } }])
  })

  it('converge 候选不足抛清晰错误（join 屏障失效自检）', async () => {
    const c = registry.create('converge', { id: 'pick', expect: 3, collectChannel: 'c', winnerChannel: 'w', pick: 'score' })
    await expect(c.execute({ c: [{}, {}], w: [] }, {} as never)).rejects.toThrow(/expected 3 candidates/)
  })

  it('gate 命令白名单：未配置白名单时有命令即拒；白名单内放行', async () => {
    const bare = createSpecRuntimeRegistry()
    await expect(bare.create('gate', { id: 'g', command: 'npm test' }).execute({}, {} as never))
      .rejects.toThrow(/not in whitelist/)
    const withList = createSpecRuntimeRegistry({ gateCommands: ['npm test'] })
    const r = await withList.create('gate', { id: 'g', command: 'npm test' }).execute({}, {} as never)
    expect(r.update).toEqual({ 'g.gatePassed': true })
  })
})

// ---------------------------------------------------------------------------
// validateEditorSpec
// ---------------------------------------------------------------------------

describe('validateEditorSpec', () => {
  it('plan 节点缺通道报错并列出缺失', () => {
    const spec: GraphSpec = {
      id: 's', version: 1, channels: channels(), nodes: [node('p', 'plan', { planText: 'x' })],
      edges: [], entryNode: 'p', limits: { maxSteps: 10 },
    }
    expect(() => validateEditorSpec(spec)).toThrow(/planResult.*planDecision.*planMode/)
  })

  it('fanout 少于 2 条无条件出边报错', () => {
    const spec: GraphSpec = {
      id: 's', version: 1, channels: channels(),
      nodes: [node('f', 'fanout'), node('a', 'function', { set: {} }), node('b', 'function', { set: {} })],
      edges: [
        { from: 'f', to: 'a' }, { from: 'f', to: 'b', condition: { op: 'truthy', path: 'stopMet' } },
      ],
      entryNode: 'f', limits: { maxSteps: 10 },
    }
    expect(() => validateEditorSpec(spec)).toThrow(/>= 2 unconditional out-edges/)
  })

  it('converge/variant 未声明通道报错', () => {
    const spec: GraphSpec = {
      id: 's', version: 1, channels: channels(),
      nodes: [node('c', 'converge', { expect: 2 })],
      edges: [], entryNode: 'c', limits: { maxSteps: 10 },
    }
    expect(() => validateEditorSpec(spec)).toThrow(/boN\.candidates.*boN\.winner/)
  })

  it('合法 Best-of-N 骨架通过', () => {
    const spec: GraphSpec = {
      id: 's', version: 1,
      channels: channels({ 'boN.candidates': { reducer: 'append', default: [] }, 'boN.winner': { reducer: 'append', default: [] } }),
      nodes: [
        node('f', 'fanout'),
        node('a', 'bo-n-variant', { collectChannel: 'boN.candidates', variant: 'A', score: 1 }),
        node('b', 'bo-n-variant', { collectChannel: 'boN.candidates', variant: 'B', score: 2 }),
        node('pick', 'converge', { expect: 2, collectChannel: 'boN.candidates', winnerChannel: 'boN.winner', pick: 'score' }),
      ],
      edges: [
        { from: 'f', to: 'a' }, { from: 'f', to: 'b' },
        { from: 'a', to: 'pick' }, { from: 'b', to: 'pick' },
      ],
      entryNode: 'f', limits: { maxSteps: 20 },
    }
    expect(() => validateEditorSpec(spec)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 起跑链路（验收门禁：循环内含审批的图成功运行）
// ---------------------------------------------------------------------------

describe('CustomSpecRuntime 起跑链路', () => {
  function makeService(): GraphService {
    return new GraphService({ eventLog: new InMemoryEventLogStore() })
  }

  /** 验收形状：seed → work → approval(human) → done；done→seed 守卫回边（循环内含审批） */
  function acceptanceSpec(): GraphSpec {
    return {
      id: 'editor-acceptance', version: 1, origin: 'editor',
      description: '循环内含审批（P4 验收门禁）',
      channels: channels(),
      nodes: [
        node('seed', 'function', { set: { rounds: 1 } }),
        node('work', 'function', { set: { worked: true } }),
        node('approval', 'human', { prompt: '批准完成？', approvals: { policy: 'any' } }),
        node('done', 'function', { set: { stopMet: true } }),
      ],
      edges: [
        { from: 'seed', to: 'work' },
        { from: 'work', to: 'approval' },
        { from: 'approval', to: 'done' },
        { from: 'done', to: 'seed', guard: { maxIterations: 2 } }, // loop 容器：守卫回边
      ],
      entryNode: 'seed',
      endCondition: { op: 'truthy', path: 'stopMet' },
      limits: { maxSteps: 20 },
    }
  }

  it('循环内含审批：interrupt 暂停 → 批准 → 终止条件收敛（spec §10 P4 验收）', async () => {
    const eventLog = new InMemoryEventLogStore()
    const service = new GraphService({ eventLog })
    const spec = acceptanceSpec()
    const store = new Map<string, GraphSpec>([[spec.id, spec]])
    const runtime = new CustomSpecRuntime({ specStore: { get: id => store.get(id) }, graphService: service })

    const { runId, instance } = await runtime.startRun(spec.id)
    expect(instance.status).toBe('awaiting-input') // 审批 interrupt 挂起
    const cp = await eventLog.getLatestCheckpoint(runId)
    const interruptId = cp?.pendingInterrupts[0]?.id
    expect(interruptId).toMatch(/^approval:approval@/)

    const after = await service.resumeRun(runId, interruptId!, { approved: true, approver: 'pm' })
    expect(after.status).toBe('completed') // 批准 → done 写 stopMet → endCondition 收敛
    expect(after.state).toMatchObject({ stopMet: true, worked: true })
  })

  it('Best-of-N fan-out 全链：并行变体 → score 收敛 → 终止', async () => {
    const service = makeService()
    const spec: GraphSpec = {
      id: 'editor-bon', version: 1, origin: 'editor',
      channels: channels({
        'boN.candidates': { reducer: 'append', default: [] },
        'boN.winner': { reducer: 'append', default: [] },
      }),
      nodes: [
        node('start', 'function', { set: { go: true } }),
        node('fanout', 'fanout'),
        node('a', 'bo-n-variant', { collectChannel: 'boN.candidates', variant: 'A', score: 3 }),
        node('b', 'bo-n-variant', { collectChannel: 'boN.candidates', variant: 'B', score: 9 }),
        node('pick', 'converge', { expect: 2, collectChannel: 'boN.candidates', winnerChannel: 'boN.winner', pick: 'score', join: true }),
        node('end', 'function', { set: { stopMet: true } }),
      ],
      edges: [
        { from: 'start', to: 'fanout' },
        { from: 'fanout', to: 'a' }, { from: 'fanout', to: 'b' },
        { from: 'a', to: 'pick' }, { from: 'b', to: 'pick' },
        { from: 'pick', to: 'end' },
      ],
      entryNode: 'start',
      endCondition: { op: 'truthy', path: 'stopMet' },
      limits: { maxSteps: 20 },
    }
    spec.nodes[4].joinMode = 'all' // join 屏障：两分支齐了才收敛
    const store = new Map<string, GraphSpec>([[spec.id, spec]])
    const runtime = new CustomSpecRuntime({ specStore: { get: id => store.get(id) }, graphService: service })

    const { runId, instance } = await runtime.startRun(spec.id)
    expect((instance as { status: string }).status).toBe('completed')
    const final = await service.getRun(runId)
    const winners = (final?.instance.state as Record<string, unknown>)?.['boN.winner'] as Array<unknown>
    expect(winners).toMatchObject([{ pick: 'score', index: 1, winner: { variant: 'B', score: 9 } }])
  })

  it('spec 不存在 / 校验失败抛 EditorSpecError', async () => {
    const service = makeService()
    const runtime = new CustomSpecRuntime({ specStore: { get: () => undefined }, graphService: service })
    await expect(runtime.startRun('ghost')).rejects.toThrow(EditorSpecError)
    const bad: GraphSpec = {
      id: 'bad', version: 1, channels: channels(), nodes: [node('p', 'plan', {})],
      edges: [], entryNode: 'p', limits: { maxSteps: 5 },
    }
    const store = new Map<string, GraphSpec>([[bad.id, bad]])
    const rt2 = new CustomSpecRuntime({ specStore: { get: id => store.get(id) }, graphService: service })
    await expect(rt2.startRun('bad')).rejects.toThrow(/planResult/)
  })
})
