// overlay/custom/server/__tests__/zcode-workflow-routes.test.ts
// workflow 集成轮守门：/api/zcode-engine/workflow/* 四条 GET 的参数校验、
// 归属闸（403 invocation_not_allowed）、引擎 RPC 透传（runs/run-events/saved/
// saved-runs）、引擎离线 503 engine_unreachable 词表。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runtimeMock = vi.hoisted(() => {
  const state = {
    agentCalls: [] as string[],
    workflowRuns: [{ runId: 'r1', status: 'running' }],
    runEvents: [{ sequence: 1, type: 'run-launched' }],
    savedList: [{ name: 'zcode-loop-graph' }],
    savedRuns: [{ runId: 'dwfrun-1', status: 'completed' }],
    err: null as Error | null,
  }
  const runtime = {
    async withAgent(fn: (agent: unknown) => Promise<unknown>) {
      if (state.err) throw state.err
      return fn({
        conversationWorkflowRunsV4: async (p: Record<string, unknown>) => {
          state.agentCalls.push(`runs:${JSON.stringify(p)}`)
          return { runs: state.workflowRuns }
        },
        conversationWorkflowRunEventsV4: async (p: Record<string, unknown>) => {
          state.agentCalls.push(`events:${JSON.stringify(p)}`)
          return { events: state.runEvents }
        },
        listSavedWorkflows: async (p: Record<string, unknown>) => {
          state.agentCalls.push(`saved:${JSON.stringify(p)}`)
          return { workflows: state.savedList }
        },
        listSavedWorkflowRuns: async (p: Record<string, unknown>) => {
          state.agentCalls.push(`savedRuns:${JSON.stringify(p)}`)
          return { runs: state.savedRuns }
        },
      })
    },
  }
  return { state, runtime }
})

vi.mock('../zcode/projection-runtime', () => ({
  getZcodeProjectionRuntime: () => runtimeMock.runtime,
}))

import { zcodeEngineRoutes } from '../zcode/engine-controller'
import { setWorkspaceAccessDepsForTests } from '../zcode/workspace-access'

type Handler = (ctx: Record<string, unknown>) => Promise<void>

function handlerFor(method: string, path: string): Handler {
  const layers = (zcodeEngineRoutes as unknown as {
    stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
  }).stack
  const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  return layer.stack[layer.stack.length - 1] as Handler
}

function fakeCtx(query: Record<string, unknown>): Record<string, unknown> {
  return { query, state: { user: { username: 'u', workspaces: ['/ws/proj'] } }, status: 200, body: undefined }
}

beforeEach(() => {
  runtimeMock.state.agentCalls = []
  runtimeMock.state.err = null
  // 归属面注入（workspace-access deps 契约）：/ws/proj 已注册、全 profile 可见。
  setWorkspaceAccessDepsForTests({
    listSessions: () => [{ profile: 'default', workspace: '/ws/proj' }],
    userCanAccessProfile: () => true,
  })
})

describe('workflow 查询面（workflow 集成轮）', () => {
  it('/workflow/runs：参数校验 + RPC 透传（workspacePath/sessionId 传引擎侧）', async () => {
    const h = handlerFor('GET', '/workflow/runs')
    let ctx = fakeCtx({})
    await h(ctx)
    expect(ctx.status).toBe(400)
    expect((ctx.body as { reason: string }).reason).toBe('target_unavailable')

    ctx = fakeCtx({ workspacePath: '/ws/proj', sessionId: 's1', limit: '10' })
    await h(ctx)
    expect(ctx.status).toBe(200)
    expect((ctx.body as { runs: unknown[] }).runs).toHaveLength(1)
    expect(runtimeMock.state.agentCalls[0]).toContain('"/ws/proj"')
    expect(runtimeMock.state.agentCalls[0]).toContain('"limit":10')
  })

  it('/workflow/run-events：runId 必填 + afterSequence 透传分页', async () => {
    const h = handlerFor('GET', '/workflow/run-events')
    let ctx = fakeCtx({ workspacePath: '/ws/proj', sessionId: 's1' })
    await h(ctx)
    expect(ctx.status).toBe(400)

    ctx = fakeCtx({ workspacePath: '/ws/proj', sessionId: 's1', runId: 'r1', afterSequence: '5' })
    await h(ctx)
    expect(ctx.status).toBe(200)
    expect(runtimeMock.state.agentCalls[0]).toContain('"afterSequence":5')
  })

  it('/workflow/saved 与 /saved-runs：scope 白名单 project/global；非法 400', async () => {
    const saved = handlerFor('GET', '/workflow/saved')
    let ctx = fakeCtx({ workspacePath: '/ws/proj', scope: 'bogus' })
    await saved(ctx)
    expect(ctx.status).toBe(400)

    ctx = fakeCtx({ workspacePath: '/ws/proj', scope: 'global' })
    await saved(ctx)
    expect(ctx.status).toBe(200)
    expect((ctx.body as { workflows: unknown[] }).workflows[0]).toMatchObject({ name: 'zcode-loop-graph' })

    const savedRuns = handlerFor('GET', '/workflow/saved-runs')
    ctx = fakeCtx({ workspacePath: '/ws/proj', name: 'zcode-loop-graph', limit: '5' })
    await savedRuns(ctx)
    expect(ctx.status).toBe(200)
    expect((ctx.body as { runs: unknown[] }).runs[0]).toMatchObject({ runId: 'dwfrun-1' })
  })

  it('归属闸：未注册 workspace 403 invocation_not_allowed，引擎侧零调用', async () => {
    const h = handlerFor('GET', '/workflow/runs')
    const ctx = fakeCtx({ workspacePath: '/ws/other', sessionId: 's1' })
    await h(ctx)
    expect(ctx.status).toBe(403)
    expect((ctx.body as { reason: string }).reason).toBe('invocation_not_allowed')
    expect(runtimeMock.state.agentCalls).toHaveLength(0)
  })

  it('引擎离线：503 + engine_unreachable 词表（四个端点同款）', async () => {
    runtimeMock.state.err = new Error('connect ECONNREFUSED 127.0.0.1:3030')
    for (const [path, query] of [
      ['/workflow/runs', { workspacePath: '/ws/proj', sessionId: 's1' }],
      ['/workflow/run-events', { workspacePath: '/ws/proj', sessionId: 's1', runId: 'r1' }],
      ['/workflow/saved', { workspacePath: '/ws/proj' }],
      ['/workflow/saved-runs', { workspacePath: '/ws/proj' }],
    ] as const) {
      const ctx = fakeCtx({ ...query })
      await handlerFor('GET', path)(ctx)
      expect(ctx.status).toBe(503)
      expect((ctx.body as { reason: string }).reason).toBe('engine_unreachable')
    }
  })
})
