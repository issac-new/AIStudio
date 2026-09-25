// overlay：Workflow 运行可视化 MVP 数据面（zcode §七 #5 P0-5 待排期项）。
//
// 语义（zcode TaskWorkflowRunLines 参考 + loop graph-events 现状）：每 run 一行
// 视图——runId/状态机/节点进度（done/total）/耗时/产物数。数据源=loop graph
// 事件（loop-socket 投影）或 zcode workflow run 事件；本模块=纯投影（事件→行），
// 渲染面（IdeWorkflowRunLines 组件）接它。
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

export interface RunEvent {
  runId: string
  type: 'run.started' | 'node.done' | 'node.failed' | 'run.completed' | 'run.failed' | 'run.blocked'
  at: number
  nodeId?: string
  artifactCount?: number
}

export interface RunLine {
  runId: string
  status: RunStatus
  nodesDone: number
  nodesFailed: number
  /** 节点进度：done/（done+failed+活跃）——UI 进度条用。 */
  progressText: string
  durationMs: number
  artifacts: number
}

/** run 事件流→行视图（每 runId 一，事件序聚合）。 */
export function buildRunLines(events: readonly RunEvent[]): RunLine[] {
  const byRun = new Map<string, { startedAt: number; endedAt: number | null; status: RunStatus; done: number; failed: number; artifacts: number }>()
  for (const e of events) {
    let r = byRun.get(e.runId)
    if (!r) {
      r = { startedAt: e.at, endedAt: null, status: 'pending', done: 0, failed: 0, artifacts: 0 }
      byRun.set(e.runId, r)
    }
    switch (e.type) {
      case 'run.started':
        r.status = 'running'
        r.startedAt = e.at
        break
      case 'node.done':
        r.done += 1
        if (typeof e.artifactCount === 'number') r.artifacts += e.artifactCount
        break
      case 'node.failed':
        r.failed += 1
        break
      case 'run.completed':
        r.status = 'completed'
        r.endedAt = e.at
        break
      case 'run.failed':
        r.status = 'failed'
        r.endedAt = e.at
        break
      case 'run.blocked':
        r.status = 'blocked'
        r.endedAt = e.at
        break
    }
  }
  return [...byRun.entries()].map(([runId, r]) => ({
    runId,
    status: r.status,
    nodesDone: r.done,
    nodesFailed: r.failed,
    progressText: `${r.done + r.failed}/${r.done + r.failed + (r.status === 'running' ? 1 : 0)}`,
    durationMs: (r.endedAt ?? Date.now()) - r.startedAt,
    artifacts: r.artifacts,
  }))
}
