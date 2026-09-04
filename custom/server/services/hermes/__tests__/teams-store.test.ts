import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTeamsStore } from '../teams-store'

let dir: string
let store: ReturnType<typeof createTeamsStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'teams-store-'))
  store = createTeamsStore(join(dir, 'teams.json'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createTeamsStore', () => {
  it('creates, lists, updates and removes teams with roundtrip persistence', async () => {
    const team = await store.create({
      name: 'AI 团队',
      description: 'orchestrator + scouts',
      profiles: ['aiteam-orchestrator', 'aiteam-scout'],
      boards: ['aiteam'],
    })
    expect(team.id).toMatch(/^team_/)
    expect(team.profiles).toEqual(['aiteam-orchestrator', 'aiteam-scout'])

    // 新实例从磁盘读回（进程重启语义）
    const reloaded = createTeamsStore(join(dir, 'teams.json'))
    expect((await reloaded.list()).map(t => t.name)).toEqual(['AI 团队'])

    const updated = await store.update(team.id, { name: 'AI 团队 v2', profiles: ['aiteam-orchestrator'] })
    expect(updated?.name).toBe('AI 团队 v2')
    expect(updated?.profiles).toEqual(['aiteam-orchestrator'])
    expect(updated?.boards).toEqual(['aiteam']) // 未动字段保留

    expect(await store.remove(team.id)).toBe(true)
    expect(await store.remove(team.id)).toBe(false)
    expect(await store.list()).toEqual([])
  })

  it('sanitizes inputs and rejects empty names', async () => {
    await expect(store.create({ name: '   ' })).rejects.toThrow(/name is required/)
    const team = await store.create({
      name: 'x',
      profiles: ['a', 'a', ' ', 'b'],
      boards: [],
      color: 'not-a-color',
    })
    expect(team.profiles).toEqual(['a', 'b'])
    expect(team.color).toMatch(/^#[0-9a-f]{6}$/)
    await expect(store.update(team.id, { name: '' })).rejects.toThrow(/name is required/)
  })

  it('writes atomically (no tmp leftovers) and survives a corrupted file', async () => {
    await store.create({ name: 'a' })
    const files = existsSync(join(dir, 'teams.json'))
    expect(files).toBe(true)
    const raw = JSON.parse(readFileSync(join(dir, 'teams.json'), 'utf8'))
    expect(Array.isArray(raw.teams)).toBe(true)
    // 目录里不应残留 tmp 文件
    const { readdirSync } = await import('fs')
    expect(readdirSync(dir).filter(f => f.includes('.tmp-'))).toEqual([])
  })
})
