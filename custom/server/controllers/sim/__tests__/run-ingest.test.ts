// overlay/custom/server/controllers/sim/__tests__/run-ingest.test.ts
// runs 注册表摄取适配（backlog②）守门：快照→事件翻译、幂等（跨进程语义=以事件日志为真值）、
// sim- 前缀命名空间、完成判定。注册簿未装配时 fail-soft 返回 false 不抛。
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryEventLogStore } from '../../../loop/graph/event-log-store'
import { registerEventLogStore, resetEventLogStore } from '../../../loop/graph/event-log-registry'
import { ingestRunProgress, simRunIdOf, SIM_RUN_GRAPH_ID } from '../run-ingest'
import type { SimRunProgress } from '../run-progress'

function snap(over: Partial<SimRunProgress> = {}): SimRunProgress {
  return {
    runId: '20261006-v8-run10', done: 3, total: 26,
    doneSteps: ['smoke', 'appinit', 'people'], updatedTs: 1791288000,
    ...over,
  }
}

afterEach(() => resetEventLogStore())

describe('run-ingest（runs 注册表接入）', () => {
  it('首采：run.started+run.progress 落库，runId 带 sim- 前缀、graphId 独立命名空间', async () => {
    const log = new InMemoryEventLogStore()
    registerEventLogStore(log)
    const ok = await ingestRunProgress(snap())
    expect(ok).toBe(true)
    const rows = await log.query(simRunIdOf('20261006-v8-run10'))
    expect(rows.map(r => r.kind)).toEqual(['run.started', 'run.progress'])
    expect(rows[0].graphId).toBe(SIM_RUN_GRAPH_ID)
    expect(rows[0].payload).toMatchObject({ source: 'run-progress', done: 3, total: 26 })
  })

  it('幂等：同快照重放（含模拟重启后的新调用方）零追加；状态变化只加 run.progress', async () => {
    const log = new InMemoryEventLogStore()
    registerEventLogStore(log)
    await ingestRunProgress(snap())
    expect(await ingestRunProgress(snap())).toBe(false)
    expect(await log.count(simRunIdOf('20261006-v8-run10'))).toBe(2)

    const advanced = snap({ done: 4, doneSteps: ['smoke', 'appinit', 'people', 'req'], updatedTs: 1791288060 })
    expect(await ingestRunProgress(advanced)).toBe(true)
    const rows = await log.query(simRunIdOf('20261006-v8-run10'))
    expect(rows.map(r => r.kind)).toEqual(['run.started', 'run.progress', 'run.progress'])
  })

  it('跨重启幂等：预置事件日志（新 store 实例）重采同快照不重复 run.started', async () => {
    const log = new InMemoryEventLogStore()
    registerEventLogStore(log)
    await ingestRunProgress(snap())
    // 模拟进程重启：注册簿重新指向同一持久日志，内存簿记归零
    resetEventLogStore()
    registerEventLogStore(log)
    expect(await ingestRunProgress(snap())).toBe(false)
    const started = await log.query(simRunIdOf('20261006-v8-run10'), { kind: 'run.started' })
    expect(started).toHaveLength(1)
  })

  it('完成判定：done>=total 追加 run.completed 且只一条；终态后停追进度（防状态回摆）', async () => {
    const log = new InMemoryEventLogStore()
    registerEventLogStore(log)
    await ingestRunProgress(snap({ done: 26, total: 26, updatedTs: 1791289000 }))
    const done = snap({ done: 26, total: 26, updatedTs: 1791289000 })
    expect(await ingestRunProgress(done)).toBe(false)
    const completed = await log.query(simRunIdOf('20261006-v8-run10'), { kind: 'run.completed' })
    expect(completed).toHaveLength(1)

    // 收官后 sset 仍在刷 run-progress.json（updated_ts 变）——不得追加 run.progress
    const postFinale = snap({ done: 26, total: 26, updatedTs: 1791289999 })
    expect(await ingestRunProgress(postFinale)).toBe(false)
    expect(await log.count(simRunIdOf('20261006-v8-run10'))).toBe(3)
  })

  it('注册簿未装配 fail-soft：返回 false 不抛、不自建连接', async () => {
    expect(await ingestRunProgress(snap())).toBe(false)
  })
})
