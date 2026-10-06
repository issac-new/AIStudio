// overlay/custom/server/controllers/sim/run-ingest.ts
// 推演运行态 → 运行注册表（graph 事件日志）摄取适配（backlog② runs 注册表接入）：
// run-progress.json 快照翻译为 run.started / run.progress / run.completed 事件写入
// EventLogStore，运行中心列表（事件日志派生）即可见 sim-* 条目；runId 加 sim- 前缀
// 与图 run 隔离命名空间。
// 幂等以事件日志自身为真值（跨进程/重启成立，不靠内存簿记）：
// - run.started / run.completed 各至多一条（存在即不再追加）；
// - run.progress 仅在 done/total/updatedTs 与最近一条不同时追加。
import type { SimRunProgress } from './run-progress'
import { getEventLogStore } from '../../loop/graph/event-log-registry'

export const SIM_RUN_GRAPH_ID = 'sim-run-progress'

export function simRunIdOf(runId: string): string {
  return `sim-${runId}`
}

export async function ingestRunProgress(p: SimRunProgress): Promise<boolean> {
  const log = getEventLogStore()
  if (!log) return false
  const runId = simRunIdOf(p.runId)
  const ts = p.updatedTs * 1000
  const base = { source: 'run-progress', runId: p.runId, total: p.total, done: p.done, doneSteps: p.doneSteps }

  const started = await log.query(runId, { kind: 'run.started', limit: 1 })
  const completed = await log.query(runId, { kind: 'run.completed', limit: 1 })
  const lastProgress = await log.query(runId, { kind: 'run.progress', latest: 1 })
  const prev = lastProgress[0]?.payload as { done?: unknown; total?: unknown; updatedTs?: unknown } | undefined
  const unchanged = !!prev
    && Number(prev.done) === p.done
    && Number(prev.total) === p.total
    && Number(prev.updatedTs) === p.updatedTs

  let appended = false
  if (started.length === 0) {
    await log.append({ runId, graphId: SIM_RUN_GRAPH_ID, ts, kind: 'run.started', payload: { ...base } })
    appended = true
  }
  // 终态后停追进度：收官后 sset 仍会刷 run-progress.json（updated_ts 变），
  // 不停追会让 run.progress 挂在 run.completed 之后污染状态推导
  const terminal = completed.length > 0
  if (!unchanged && !terminal) {
    await log.append({
      runId, graphId: SIM_RUN_GRAPH_ID, ts, kind: 'run.progress',
      payload: { ...base, updatedTs: p.updatedTs },
    })
    appended = true
  }
  if (p.done >= p.total && completed.length === 0) {
    await log.append({ runId, graphId: SIM_RUN_GRAPH_ID, ts, kind: 'run.completed', payload: { ...base } })
    appended = true
  }
  return appended
}
