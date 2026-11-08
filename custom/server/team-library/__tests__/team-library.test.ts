// 团队库守护：解析/校验 fail-soft、四维身份选择、显式家族与退役排除。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_SELECTION_THRESHOLD, loadTeamLibrary, parseTeamLibrary, scoreTeamFamily, selectTeamFamily } from '../team-library'
import type { TeamFamily } from '../types'

const goodYaml = `
version: 1
updated: '2026-11-08'
families:
  - family_id: impl-independent-verify
    description: 跨文件实现与独立验证
    identity:
      work_type: implementation
      change_scope: cross-file
      required_roles: [implementer, verifier]
      verification_strategy: independent-rerun
    keywords: [实现, 重构, 测试]
    candidate_roster: [worker-coder, worker-tester]
    handoff_family_id: hf-delivery
    version: 2
    status: active
    evidence:
      task_ids: [t1]
      successful: [t1]
      failed: []
    version_history:
      - version: 2
        changed_at: '2026-11-08'
        reason: seed
        members: [worker-coder, worker-tester]
  - family_id: research-synthesis
    description: 资料调研与综述
    identity:
      work_type: research
      required_roles: [researcher]
    keywords: [调研, 综述]
    candidate_roster: [worker-researcher]
    version: 1
    status: retired
    evidence: { task_ids: [], successful: [], failed: [] }
`

describe('parseTeamLibrary 结构与校验', () => {
  it('合法表归一化：版本史/证据/身份四维就位', () => {
    const r = parseTeamLibrary(goodYaml)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.library.families).toHaveLength(2)
    const f = r.library.families[0]
    expect(f.familyId).toBe('impl-independent-verify')
    expect(f.version).toBe(2)
    expect(f.identity.requiredRoles).toEqual(['implementer', 'verifier'])
    expect(f.evidence.successful).toEqual(['t1'])
    expect(f.versionHistory[0].reason).toBe('seed')
  })

  it('非法 family_id 整表拒绝（半坏表不上路）', () => {
    const r = parseTeamLibrary(goodYaml.replace('impl-independent-verify', 'Impl_Team'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('family_id 非法')
  })

  it('重复 family_id 拒绝', () => {
    const dup = goodYaml.replace('research-synthesis', 'impl-independent-verify')
    const r = parseTeamLibrary(dup)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('重复')
  })

  it('空候选名单拒绝', () => {
    const r = parseTeamLibrary(goodYaml.replace('candidate_roster: [worker-coder, worker-tester]', 'candidate_roster: []'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('candidate_roster')
  })

  it('成败证据冲突拒绝', () => {
    const r = parseTeamLibrary(goodYaml.replace('failed: []', 'failed: [t1]'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('冲突')
  })

  it('坏 YAML 返回解析失败而非抛错', () => {
    const r = parseTeamLibrary('families: [')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('解析失败')
  })
})

describe('selectTeamFamily 建议选择', () => {
  const families = (parseTeamLibrary(goodYaml) as { ok: true; library: { families: TeamFamily[] } }).library.families

  it('显式家族命中即 reuse，返回候选名单与版本', () => {
    const s = selectTeamFamily(families, { taskText: '任意任务', familyId: 'impl-independent-verify' })
    expect(s.action).toBe('reuse')
    expect(s.familyId).toBe('impl-independent-verify')
    expect(s.version).toBe(2)
    expect(s.candidateRoster).toEqual(['worker-coder', 'worker-tester'])
  })

  it('显式家族不存在或退役 → cold_start（不猜）', () => {
    const missing = selectTeamFamily(families, { taskText: 'x', familyId: 'no-such-family' })
    expect(missing.action).toBe('cold_start')
    const retired = selectTeamFamily(families, { taskText: 'x', familyId: 'research-synthesis' })
    expect(retired.action).toBe('cold_start')
    expect(retired.reason).toContain('不存在或已退役')
  })

  it('关键词命中 → reuse；无关任务 → cold_start', () => {
    const hit = selectTeamFamily(families, { taskText: '重构跨文件实现并复跑测试' })
    expect(hit.action).toBe('reuse')
    expect(hit.familyId).toBe('impl-independent-verify')
    expect(hit.scores[0].hits.length).toBeGreaterThan(0)

    const miss = selectTeamFamily(families, { taskText: '帮我写一份周报' })
    expect(miss.action).toBe('cold_start')
    expect(miss.familyId).toBeNull()
    expect(miss.reason).toContain('无匹配家族')
  })

  it('阈值可调：调高后同一任务判 cold_start', () => {
    const s = selectTeamFamily(families, { taskText: '重构并测试', threshold: 0.9 })
    expect(s.action).toBe('cold_start')
  })

  it('退役家族不参与打分', () => {
    const scores = families.filter((f) => f.status === 'active').map((f) => scoreTeamFamily(f, '调研综述'))
    expect(scores.some((s) => s.familyId === 'research-synthesis')).toBe(false)
  })

  it('空任务描述 → cold_start（不编造匹配）', () => {
    const s = selectTeamFamily(families, { taskText: '   ' })
    expect(s.action).toBe('cold_start')
    expect(s.reason).toContain('为空')
  })

  it('默认阈值是公开常量（单一事实源）', () => {
    expect(DEFAULT_SELECTION_THRESHOLD).toBe(0.34)
  })
})

describe('loadTeamLibrary fail-soft', () => {
  let dir = ''
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'team-library-')) })
  afterEach(() => {
    delete process.env.TEAM_LIBRARY_PATH
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('正本缺席 → available:false 且原因含路径', () => {
    process.env.TEAM_LIBRARY_PATH = join(dir, 'nope.yaml')
    const r = loadTeamLibrary()
    expect(r.available).toBe(false)
    expect(r.reason).toContain('缺席')
  })

  it('坏表 → available:false 不抛错', () => {
    const p = join(dir, 'bad.yaml')
    writeFileSync(p, 'families: [{]', 'utf8')
    process.env.TEAM_LIBRARY_PATH = p
    const r = loadTeamLibrary()
    expect(r.available).toBe(false)
    expect(r.reason).toBeTruthy()
  })

  it('仓内正本可读：若存在则至少一族（种子表守护）', () => {
    delete process.env.TEAM_LIBRARY_PATH
    const r = loadTeamLibrary()
    if (r.available) {
      expect(r.families.length).toBeGreaterThanOrEqual(3)
      expect(r.families.map((f) => f.familyId)).toContain('impl-independent-verify')
    }
  })
})
