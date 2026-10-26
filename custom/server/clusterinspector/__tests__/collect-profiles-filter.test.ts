// 守门：collectProfiles 的 profile 日志尾采集排除 `_` 前缀容器目录（2026-10-26
// 排除面审计轮）。_shared/_archive 是容器不是 agent（hermes 名字正则 ^[a-z0-9]
// 同款排除）；_shared 的 agent.log 只有两条维护日志，采进停摆观测面=幻影 profile
// 行，且 `_` 排序最前必占 cap 位（cap=40/50 目录实录）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectProfiles } from '../collectors'

let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'collect-profiles-'))
  // 真实 profile：有工作行日志
  const real = join(home, 'profiles', 'fanfan', 'logs')
  mkdirSync(real, { recursive: true })
  writeFileSync(join(real, 'agent.log'), '2026-10-26 10:00:00 INFO agent: API call #1 done\n')
  // 容器目录：_shared 也有 agent.log（维护日志），不应被采集
  const shared = join(home, 'profiles', '_shared', 'logs')
  mkdirSync(shared, { recursive: true })
  writeFileSync(join(shared, 'agent.log'), '2026-10-25 07:53:20 WARNING config migration skipped\n')
})

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('collectProfiles：`_` 前缀容器目录排除', () => {
  it('_shared 有 agent.log 也不进 tails；真 profile 正常采集', () => {
    const face = collectProfiles({ hermesHome: home })
    expect(face.ok).toBe(true)
    const names = face.tails.map((t: { profile: string }) => t.profile)
    expect(names).toContain('fanfan')
    expect(names).not.toContain('_shared')
  })

  it('cap=1 时 `_` 排序占位不再挤掉真 profile（排序最前的容器被滤掉）', () => {
    const face = collectProfiles({ hermesHome: home, maxProfiles: 1 })
    expect(face.tails.map((t: { profile: string }) => t.profile)).toEqual(['fanfan'])
  })
})
