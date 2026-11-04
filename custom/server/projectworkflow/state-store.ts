// custom/server/projectworkflow/state-store.ts
// 项目一级生命周期状态存储（2026-11-04 项目工作流域）。
//
// 看板任务是执行层事实，但「项目」本身没有生命周期：无法表达暂停收单、
// 也无法阻止带着在途任务的项目被宣告完成。本模块把项目状态落成
// <kanbanRoot>/projects-state.json 一个 JSON 文件（版本化、append-only timeline），
// 与看板库分离——状态是治理层事实，不进任务库（任务库由 hermes CLI 独占写）。
//
// 口径：
// - 根解析对齐 cli-fast-gates defaultKanbanCliRoot / kanban_db.py kanban_home()：
//   HERMES_KANBAN_HOME → HERMES_HOME（lib/paths hermesHome）→ ~/.hermes。
// - 无状态行的项目视为缺省 active（「没说过暂停」就是活跃，不为每个项目建空行）。
// - 坏 JSON / 缺文件 → 空状态重建（fail-soft 不抛：治理状态缺席不阻断读）。
// - 写入走 lib/fs-store atomicWriteJson（tmp+rename 单一事实源，状态类台账带 fsync）。
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { hermesHome } from '../lib/paths'
import { atomicWriteJson } from '../lib/fs-store'

/** 项目生命周期三态：active 活跃 / paused 暂停收单 / completed 已完成（终态）。 */
export type ProjectStatus = 'active' | 'paused' | 'completed'

/** override 佐证：绕过完成守卫时必须留下人给的Reason与操作者。 */
export interface ProjectOverride {
  reason: string
  actor: string
  at: number
}

/** timeline 事件：kind ∈ pause | resume | complete | complete_override。 */
export interface TimelineEvent {
  at: number
  kind: string
  detail?: string
}

export interface ProjectStateEntry {
  status: ProjectStatus
  pausedAt?: number
  completedAt?: number
  override?: ProjectOverride
  timeline: TimelineEvent[]
}

export interface ProjectsState {
  version: 1
  projects: Record<string, ProjectStateEntry>
}

/** kanban 根解析（与 cli-fast-gates defaultKanbanCliRoot 同序）；env 注入供测试。 */
export function kanbanRootOf(env: NodeJS.ProcessEnv = process.env): string {
  const kanbanOverride = env.HERMES_KANBAN_HOME?.trim()
  if (kanbanOverride) return resolve(kanbanOverride)
  return resolve(hermesHome(env))
}

/** 状态文件路径：<kanbanRoot>/projects-state.json。 */
export function projectsStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(kanbanRootOf(env), 'projects-state.json')
}

export function emptyState(): ProjectsState {
  return { version: 1, projects: {} }
}

/** 读状态：缺文件/坏 JSON → 空状态（fail-soft，不抛）。 */
export function readState(env: NodeJS.ProcessEnv = process.env): ProjectsState {
  const file = projectsStatePath(env)
  try {
    if (!existsSync(file)) return emptyState()
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ProjectsState>
    if (!parsed || typeof parsed !== 'object' || !parsed.projects || typeof parsed.projects !== 'object') {
      return emptyState()
    }
    return { version: 1, projects: parsed.projects as ProjectsState['projects'] }
  } catch {
    // 坏档按空状态重建：读面绝不因治理文件缺席/损坏而 500。
    return emptyState()
  }
}

/** 写状态：tmp+rename 原子写（fsync——状态是台账类事实，落盘持久）。 */
export function writeState(state: ProjectsState, env: NodeJS.ProcessEnv = process.env): void {
  atomicWriteJson(projectsStatePath(env), state, { fsync: true })
}

/** 无状态行=缺省 active：不反写文件，读时合成。 */
export function getProjectState(
  projectId: string,
  env: NodeJS.ProcessEnv = process.env,
): ProjectStateEntry {
  const row = readState(env).projects[projectId]
  if (row && typeof row.status === 'string') {
    return { ...row, timeline: Array.isArray(row.timeline) ? row.timeline : [] }
  }
  return { status: 'active', timeline: [] }
}

export interface SetStatusOptions {
  actor: string
  /** complete override 时的绕过理由（非空才允许 override 路径）。 */
  reason?: string
  /** true=绕过完成守卫的完成（timeline 记 complete_override 并落 override 佐证）。 */
  override?: boolean
}

/** 状态流转：写 timeline 事件（pause/resume/complete/complete_override）。
 *  同态重复调用幂等（不追加事件、不刷新时间戳），供接口层安全重试。 */
export function setStatus(
  projectId: string,
  status: ProjectStatus,
  opts: SetStatusOptions,
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): ProjectStateEntry {
  const state = readState(env)
  const current: ProjectStateEntry = state.projects[projectId] ?? { status: 'active', timeline: [] }
  if (current.status === status) return current

  const at = now()
  const kind =
    status === 'paused' ? 'pause'
      : status === 'active' ? 'resume'
        : opts.override ? 'complete_override'
          : 'complete'
  const detail = `actor=${opts.actor}${opts.reason ? ` reason=${opts.reason}` : ''}`

  const next: ProjectStateEntry = {
    ...current,
    status,
    // pausedAt 只在 paused 态有意义；complete/resume 均清掉，避免双终态并存。
    pausedAt: status === 'paused' ? at : undefined,
    completedAt: status === 'completed' ? at : undefined,
    ...(status === 'completed' && opts.override && opts.reason
      ? { override: { reason: opts.reason, actor: opts.actor, at } }
      : {}),
    timeline: [...current.timeline, { at, kind, ...(detail ? { detail } : {}) }],
  }
  state.projects[projectId] = next
  writeState(state, env)
  return next
}
