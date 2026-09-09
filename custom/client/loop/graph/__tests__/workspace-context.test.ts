// P1 Task 5 — R2 Workspace 上下文注入：GRAPH-CONTEXT.md 物化 + agent 引用 + 上游摘要
import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  writeGraphContext, ensureAgentReference, summarizeUpstream, type GraphContextInput,
} from '../../../../server/loop/graph/workspace-context'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { CH, createPhaseNode, type PhaseNodeDeps } from '../../../../server/loop/graph/phase-nodes'
import type { NodeContext } from '../../../../server/loop/graph/types'
import type { LoopInstance, TaskContract } from '../../../../server/loop/types'

function makeCtx(over: Partial<GraphContextInput> = {}): GraphContextInput {
  return {
    goal: 'Ship the release',
    nodeId: 'handoff', nodeLabel: 'L:handoff',
    iteration: 2,
    upstreamSummary: 'discovery(contracts)',
    completionCriteria: 'verifications all passed',
    budgetLeft: { steps: 87, cost: 5.5 },
    runUrl: 'http://app/runs/r1',
    ...over,
  }
}

describe('writeGraphContext', () => {
  it('materializes GRAPH-CONTEXT.md with all six R2 elements and the do-not-edit marker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gctx-'))
    await writeGraphContext(dir, makeCtx())
    const content = await readFile(join(dir, 'GRAPH-CONTEXT.md'), 'utf-8')

    expect(content).toContain('自动生成，勿手改')
    expect(content).toContain('Ship the release')
    expect(content).toContain('handoff/L:handoff')
    expect(content).toContain('第 2 轮迭代')
    expect(content).toContain('discovery(contracts)')
    expect(content).toContain('verifications all passed')
    expect(content).toContain('87')
    expect(content).toContain('5.5')
    expect(content).toContain('http://app/runs/r1')
  })

  it('is idempotent: second write replaces, never appends', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gctx-'))
    await writeGraphContext(dir, makeCtx())
    await writeGraphContext(dir, makeCtx({ iteration: 3 }))
    const content = await readFile(join(dir, 'GRAPH-CONTEXT.md'), 'utf-8')

    expect(content).toContain('第 3 轮迭代')
    expect(content.match(/目标（goal）/g)?.length).toBe(1)
  })
})

describe('ensureAgentReference', () => {
  it('creates CLAUDE.md/AGENTS.md with the reference line when missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gctx-'))
    await ensureAgentReference(dir)
    expect(await readFile(join(dir, 'CLAUDE.md'), 'utf-8')).toContain('@GRAPH-CONTEXT.md')
    expect(await readFile(join(dir, 'AGENTS.md'), 'utf-8')).toContain('@GRAPH-CONTEXT.md')
  })

  it('appends to existing files and never duplicates the reference', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gctx-'))
    await writeFile(join(dir, 'CLAUDE.md'), '# existing\n', 'utf-8')
    await ensureAgentReference(dir)
    await ensureAgentReference(dir)
    const content = await readFile(join(dir, 'CLAUDE.md'), 'utf-8')

    expect(content.startsWith('# existing\n')).toBe(true)
    expect(content.match(/@GRAPH-CONTEXT\.md/g)?.length).toBe(1)
  })
})

describe('summarizeUpstream', () => {
  it('aggregates latest node.completed updates per node (excluding the target node), capped at 500 chars', async () => {
    const log = new InMemoryEventLogStore()
    await log.append({ runId: 'r1', graphId: 'g', ts: 1, kind: 'node.completed', nodeId: 'discovery', payload: { updateKeys: ['contracts', 'stage'] } })
    await log.append({ runId: 'r1', graphId: 'g', ts: 2, kind: 'node.completed', nodeId: 'validation', payload: { updateKeys: ['verifications', 'repairNeeded'] } })
    // 同一节点后来的 completed 覆盖早先的（repair 循环）
    await log.append({ runId: 'r1', graphId: 'g', ts: 3, kind: 'node.completed', nodeId: 'validation', payload: { updateKeys: ['verifications'] } })
    // 目标节点自身与无关事件排除
    await log.append({ runId: 'r1', graphId: 'g', ts: 4, kind: 'node.completed', nodeId: 'handoff', payload: { updateKeys: ['x'] } })
    await log.append({ runId: 'r1', graphId: 'g', ts: 5, kind: 'node.started', nodeId: 'gate', payload: {} })

    const summary = await summarizeUpstream(log, 'r1', 'handoff')

    expect(summary).toContain('discovery')
    expect(summary).toContain('contracts, stage')
    expect(summary).toContain('validation(verifications)')
    expect(summary).not.toContain('handoff(x)')
    expect(summary.length).toBeLessThanOrEqual(500)
  })
})

describe('handoff integration (R2 injection point)', () => {
  function handoffDeps(over: { inject?: PhaseNodeDeps['injectWorkspaceContext'] } = {}) {
    const loop: LoopInstance = {
      id: 'loop-1', name: 'L', goal: 'g', stopCondition: '', pattern: 'daily-triage',
      schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'scheduling', status: 'idle',
      autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
      lastTickAt: null, nextTickAt: null,
      budget: { maxCostPerTick: 1, maxCostTotal: 10, killMode: 'notify', warningThreshold: 0.8 },
      stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    }
    const contract: TaskContract = {
      id: 'task/a', loopId: 'loop-1',
      source: { type: 'git-commit', ref: 's', summary: 'a', rawPayload: null },
      readPlan: { requiredReads: [] }, writeBoundary: [],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'report', requiredFiles: [] },
      worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    }
    const calls: string[] = []
    const deps = {
      dryRun: false,
      connectors: [],
      store: { updateLoop: async () => {}, updateContract: async () => {} },
      worktreeManager: { create: async (c: TaskContract) => { calls.push(`create:${c.id}`); return `wt-${c.id}` } },
      dispatcher: { dispatch: async (c: TaskContract) => { calls.push(`dispatch:${c.id}`) } },
      verifier: { verify: async () => { throw new Error('not used') } },
      persistence: { persist: async () => 'a' },
      log: () => {},
      injectWorkspaceContext: over.inject ?? (async (c: TaskContract, wt: string) => { calls.push(`ctx:${c.id}:${wt}`) }),
    } as unknown as PhaseNodeDeps
    const node = createPhaseNode('handoff', loop, deps)
    const ctx = { graphId: 'g', threadId: 't', nodeId: 'handoff', superStep: 1, deps: { emitEvent: () => {} } } as unknown as NodeContext
    return { node, ctx, calls, deps, loop, contract }
  }

  it('injects workspace context after worktree creation and before dispatch', async () => {
    const { node, ctx, calls, contract } = handoffDeps()
    await node.execute({ [CH.contracts]: [contract] }, ctx)
    expect(calls).toEqual(['create:task/a', 'ctx:task/a:wt-task/a', 'dispatch:task/a'])
  })

  it('context injection failure warns but never blocks dispatch (R5: context is enhancement, not dependency)', async () => {
    const { node, ctx, calls, contract } = handoffDeps({
      inject: async () => { throw new Error('disk full') },
    })
    await node.execute({ [CH.contracts]: [contract] }, ctx)
    expect(calls.filter(c => c.startsWith('dispatch:'))).toHaveLength(1)
  })
})
