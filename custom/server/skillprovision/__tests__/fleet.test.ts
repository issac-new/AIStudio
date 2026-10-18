// overlay/skillprovision 能力发现面（fleet 聚合）测试。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fleetDir, readFleetReport } from '../fleet'

let root = ''

function report(dir: string, machine: string, generatedAt: number, profiles: Array<{ profile: string; role?: string | null; skills?: string[] }>): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${machine}.json`), JSON.stringify({
    machine,
    generatedAt,
    profiles: profiles.map((p) => ({ profile: p.profile, role: p.role ?? null, skillCount: (p.skills ?? []).length, skills: p.skills ?? [] })),
  }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fleet-'))
})

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('readFleetReport', () => {
  it('聚合多机上报：新鲜度判定+排序+汇总', () => {
    const dir = join(root, 'capability-reports')
    const fresh = Date.now() - 10 * 60_000
    const stale = Date.now() - 72 * 3600_000
    report(dir, 'm5u', fresh, [{ profile: 'orchestrator', role: 'orchestrator', skills: ['a', 'b'] }, { profile: 'ops-sre', role: 'ops-*', skills: ['c'] }])
    report(dir, 'win10-a', stale, [{ profile: 'qi-researcher', skills: ['x'] }])
    const out = readFleetReport(dir)
    expect(out.available).toBe(true)
    expect(out.machines.map((m) => m.machine)).toEqual(['m5u', 'win10-a'])
    expect(out.machines[0].stale).toBe(false)
    expect(out.machines[1].stale).toBe(true)
    expect(out.machines[0].totalSkills).toBe(3)
    expect(out.machines[0].profiles[0]).toMatchObject({ profile: 'orchestrator', role: 'orchestrator', skillCount: 2 })
  })

  it('坏文件记名跳过，不拖垮聚合', () => {
    const dir = join(root, 'capability-reports')
    report(dir, 'good', Date.now(), [{ profile: 'p', skills: ['s'] }])
    writeFileSync(join(dir, 'bad.json'), '{not json')
    const out = readFleetReport(dir)
    expect(out.machines.map((m) => m.machine)).toEqual(['good'])
    expect(out.bad).toEqual(['bad.json'])
  })

  it('目录不存在如实标不可用', () => {
    const out = readFleetReport(join(root, 'nope'))
    expect(out.available).toBe(false)
    expect(out.machines).toEqual([])
  })

  it('generatedAt 缺失按过期处理', () => {
    const dir = join(root, 'capability-reports')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'weird.json'), JSON.stringify({ machine: 'weird', profiles: [] }))
    const out = readFleetReport(dir)
    expect(out.machines[0].stale).toBe(true)
  })
})

describe('fleetDir', () => {
  it('env 覆盖优先', () => {
    process.env.SKILL_PROVISION_FLEET_DIR = '/tmp/fleet-x'
    try {
      expect(fleetDir()).toBe('/tmp/fleet-x')
    } finally {
      delete process.env.SKILL_PROVISION_FLEET_DIR
    }
  })
})
