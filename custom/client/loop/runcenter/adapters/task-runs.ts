// overlay/custom/client/loop/runcenter/adapters/task-runs.ts
// 任务运行投影（2026-09-28 产品实操演示轮）：把 /api/graph/mind 的 kanban
// task_runs 只读投影（突触末梢）整为运行中心可渲染行。
//
// 背景：图引擎 runs（GET /api/graph/runs）只在 GRAPH_ENGINE=on 时有数据；
// 本环境引擎为 legacy，真实 agent 执行史全部落在 kanban task_runs
// （thoughts=任务 + runs=执行轮次 + relations=任务父子）。运行中心此前
// 只读图轴 runs → 界面"还没有任何运行"与真实执行史（200+ 轮）脱节。
// 本投影不改图轴数据面：task_runs 行独立成 tab，join 任务标题/状态后
// 按最近结束倒序排列，供 PM 看真实台账。
//
// 全部纯函数、零 store 零 DOM（同 run-graph.ts 纪律）。

import type { MindProjectionDto } from '../api'

/** 任务运行行（渲染层输入；status 原样透传 mind 投影词汇） */
export interface TaskRunRow {
  runId: string
  taskId: string
  taskTitle: string | null
  taskStatus: string | null
  status: string
  durationSec: number
  startedAt: string | null
  endedAt: string | null
  summary: string | null
}

/** mind 投影 → 行集合：join thoughts（标题/状态），无匹配任务的 run 行保留
 *  （taskId 原值、标题空——孤儿 run 不静默丢弃）；最近结束优先。 */
export function toTaskRunRows(mind: MindProjectionDto): TaskRunRow[] {
  const thoughtById = new Map(mind.thoughts.map(t => [t.id, t]))
  return mind.runs
    .map(r => {
      const thought = thoughtById.get(r.thoughtId)
      return {
        runId: r.runId,
        taskId: r.thoughtId,
        taskTitle: thought?.title ?? null,
        taskStatus: thought?.status ?? null,
        status: r.status,
        durationSec: r.durationSec,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        summary: r.summary,
      }
    })
    .sort((a, b) => tsMs(b.endedAt) - tsMs(a.endedAt))
}

/** 过滤（列表工具条）：status 精确匹配；query 对 taskId/runId/标题/摘要包含匹配 */
export function filterTaskRunRows(
  rows: readonly TaskRunRow[],
  opts: { status?: string; query?: string },
): TaskRunRow[] {
  const q = opts.query?.trim().toLowerCase()
  return rows.filter(r => {
    if (opts.status && r.status !== opts.status) return false
    if (!q) return true
    return r.taskId.toLowerCase().includes(q)
      || r.runId.toLowerCase().includes(q)
      || (r.taskTitle?.toLowerCase().includes(q) ?? false)
      || (r.summary?.toLowerCase().includes(q) ?? false)
  })
}

function tsMs(v: string | null): number {
  if (!v) return 0
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : 0
}
