// overlay/custom/server/services/hermes/teams-store.ts
//
// 团队注册表（治 E2）：Team = { profiles, boards, pinnedSessions } 的具名
// 集合。JSON 文件存储（~/.hermes-web-ui/overlay/teams.json），原子写
// （tmp + rename），进程内单副本缓存。
//
// 为什么不上 studio DB：teams 是 overlay 概念，写进 upstream schema 迁移
// 会在每次 upstream 升级时增加迁移面；JSON 单文件足够（团队数量有限，
// 读多写少，全员共享）。

import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

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

export interface TeamsStore {
  list(): Promise<TeamRecord[]>
  get(id: string): Promise<TeamRecord | null>
  create(input: TeamInput): Promise<TeamRecord>
  update(id: string, patch: Partial<TeamInput>): Promise<TeamRecord | null>
  remove(id: string): Promise<boolean>
}

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#6366f1']

function defaultTeamsPath(): string {
  return join(homedir(), '.hermes-web-ui', 'overlay', 'teams.json')
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
}

function sanitizeTeamInput(input: Partial<TeamInput>): Partial<TeamRecord> {
  const patch: Partial<TeamRecord> = {}
  if (typeof input.name === 'string') patch.name = input.name.trim().slice(0, 80)
  if (typeof input.description === 'string') patch.description = input.description.trim().slice(0, 500)
  if (typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color)) patch.color = input.color
  if (input.profiles !== undefined) patch.profiles = toStringArray(input.profiles)
  if (input.boards !== undefined) patch.boards = toStringArray(input.boards)
  if (input.pinnedSessions !== undefined) patch.pinnedSessions = toStringArray(input.pinnedSessions)
  return patch
}

export function createTeamsStore(filePath?: string): TeamsStore {
  const path = filePath || defaultTeamsPath()
  let cache: TeamRecord[] | null = null
  let loadInflight: Promise<TeamRecord[]> | null = null

  async function load(): Promise<TeamRecord[]> {
    if (cache) return cache
    if (loadInflight) return loadInflight
    loadInflight = (async () => {
      let teams: TeamRecord[] = []
      try {
        if (existsSync(path)) {
          const raw = JSON.parse(await readFile(path, 'utf8'))
          if (Array.isArray(raw?.teams)) teams = raw.teams
        }
      } catch {
        teams = []
      }
      cache = teams
      return teams
    })()
    try {
      return await loadInflight
    } finally {
      loadInflight = null
    }
  }

  async function persist(teams: TeamRecord[]): Promise<void> {
    cache = teams
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, JSON.stringify({ teams }, null, 2), 'utf8')
    await rename(tmp, path)
  }

  return {
    async list() {
      return [...await load()].sort((a, b) => a.name.localeCompare(b.name))
    },
    async get(id) {
      return (await load()).find(team => team.id === id) || null
    },
    async create(input) {
      const teams = [...await load()]
      const now = Date.now()
      const patch = sanitizeTeamInput(input)
      if (!patch.name) throw new Error('team name is required')
      const record: TeamRecord = {
        id: `team_${randomUUID().slice(0, 8)}`,
        name: patch.name,
        description: patch.description || '',
        color: patch.color || COLORS[teams.length % COLORS.length],
        profiles: patch.profiles || [],
        boards: patch.boards || [],
        pinnedSessions: patch.pinnedSessions || [],
        createdAt: now,
        updatedAt: now,
      }
      teams.push(record)
      await persist(teams)
      return record
    },
    async update(id, input) {
      const teams = await load()
      const index = teams.findIndex(team => team.id === id)
      if (index < 0) return null
      const patch = sanitizeTeamInput(input)
      const next: TeamRecord = {
        ...teams[index],
        ...patch,
        id: teams[index].id,
        createdAt: teams[index].createdAt,
        updatedAt: Date.now(),
      }
      if (!next.name) throw new Error('team name is required')
      const nextTeams = [...teams]
      nextTeams[index] = next
      await persist(nextTeams)
      return next
    },
    async remove(id) {
      const teams = await load()
      const next = teams.filter(team => team.id !== id)
      if (next.length === teams.length) return false
      await persist(next)
      return true
    },
  }
}
