// teams-adapter.ts —— 团队注册表 REST 客户端 + 看板聚合端点
//
// 团队（Team）= { profiles, boards, pinnedSessions } 的具名集合，服务端
// JSON 存储于 ~/.hermes-web-ui/overlay/teams.json。看板聚合端点一次返回
// 全 board 任务（替代 N+1 的 listBoards + listTasks×N）。

import { request } from '@/api/client'
import type { CockpitTask } from '../adapters/task-adapter'
import * as taskAdapter from '../adapters/task-adapter'

export interface TeamRecord {
  id: string
  name: string
  description: string
  color: string
  profiles: string[]
  boards: string[]
  pinnedSessions: string[]
  createdAt: number
  updatedAt: number
}

export interface TeamInput {
  name: string
  description?: string
  color?: string
  profiles?: string[]
  boards?: string[]
  pinnedSessions?: string[]
}

export async function listTeams(): Promise<TeamRecord[]> {
  const res = await request<{ teams: TeamRecord[] }>('/api/hermes/teams')
  return Array.isArray(res?.teams) ? res.teams : []
}

export async function createTeam(input: TeamInput): Promise<TeamRecord> {
  const res = await request<{ team: TeamRecord }>('/api/hermes/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return res.team
}

export async function updateTeam(id: string, patch: Partial<TeamInput>): Promise<TeamRecord> {
  const res = await request<{ team: TeamRecord }>(`/api/hermes/teams/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return res.team
}

export async function removeTeam(id: string): Promise<void> {
  await request(`/api/hermes/teams/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── 看板聚合（服务端缓存 + 共享 watcher）──

export interface KanbanOverviewBoard {
  slug: string
  name: string
  total: number
  archived: boolean
}

export interface KanbanOverview {
  boards: KanbanOverviewBoard[]
  tasks: Array<{ board: string; task: any }>
  fetchedAt: number
}

export interface KanbanOverviewMapped {
  boards: Array<{ slug: string; name: string; total: number }>
  tasks: CockpitTask[]
}

/** 拉聚合端点并映射为 cockpit 任务形状（boardSlug 已带） */
export async function fetchKanbanOverview(): Promise<KanbanOverviewMapped> {
  const overview = await request<KanbanOverview>('/api/hermes/kanban/overview')
  const boards = (overview?.boards || [])
    .filter(board => !board.archived)
    .map(board => ({ slug: board.slug, name: board.name, total: Number(board.total ?? 0) }))
  const tasks = (overview?.tasks || [])
    .filter(entry => entry && entry.task)
    .map(entry => taskAdapter.toCockpitTask(entry.task, entry.board))
  return { boards, tasks }
}

// ── 舰队就地审批/澄清（跨 profile）──

export async function respondFleetApproval(sessionId: string, approvalId: string, choice: string): Promise<{ resolved: boolean; error?: string }> {
  return request<{ resolved: boolean; error?: string }>('/api/hermes/fleet/approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, approval_id: approvalId, choice }),
  })
}

export async function respondFleetClarify(sessionId: string, clarifyId: string, response_: string): Promise<{ resolved: boolean; error?: string }> {
  return request<{ resolved: boolean; error?: string }>('/api/hermes/fleet/clarify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, clarify_id: clarifyId, response: response_ }),
  })
}
