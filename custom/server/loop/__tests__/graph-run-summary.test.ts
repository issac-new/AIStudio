// overlay/custom/server/loop/__tests__/graph-run-summary.test.ts
// Task 6 守门：GET /api/graph/runs 列表与 GET /api/graph/runs/:id 详情共用同一
// run 摘要投影（projectRunSummary）——外部源 run（sim-*：无内存实例、只有事件
// 骨架）在列表里不得再报 status:'unknown'/updatedAt:null（「列表瞎、详情亮」
// 状态分裂根治）；终态粘滞（completed 后续 running 族事件不回摆）两端口径一致。
import { describe, expect, it } from 'vitest'
import { InMemoryEventLogStore } from '../graph/event-log-store'
import { createGraphRunRouter } from '../graph/graph-rest'

function handlerOf(router: any, path: string, method = 'GET'): (ctx: any) => Promise<void> {
  const layer = router.stack.find((l: any) => l.path === path && l.methods.includes(method))
  expect(layer, `路由应注册于 ${method} ${path}`).toBeTruthy()
  return layer.stack[layer.stack.length - 1]
}

/** 无内存实例的 graphService 桩（外部源 run 场景：getRun 恒 undefined） */
const externalOnlyService = { getRun: () => undefined } as any

/** 混合场景桩：runId 命中内存表时返回实例，其余 undefined */
function mixedService(memory: Record<string, { graphId: string; instance: Record<string, unknown> }>) {
  return {
    getRun: (id: string) => memory[id]
      ? { runId: id, graphId: memory[id].graphId, instance: memory[id].instance }
      : undefined,
  } as any
}

async function appendRun(log: InMemoryEventLogStore, runId: string, graphId: string, events: Array<{ ts: number; kind: string }>): Promise<void> {
  for (const e of events) await log.append({ runId, graphId, ts: e.ts, kind: e.kind, payload: {} })
}

describe('graph-rest 列表/详情共用 run 摘要（projectRunSummary）', () => {
  it('外部 run：列表 status/updatedAt 与详情一致（事件推导、终态粘滞）', async () => {
    const eventLog = new InMemoryEventLogStore()
    // run.completed 后仍有 run.progress（收官后 sset 刷 updated_ts 的真实形态）——
    // 状态须粘滞 completed，updatedAt 取末事件 ts
    await appendRun(eventLog, 'sim-20261027-run1', 'sim-run-progress', [
      { ts: 1791288000000, kind: 'run.started' },
      { ts: 1791288060000, kind: 'run.completed' },
      { ts: 1791288120000, kind: 'run.progress' },
    ])
    const router: any = createGraphRunRouter({ graphService: externalOnlyService, eventLog })

    const listCtx: any = { body: undefined }
    await handlerOf(router, '/api/graph/runs')(listCtx)
    const entry = listCtx.body.runs.find((r: any) => r.runId === 'sim-20261027-run1')
    expect(entry, '列表应包含该外部 run').toBeTruthy()
    expect(entry.status).toBe('completed')
    expect(entry.updatedAt).toBe(new Date(1791288120000).toISOString())
    expect(entry.updatedAt).not.toBe(null)

    const detailCtx: any = { params: { id: 'sim-20261027-run1' }, body: undefined }
    await handlerOf(router, '/api/graph/runs/:id')(detailCtx)
    expect(detailCtx.body.instance.status).toBe(entry.status)
    expect(detailCtx.body.instance.updatedAt).toBe(entry.updatedAt)
    expect(detailCtx.body.graphId).toBe(entry.graphId)
  })

  it('混合列表：内存实例走实例真值，外部 run 走事件推导，同一投影无分裂', async () => {
    const eventLog = new InMemoryEventLogStore()
    await appendRun(eventLog, 'sim-20261027-ext', 'sim-run-progress', [
      { ts: 1000, kind: 'run.started' },
      { ts: 2000, kind: 'interrupt.raised' },
    ])
    await appendRun(eventLog, 'run-inmem', 'loop-lp-1', [{ ts: 1500, kind: 'run.started' }])
    const memory = {
      'run-inmem': { graphId: 'loop-lp-1', instance: { status: 'running', updatedAt: '2026-10-27T08:00:00.000Z', currentIteration: 3 } },
    }
    const router: any = createGraphRunRouter({ graphService: mixedService(memory), eventLog })

    const listCtx: any = { body: undefined }
    await handlerOf(router, '/api/graph/runs')(listCtx)
    const byId = new Map((listCtx.body.runs as Array<Record<string, any>>).map(r => [r.runId, r]))
    // 内存实例：列表维持实例真值（不回归）
    expect(byId.get('run-inmem')).toMatchObject({ graphId: 'loop-lp-1', status: 'running', updatedAt: '2026-10-27T08:00:00.000Z' })
    // 外部 run：awaiting-input 由事件推导（列表不再是 unknown/null）
    expect(byId.get('sim-20261027-ext')).toMatchObject({ graphId: 'sim-run-progress', status: 'awaiting-input' })
    expect(byId.get('sim-20261027-ext')!.updatedAt).toBe(new Date(2000).toISOString())
  })

  it('空事件日志：列表为空数组（无假 unknown 行）', async () => {
    const router: any = createGraphRunRouter({ graphService: externalOnlyService, eventLog: new InMemoryEventLogStore() })
    const listCtx: any = { body: undefined }
    await handlerOf(router, '/api/graph/runs')(listCtx)
    expect(listCtx.body.runs).toEqual([])
  })
})
