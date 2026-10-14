// 回归（2026-10-14 24h 风险审查轮续）：同名技能跨根并存（本机实测 14 组，
// profile 分发副本摊到数十个根）时，执法查询不得按扫描序 first-find——
// 先扫到的 safe 副本会遮蔽后扫的 dangerous 副本，SKILLGOV_ENFORCE 下放行危险副本。
import { describe, expect, it, afterEach } from 'vitest'
import { latestVerdictOf, _setLatestForTests, type SkillScanResult, type SkillScanSummary } from '../skill-scan'

function result(name: string, dir: string, verdict: SkillScanResult['verdict']): SkillScanResult {
  return {
    name, dir, verdict, findings: [],
    files: { total: 1, scripts: 0, binaries: 0, symlinks: 0 },
    frontmatter: { hasName: true, nameMatchesDir: true, hasDescription: true, hasVersion: true },
    scannedAt: Date.now(),
  }
}

function summary(results: SkillScanResult[]): SkillScanSummary {
  const byVerdict = { safe: 0, caution: 0, dangerous: 0 }
  for (const r of results) byVerdict[r.verdict] += 1
  return { scannedAt: Date.now(), roots: [], scanned: results.length, byVerdict, results }
}

describe('latestVerdictOf 跨根同名遮蔽', () => {
  afterEach(() => _setLatestForTests(null))

  it('safe 副本先扫不得遮蔽 dangerous 副本（取最坏判定）', () => {
    _setLatestForTests(summary([
      result('dup', '/global/skills/dup', 'safe'),
      result('dup', '/profiles/p1/skills/dup', 'dangerous'),
    ]))
    expect(latestVerdictOf('dup')).toBe('dangerous')
  })

  it('全部同名副本同判 → 原判定；未收录名 → undefined（fail-open 放行不变）', () => {
    _setLatestForTests(summary([
      result('dup', '/a/skills/dup', 'caution'),
      result('dup', '/b/skills/dup', 'caution'),
    ]))
    expect(latestVerdictOf('dup')).toBe('caution')
    expect(latestVerdictOf('absent-skill')).toBeUndefined()
  })
})
