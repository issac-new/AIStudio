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
import { readdirSync } from 'node:fs'

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

/** 任务关系边（task_links 父子委派投影） */
export interface MindRelation {
  parentId: string
  childId: string
}

export interface MindProjection {
  thoughts: MindThought[]
  runs: MindRun[]
  /** 任务父子/委派关系（task_links 只读投影；无表/无行 → 空数组） */
  relations: MindRelation[]
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
 *
 * 2026-09-28 前：只读 `<home>/kanban.db` 单库——分板拓扑（kanban/boards/*）
 * 的任务与运行对本投影不可见（RFD-002 实测：开发运行台账缺当日全部会话）。
 * 单库入口保留（测试/单库部署兼容）；装配面改走 projectMindAggregated。
 */
export function projectMindFromKanban(dbPath?: string): MindProjection {
  const file = dbPath ?? join(homedir(), '.hermes', 'kanban.db')
  const single = projectMindFromDbFile(file, null)
  if (!single) return { thoughts: [], runs: [], relations: [], available: false }
  return { ...single, available: true }
}

/** 单库投影内部形态（board = 来源板 slug；root 库为 null） */
type DbProjection = { thoughts: MindThought[]; runs: MindRun[]; relations: MindRelation[] }

function projectMindFromDbFile(file: string, boardSlug: string | null): DbProjection | null {
  let db: DatabaseSync | null = null
  try {
    db = new DatabaseSync(file, { open: true, readOnly: true } as never)
  } catch {
    return null
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
      // 来源板优先（分板拓扑真实归属）；root 库回落 project_id
      board: boardSlug ?? (r.project_id != null ? String(r.project_id) : null),
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
        // 分板 run id 是板内自增整数，跨板必撞——板名限定保唯一（前端行键/展示直用）
        runId: boardSlug ? `${boardSlug}:${r.id}` : String(r.id),
        thoughtId: String(r.task_id),
        status: mapRunStatus(r.status as string, r.outcome as string, ended),
        durationSec: started != null ? Math.max(0, Math.round((ended ?? nowSec) - started)) : 0,
        startedAt: toIso(started),
        endedAt: toIso(ended),
        outcome: (r.outcome as string) ?? null,
        summary: (r.summary as string) ?? null,
      }
    })

    // 任务关系边（task_links 父子委派；表不存在 → 空数组容错）
    let relations: MindRelation[] = []
    try {
      const linkRows = db.prepare(`SELECT parent_id, child_id FROM task_links`).all() as Array<Record<string, unknown>>
      relations = linkRows.map(r => ({ parentId: String(r.parent_id), childId: String(r.child_id) }))
    } catch { /* task_links 表缺失（旧库）→ 空关系 */ }

    return { thoughts, runs, relations }
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关闭 */ }
  }
}

/**
 * 聚合投影（2026-09-28 RFD-002 缺口①修复）：root 库 + 全部分板库合并。
 * 根解析与部署一致：HERMES_HOME 显式优先（studio 以其钉 sim 根），否则 ~/.hermes。
 * 任一源可开即 available:true；分板 runId 以 `<slug>:<id>` 限定防跨板撞键。
 */
export function projectMindAggregated(homeDir?: string): MindProjection {
  const home = homeDir?.trim() || process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  const sources: Array<{ file: string; slug: string | null }> = [
    { file: join(home, 'kanban.db'), slug: null },
  ]
  const boardsRoot = join(home, 'kanban', 'boards')
  try {
    for (const slug of readdirSync(boardsRoot, { withFileTypes: true })) {
      if (!slug.isDirectory()) continue
      sources.push({ file: join(boardsRoot, slug.name, 'kanban.db'), slug: slug.name })
    }
  } catch { /* boards 目录缺失（单库部署）→ 只读 root */ }

  const thoughts: MindThought[] = []
  const runs: MindRun[] = []
  const relations: MindRelation[] = []
  let anyOpen = false
  for (const src of sources) {
    const p = projectMindFromDbFile(src.file, src.slug)
    if (!p) continue
    anyOpen = true
    thoughts.push(...p.thoughts)
    runs.push(...p.runs)
    relations.push(...p.relations)
  }
  runs.sort((a, b) => (tsMs(b.startedAt) - tsMs(a.startedAt)))
  return { thoughts, runs, relations, available: anyOpen }
}

function tsMs(iso: string | null): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}
