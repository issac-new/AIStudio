// overlay/skillprovision 测试：扫描口径、角色匹配、三列对账、干跑/供给/回滚、路径安全。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanSkillRoot } from '../scan'
import { loadManifest, matchRole, normalizeManifest, resolveManifestPath } from '../manifest'
import { buildReport, readDisabledSkills } from '../reconcile'
import { applyProvision, hashDir, rollbackProvision } from '../provision'
import type { ProvisionManifest } from '../types'

let root = ''

function skill(dir: string, content = 'body'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${dir.split('/').pop()}\n---\n${content}\n`)
}

function writeConfig(profileDir: string, text: string): void {
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'config.yaml'), text)
}

function writeManifest(path: string, roles: ProvisionManifest['roles']): void {
  writeFileSync(path, JSON.stringify({ version: 1, roles }, null, 2))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillprov-'))
  const host = join(root, 'host')
  const sim = join(root, 'sim', 'hermes')

  // 全局库：3 个真技能 + 1 个只有 DESCRIPTION.md 的分类目录
  for (const name of ['global-a', 'global-b', 'global-c']) skill(join(host, 'skills', name))
  mkdirSync(join(host, 'skills', 'category'), { recursive: true })
  writeFileSync(join(host, 'skills', 'category', 'DESCRIPTION.md'), 'not a skill')

  // alice：已装 existing，且 existing 被 disabled；期望里含 missing-src（全局无源）
  skill(join(host, 'profiles', 'alice', 'skills', 'existing'), 'user copy')
  writeConfig(join(host, 'profiles', 'alice'), 'skills:\n  disabled:\n    - existing\n')

  // bob：空 profile，disabled 里有一个没装的技能（不应算“已装但禁用”）
  mkdirSync(join(host, 'profiles', 'bob', 'skills'), { recursive: true })
  writeConfig(join(host, 'profiles', 'bob'), 'skills:\n  disabled: [global-a]\n')

  // cat：只有分类目录，没有 SKILL.md
  mkdirSync(join(host, 'profiles', 'cat', 'skills', 'category'), { recursive: true })
  writeFileSync(join(host, 'profiles', 'cat', 'skills', 'category', 'DESCRIPTION.md'), 'category only')

  // 推演树：alice 有 a/b，bob 有 a，另有 sim-only profile
  for (const name of ['global-a', 'global-b', 'global-c']) skill(join(sim, 'skills', name))
  skill(join(sim, 'profiles', 'alice', 'skills', 'global-a'))
  skill(join(sim, 'profiles', 'alice', 'skills', 'global-b'))
  skill(join(sim, 'profiles', 'bob', 'skills', 'global-a'))
  skill(join(sim, 'profiles', 'simonly', 'skills', 'global-a'))

  writeManifest(join(root, 'manifest.json'), [
    { match: 'alice', skills: ['global-a', 'global-b', 'existing', 'missing-src'] },
    { match: 'bob', skills: ['global-a', 'global-c'] },
    { match: '*', skills: ['global-a'] },
  ])

  writeFileSync(join(root, 'catalog.md'), [
    '| Skill | 触发场景 | 适用 profile | 状态 |',
    '|---|---|---|---|',
    '| global-a | 任意 | 所有 profile | active |',
    '| global-b | alice 用 | alice | active |',
    '| retired-one | 已退役 | 所有 | retired |',
    '| docx / pdf | 文档 | 通用 | active |',
  ].join('\n'))
})

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('scanSkillRoot', () => {
  it('只数 SKILL.md，不把分类目录当技能', () => {
    const scan = scanSkillRoot(join(root, 'host', 'skills'))
    expect(scan.available).toBe(true)
    expect(scan.skills.map((s) => s.name).sort()).toEqual(['global-a', 'global-b', 'global-c'])
    expect(scan.skills.some((s) => s.name === 'category')).toBe(false)
  })

  it('根不存在时如实标不可用', () => {
    const scan = scanSkillRoot(join(root, 'nope'))
    expect(scan.available).toBe(false)
    expect(scan.skills).toEqual([])
  })
})

describe('matchRole', () => {
  const roles: ProvisionManifest['roles'] = [
    { match: '*', skills: ['fallback'] },
    { match: '*ice', skills: ['suffix'] },
    { match: 'alice', skills: ['exact'] },
    { match: 'a*', skills: ['prefix'] },
  ]

  it('精确名优先于后缀/前缀/通配', () => {
    expect(matchRole('alice', roles)).toEqual({ match: 'alice', skills: ['exact'] })
  })

  it('无精确名时取最长后缀', () => {
    expect(matchRole('bobice', roles)).toEqual({ match: '*ice', skills: ['suffix'] })
  })

  it('只有通配匹配时回落 *', () => {
    expect(matchRole('zzz', roles)).toEqual({ match: '*', skills: ['fallback'] })
  })

  it('同分多条合并技能集并暴露 match 拼接', () => {
    const tied: ProvisionManifest['roles'] = [
      { match: '*', skills: ['one'] },
      { match: '*', skills: ['two'] },
    ]
    expect(matchRole('a-x', tied)).toEqual({ match: '*', skills: ['one', 'two'] })
  })
})

describe('manifest 候选链（env > 中央 _shared > 本地 webui > 内置）', () => {
  const savedProfilesRoot = process.env.HERMES_PROFILES_ROOT
  const savedManifest = process.env.SKILL_PROVISION_MANIFEST
  afterEach(() => {
    if (savedProfilesRoot === undefined) delete process.env.HERMES_PROFILES_ROOT
    else process.env.HERMES_PROFILES_ROOT = savedProfilesRoot
    if (savedManifest === undefined) delete process.env.SKILL_PROVISION_MANIFEST
    else process.env.SKILL_PROVISION_MANIFEST = savedManifest
  })

  it('中央仓 _shared 在位时接管期望源', () => {
    const centralDir = join(root, 'profiles', '_shared')
    mkdirSync(centralDir, { recursive: true })
    writeFileSync(join(centralDir, 'skill-provisioning.json'), JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['central-x'] }] }))
    process.env.HERMES_PROFILES_ROOT = join(root, 'profiles')
    const loaded = loadManifest()
    expect(loaded.source).toBe('file')
    expect(loaded.path).toBe(join(centralDir, 'skill-provisioning.json'))
    expect(matchRole('anyone', loaded.manifest.roles)?.skills).toEqual(['central-x'])
  })

  it('env 显式路径压过中央仓', () => {
    const centralDir = join(root, 'profiles', '_shared')
    mkdirSync(centralDir, { recursive: true })
    writeFileSync(join(centralDir, 'skill-provisioning.json'), JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['central-x'] }] }))
    const envPath = join(root, 'env-manifest.json')
    writeFileSync(envPath, JSON.stringify({ version: 1, roles: [{ match: '*', skills: ['env-x'] }] }))
    process.env.HERMES_PROFILES_ROOT = join(root, 'profiles')
    process.env.SKILL_PROVISION_MANIFEST = envPath
    const loaded = loadManifest()
    expect(loaded.path).toBe(envPath)
    expect(matchRole('anyone', loaded.manifest.roles)?.skills).toEqual(['env-x'])
  })

  it('全缺时回落内置且路径指向首选候选', () => {
    process.env.HERMES_PROFILES_ROOT = join(root, 'profiles') // 无 _shared 清单
    process.env.SKILL_PROVISION_MANIFEST = join(root, 'absent.json')
    const loaded = loadManifest()
    expect(loaded.source).toBe('builtin')
    expect(loaded.path).toBe(join(root, 'absent.json'))
    expect(resolveManifestPath()).toBe(join(root, 'absent.json'))
  })
})

describe('normalizeManifest', () => {
  it('拒绝非法 match 与技能名', () => {
    expect(() => normalizeManifest({ version: 1, roles: [{ match: 'a*b', skills: ['x'] }] })).toThrow()
    expect(() => normalizeManifest({ version: 1, roles: [{ match: '*', skills: ['../evil'] }] })).toThrow()
  })
})

describe('readDisabledSkills', () => {
  it('解析块列表与行内列表', () => {
    expect(readDisabledSkills(join(root, 'host', 'profiles', 'alice', 'config.yaml'))).toEqual(['existing'])
    expect(readDisabledSkills(join(root, 'host', 'profiles', 'bob', 'config.yaml'))).toEqual(['global-a'])
    expect(readDisabledSkills(join(root, 'nope.yaml'))).toEqual([])
  })
})

describe('buildReport', () => {
  it('三列对账：catalog / manifest / host / sim，disabled 与缺失分列', () => {
    const report = buildReport({
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'sim'),
      manifestPath: join(root, 'manifest.json'),
      catalogPath: join(root, 'catalog.md'),
    })
    const alice = report.profiles.find((p) => p.profile === 'alice')!
    expect(alice.expected.sort()).toEqual(['existing', 'global-a', 'global-b', 'missing-src'])
    expect(alice.hostActual).toEqual(['existing'])
    expect(alice.hostDisabled).toEqual(['existing'])
    expect(alice.disabledExpected).toEqual(['existing'])
    expect(alice.missingInHost.sort()).toEqual(['global-a', 'global-b', 'missing-src'])
    expect(alice.sourceMissing).toEqual(['missing-src'])
    expect(alice.catalogDeclared.sort()).toEqual(['docx', 'global-a', 'global-b', 'pdf'])

    const bob = report.profiles.find((p) => p.profile === 'bob')!
    expect(bob.missingInHost.sort()).toEqual(['global-a', 'global-c'])
    expect(bob.disabledExpected).toEqual([])
    expect(bob.simComparable).toBe(true)
    expect(bob.simActual).toEqual(['global-a'])
    expect(bob.missingInSim).toEqual(['global-c'])

    const cat = report.profiles.find((p) => p.profile === 'cat')!
    expect(cat.simComparable).toBe(false)
    expect(cat.missingInSim).toEqual([])

    expect(report.summary.hostMissing).toBe(6)
    expect(report.summary.simMissing).toBe(3)
    expect(report.summary.sourceMissing).toBe(1)
    expect(report.summary.disabledExpected).toBe(1)
    expect(report.simOnlyProfiles).toEqual(['simonly'])
    expect(report.catalog.rows).toBe(4)
  })

  it('推演树不可用时不伪造零缺口', () => {
    const report = buildReport({
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'no-sim'),
      manifestPath: join(root, 'manifest.json'),
      catalogPath: join(root, 'catalog.md'),
    })
    expect(report.sim.available).toBe(false)
    expect(report.summary.simMissing).toBe(0)
    expect(report.profiles.every((p) => p.missingInSim.length === 0)).toBe(true)
  })
})

describe('applyProvision', () => {
  const opts = () => ({
    hostRoot: join(root, 'host'),
    simRoot: join(root, 'sim'),
    manifestPath: join(root, 'manifest.json'),
    profiles: ['alice'],
  })

  it('干跑不写盘', () => {
    const before = existsSync(join(root, 'host', 'profiles', 'alice', 'skills', 'global-a'))
    const result = applyProvision({ ...opts(), dryRun: true })
    expect(result.dryRun).toBe(true)
    expect(result.summary.planned).toBe(2)
    expect(result.summary.skipped).toBe(1)
    expect(result.profiles[0].planned.map((p) => p.skill).sort()).toEqual(['global-a', 'global-b'])
    expect(result.profiles[0].skipped[0]).toMatchObject({ skill: 'missing-src', reason: 'source_missing' })
    expect(existsSync(join(root, 'host', 'profiles', 'alice', 'skills', 'global-a'))).toBe(before)
  })

  it('执行只补缺失、保留已有副本、写台账、二次执行幂等', () => {
    const result = applyProvision({ ...opts(), dryRun: false, confirm: true })
    expect(result.summary.copied).toBe(2)
    expect(readFileSync(join(root, 'host', 'profiles', 'alice', 'skills', 'global-a', 'SKILL.md'), 'utf8')).toContain('global-a')
    expect(readFileSync(join(root, 'host', 'profiles', 'alice', 'skills', 'existing', 'SKILL.md'), 'utf8')).toContain('user copy')
    const ledger = JSON.parse(readFileSync(join(root, 'host', 'profiles', 'alice', 'skills', '.skill-provisioning.json'), 'utf8'))
    expect(Object.keys(ledger.entries).sort()).toEqual(['global-a', 'global-b'])

    const again = applyProvision({ ...opts(), dryRun: false, confirm: true })
    expect(again.summary.copied).toBe(0)
    expect(again.summary.skipped).toBe(1)
  })

  it('非干跑缺少 confirm 拒绝执行', () => {
    const result = applyProvision({ ...opts(), dryRun: false })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('confirm_required')
  })

  it('manifest 缺失拒绝供给', () => {
    const result = applyProvision({
      hostRoot: join(root, 'host'),
      manifestPath: join(root, 'nope.json'),
      profiles: ['alice'],
      dryRun: true,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('manifest_missing')
  })

  it('_shared 是 git 仓，供给只报跳过不写盘', () => {
    const result = applyProvision({
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'sim'),
      manifestPath: join(root, 'manifest.json'),
      profiles: ['_shared'],
      dryRun: false,
      confirm: true,
    })
    expect(result.profiles[0].skipped).toContainEqual({ skill: '(profile)', reason: 'excluded_shared' })
    expect(existsSync(join(root, 'host', 'profiles', '_shared', 'skills'))).toBe(false)
  })

  it('profile 名越界直接拒绝', () => {
    expect(() => applyProvision({
      hostRoot: join(root, 'host'),
      manifestPath: join(root, 'manifest.json'),
      profiles: ['../evil'],
      dryRun: true,
    })).toThrow(/profile 名不合法/)
  })

  it('源技能含目录外符号链接时拒绝供给', () => {
    skill(join(root, 'host', 'skills', 'evil'))
    symlinkSync('/etc/hosts', join(root, 'host', 'skills', 'evil', 'outside'))
    writeManifest(join(root, 'manifest3.json'), [{ match: 'alice', skills: ['evil'] }])
    const result = applyProvision({
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'sim'),
      manifestPath: join(root, 'manifest3.json'),
      profiles: ['alice'],
      dryRun: true,
    })
    expect(result.profiles[0].skipped).toContainEqual({ skill: 'evil', reason: 'symlink_escape' })
  })

  it('同名多源且内容不同判 ambiguous 跳过', () => {
    skill(join(root, 'host', 'skills', 'cat1', 'dup'), 'A')
    skill(join(root, 'host', 'skills', 'cat2', 'dup'), 'B')
    writeManifest(join(root, 'manifest2.json'), [{ match: 'alice', skills: ['dup'] }])
    const result = applyProvision({
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'sim'),
      manifestPath: join(root, 'manifest2.json'),
      profiles: ['alice'],
      dryRun: true,
    })
    expect(result.profiles[0].skipped).toContainEqual({ skill: 'dup', reason: 'ambiguous' })
  })
})

describe('rollbackProvision', () => {
  it('只删台账在册且未改的副本；用户改过的跳过', () => {
    const base = {
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'sim'),
      manifestPath: join(root, 'manifest.json'),
      profiles: ['alice'],
    }
    applyProvision({ ...base, dryRun: false, confirm: true })
    const edited = join(root, 'host', 'profiles', 'alice', 'skills', 'global-a', 'SKILL.md')
    writeFileSync(edited, '---\nname: global-a\n---\nuser edited\n')
    const before = hashDir(join(root, 'host', 'profiles', 'alice', 'skills', 'global-a'))

    const result = rollbackProvision({ ...base, dryRun: false, confirm: true })
    expect(result.summary.removed).toBe(1)
    expect(result.profiles[0].removed).toEqual(['global-b'])
    expect(result.profiles[0].skipped).toContainEqual({ skill: 'global-a', reason: 'modified' })
    expect(existsSync(join(root, 'host', 'profiles', 'alice', 'skills', 'global-b'))).toBe(false)
    expect(hashDir(join(root, 'host', 'profiles', 'alice', 'skills', 'global-a'))).toBe(before)
    expect(existsSync(join(root, 'host', 'profiles', 'alice', 'skills', 'existing'))).toBe(true)
  })

  it('干跑只列计划不删除', () => {
    const base = {
      hostRoot: join(root, 'host'),
      simRoot: join(root, 'sim'),
      manifestPath: join(root, 'manifest.json'),
      profiles: ['alice'],
    }
    applyProvision({ ...base, dryRun: false, confirm: true })
    const result = rollbackProvision({ ...base, dryRun: true })
    expect(result.summary.planned).toBe(2)
    expect(result.summary.removed).toBe(0)
    expect(existsSync(join(root, 'host', 'profiles', 'alice', 'skills', 'global-a'))).toBe(true)
  })
})
