// overlay/custom/server/loop/graph/mind-projection.ts
// 思维大脑数据源投影（2026-09-15 用户裁决：大脑基于已有任务的运行数据长成）。
//
// 背景：图引擎自身的 run 库（.loop/graph-events.db）在本机为空——引擎从未跑过。
// 但 kanban 有真实任务与其运行史（~/.hermes/kanban.db 的 tasks / task_runs）。
// 本模块把 kanban 运行史**只读投影**为大脑的思想核（task）与突触末梢（task_run），
// 不动 kanban 本体、不写图引擎库、零迁移——纯查询投影，重启/刷新即重算。
//
// 纪律：
// - 直读 node:sqlite（DatabaseSync，与 event-log-store 同一先例，零新依赖）。
// - 只读（mode: 'readonly'），绝不写 kanban.db。
// - 状态映射沿用前端 runcenter 的 RunStatus 词表（投影成同一语义，前端零翻译）。

import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 大脑思想核（kanban task 投影） */
export interface MindThought {
  id: string
  title: string
  /** 归一状态词表（与 RunStatus 同语义家族，前端直用） */
  status: 'running' | 'blocked' | 'awaiting-review' | 'completed' | 'idle' | 'archived'
  createdAt: string | null
  board: string | null
}

/** 大脑突触末梢（kanban task_run 投影） */
export interface MindRun {
  runId: string
  /** 关联思想核 id（= task_id；前端按 graphId 分组的同一语义位） */
  thoughtId: string
  status: 'running' | 'completed' | 'failed' | 'awaiting-input' | 'idle'
  /** 生长权重输入：运行时长（秒，ended-started；未结束用 now-started） */
  durationSec: number
  /** 时间锚（ISO）：阶段推进/排序的稳定基准 */
  startedAt: string | null
  endedAt: string | null
  outcome: string | null
  summary: string | null
}

export interface MindProjection {
  thoughts: MindThought[]
  runs: MindRun[]
  /** 数据源是否可用（库缺失/读失败时 false，前端落空态而非报错） */
  available: boolean
}

/** task.status → 思想核状态（blocked/待审为活跃信号；archived 折叠为静止） */
function mapTaskStatus(status: string | null | undefined): MindThought['status'] {
  switch (status) {
    case 'running': case 'ready': case 'scheduled': return 'running'
    case 'blocked': return 'blocked'
    case 'review': return 'awaiting-review'
    case 'done': return 'completed'
    case 'archived': return 'archived'
    default: return 'idle'
  }
}

/** task_runs.status/outcome → 末梢状态（运行中/待介入/失败/完成/静止） */
function mapRunStatus(status: string | null | undefined, outcome: string | null | undefined, endedAt: number | null): MindRun['status'] {
  // 进行中：无 ended_at 且 status 为活态
  if (!endedAt && (status === 'running' || status === 'claimed')) return 'running'
  if (status === 'review' || outcome === 'review_requested') return 'awaiting-input'
  if (outcome === 'completed' || status === 'completed' || status === 'done') return 'completed'
  // 失败家族：crashed/gave_up/spawn_failed/timed_out 都是真实活动痕迹（大脑记住失败）
  if (['crashed', 'gave_up', 'spawn_failed', 'timed_out', 'reclaimed'].includes(status ?? '')
    || ['crashed', 'gave_up', 'spawn_failed', 'timed_out'].includes(outcome ?? '')) return 'failed'
  return endedAt ? 'completed' : 'idle'
}

function toIso(epochSec: number | null | undefined): string | null {
  if (epochSec == null || !Number.isFinite(epochSec)) return null
  return new Date(epochSec * 1000).toISOString()
}

/**
 * 从 kanban.db 投影思维大脑数据。库缺失/读失败 → available:false（不抛错，
 * 让前端落「思维网络未形成」空态而非 500）。
 */
export function projectMindFromKanban(dbPath?: string): MindProjection {
  const file = dbPath ?? join(homedir(), '.hermes', 'kanban.db')
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { open: true, readOnly: true } as never)
  } catch {
    return { thoughts: [], runs: [], available: false }
  }
  try {
    const taskRows = db.prepare(
      `SELECT id, title, status, created_at, project_id FROM tasks`,
    ).all() as Array<Record<string, unknown>>
    const thoughts: MindThought[] = taskRows.map(r => ({
      id: String(r.id),
      title: String(r.title ?? r.id),
      status: mapTaskStatus(r.status as string),
      createdAt: toIso(r.created_at as number),
      board: r.project_id != null ? String(r.project_id) : null,
    }))

    const runRows = db.prepare(
      `SELECT id, task_id, status, outcome, started_at, ended_at, summary
       FROM task_runs ORDER BY started_at DESC`,
    ).all() as Array<Record<string, unknown>>
    const nowSec = Date.now() / 1000
    const runs: MindRun[] = runRows.map(r => {
      const started = r.started_at as number | null
      const ended = r.ended_at as number | null
      return {
        runId: String(r.id),
        thoughtId: String(r.task_id),
        status: mapRunStatus(r.status as string, r.outcome as string, ended),
        durationSec: started != null ? Math.max(0, Math.round((ended ?? nowSec) - started)) : 0,
        startedAt: toIso(started),
        endedAt: toIso(ended),
        outcome: (r.outcome as string) ?? null,
        summary: (r.summary as string) ?? null,
      }
    })

    return { thoughts, runs, available: true }
  } catch {
    return { thoughts: [], runs: [], available: false }
  } finally {
    try { db?.close() } catch { /* 已关闭 */ }
  }
}
