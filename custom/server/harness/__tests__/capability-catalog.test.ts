// B1 统一能力目录守门：归一+四要素缺口判定（纯函数）、三系收集器（tmpdir fixture，
// git 假注册表仓）、缺口汇总口径（filter 只影响 entries 不影响 gapSummary）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-cat-'))
})
afterEach(() => {
  for (const k of ['HERMES_MCP_CONFIG_DIR', 'HERMES_SKILLS_DIR', 'GOVERNANCE_REPO']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

function makeGitRegistryRepo(): string {
  const repo = join(dir, 'govrepo')
  const admin = join(repo, 'docs', 'admin')
  mkdirSync(admin, { recursive: true })
  writeFileSync(join(admin, 'roster.md'), [
    '# roster', '',
    '| 账号 | 助理 | 角色 |',
    '| --- | --- | --- |',
    '| @a:matrix.test | @a-agent:matrix.test | admin |',
    '| @b:matrix.test | @b-agent:matrix.test | — |',
    '',
  ].join('\n'))
  const git = (args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  execFileSync('git', ['init', '-q', repo])
  git(['add', '.'])
  git(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init roster'])
  return repo
}

describe('纯函数：assessEntry 四要素判定', () => {
  it('全要素条目零缺口；缺权限/版本/审计的条目缺口如实列出', async () => {
    const { assessEntry } = await import('../capability-catalog')
    const full = assessEntry({
      source: 'mcpcatalog', kind: 'mcp-server', id: 's1', name: 's1',
      version: '1.0.0', registeredAt: 1, auditTrail: 'git:abc', permissionBound: true,
    })
    expect(full.gaps).toEqual([])
    expect(full.factors).toEqual({ registered: true, permission: true, version: true, audit: true })

    const bare = assessEntry({ source: 'extmarket', kind: 'skill', id: 'x', name: 'x' })
    expect(bare.gaps).toEqual(['permission', 'version', 'audit'])
    // 登记要素：条目即来自事实源在档记录，id+name 可解析恒真（口径注释见判定处）
    expect(bare.factors.registered).toBe(true)
  })
})

describe('纯函数：buildCapabilityCatalog 缺口汇总', () => {
  it('分系统计 + 总体缺口率；sourceFilter 只裁 entries 不改 gapSummary', async () => {
    const { buildCapabilityCatalog } = await import('../capability-catalog')
    const { gapSummary, entries } = buildCapabilityCatalog([
      { source: 'mcpcatalog', kind: 'mcp-server', id: 'a', name: 'a', version: '1', auditTrail: 'g:1', permissionBound: true },
      { source: 'mcpcatalog', kind: 'mcp-server', id: 'b', name: 'b' }, // 缺 权限/版本/审计 = 3 缺口
    ])
    expect(gapSummary.totalEntries).toBe(2)
    expect(gapSummary.overall.factorSlots).toBe(8)
    expect(gapSummary.overall.gapFactorCount).toBe(3)
    expect(gapSummary.overall.gapRate).toBeCloseTo(3 / 8)
    expect(gapSummary.bySource.mcpcatalog.total).toBe(2)
    expect(gapSummary.bySource.mcpcatalog.byFactor.version).toBe(1)
    expect(gapSummary.bySource.mcpcatalog.gapRate).toBeCloseTo(3 / 8)

    const filtered = buildCapabilityCatalog(
      [{ source: 'mcpcatalog', kind: 'mcp-server', id: 'a', name: 'a' }, { source: 'extmarket', kind: 'skill', id: 'e', name: 'e' }],
      'extmarket',
    )
    expect(filtered.entries.map((e) => e.id)).toEqual(['e'])
    expect(filtered.gapSummary.totalEntries).toBe(2) // 全集口径
  })

  it('parseMarkdownTableRows：表头剔除、分隔行跳过', async () => {
    const { parseMarkdownTableRows } = await import('../capability-catalog')
    const md = ['| a | b |', '| --- | --- |', '| 1 | 2 |', '普通段落', '| 3 | 4 |'].join('\n')
    expect(parseMarkdownTableRows(md)).toEqual([['1', '2'], ['3', '4']])
  })
})

describe('收集器：mcpcatalog（mcpconfig 假配置目录）', () => {
  it('authorized server + tools 工具级展开（disabledTools 语义）；needs-auth 权限缺口如实', async () => {
    const mcpDir = join(dir, 'mcp')
    mkdirSync(mcpDir)
    writeFileSync(join(mcpDir, 's1.json'), JSON.stringify({
      name: 's1', scope: 'global', timeoutMs: 1000, authState: 'authorized', updatedAt: 123,
      tools: ['t1', 't2'], disabledTools: ['t2'],
    }))
    writeFileSync(join(mcpDir, 's2.json'), JSON.stringify({
      name: 's2', scope: 'project', timeoutMs: 1000, authState: 'needs-auth', updatedAt: 456,
    }))
    writeFileSync(join(mcpDir, 'bad.json'), '{oops')
    process.env.HERMES_MCP_CONFIG_DIR = mcpDir

    const { collectMcpRecords } = await import('../capability-catalog')
    const { records, info } = collectMcpRecords()
    expect(info.available).toBe(true)
    expect(info.note).toContain('坏文件 1')
    const s1 = records.find((r) => r.id === 's1')!
    expect(s1.kind).toBe('mcp-server')
    expect(s1.permissionBound).toBe(true)
    expect(s1.registeredAt).toBe(123)
    expect(s1.version).toBeNull()
    expect(s1.auditTrail).toBeNull()
    const tools = records.filter((r) => r.kind === 'mcp-tool')
    expect(tools.map((t) => t.id).sort()).toEqual(['s1:t1', 's1:t2'])
    expect(tools.find((t) => t.id === 's1:t2')!.permissionBound).toBe(false)
    const s2 = records.find((r) => r.id === 's2')!
    expect(s2.permissionBound).toBe(false) // needs-auth 未建立授权绑定
  })
})

describe('收集器：extmarket（假技能目录）', () => {
  it('SKILL.md frontmatter version 解析；无版本字段如实缺口；无 SKILL.md 目录跳过', async () => {
    const skills = join(dir, 'skills')
    mkdirSync(join(skills, 'skillA'), { recursive: true })
    writeFileSync(join(skills, 'skillA', 'SKILL.md'), '---\nname: A\nversion: 1.2.0\n---\n# A\n')
    mkdirSync(join(skills, 'skillB'))
    writeFileSync(join(skills, 'skillB', 'SKILL.md'), '# B 无版本\n')
    mkdirSync(join(skills, 'notask'))
    process.env.HERMES_SKILLS_DIR = skills

    const { collectExtMarketRecords } = await import('../capability-catalog')
    const { records, info } = await collectExtMarketRecords()
    expect(info.available).toBe(true)
    expect(records.map((r) => r.id)).toEqual(['skillA', 'skillB'])
    expect(records.find((r) => r.id === 'skillA')!.version).toBe('1.2.0')
    expect(records.find((r) => r.id === 'skillB')!.version).toBeNull()
    expect(records.every((r) => r.permissionBound === false)).toBe(true)
    expect(records.every((r) => r.registeredAt != null && (r.registeredAt as number) > 0)).toBe(true)
  })

  it('git 仓内技能目录：auditTrail 取最后 commit 短 sha', async () => {
    const repo = makeGitRegistryRepo()
    const skills = join(repo, 'skills')
    mkdirSync(join(skills, 'gitSkill'), { recursive: true })
    writeFileSync(join(skills, 'gitSkill', 'SKILL.md'), '---\nname: G\n---\n')
    execFileSync('git', ['-C', repo, 'add', '.'])
    execFileSync('git', ['-C', repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'skill'])
    process.env.HERMES_SKILLS_DIR = skills

    const { collectExtMarketRecords } = await import('../capability-catalog')
    const { records } = await collectExtMarketRecords()
    expect(records[0].auditTrail).toMatch(/^git:[0-9a-f]+$/)
  })
})

describe('收集器：registry-admin（git 假注册表仓）', () => {
  it('表行解析 + 末列角色判定权限 + git 提交史可回溯（registeredAt/auditTrail）', async () => {
    const repo = makeGitRegistryRepo()
    process.env.GOVERNANCE_REPO = repo

    const { collectRegistryRecords } = await import('../capability-catalog')
    const { records, infos } = await collectRegistryRecords()
    const roster = records.filter((r) => r.kind === 'registry:roster')
    expect(roster.map((r) => r.id)).toEqual(['@a:matrix.test', '@b:matrix.test'])
    expect(roster.find((r) => r.id === '@a:matrix.test')!.permissionBound).toBe(true)
    expect(roster.find((r) => r.id === '@b:matrix.test')!.permissionBound).toBe(false) // 末列 '—'
    expect(roster[0].registeredAt).toBeGreaterThan(0)
    expect(roster[0].auditTrail).toMatch(/^git:[0-9a-f]+@docs\/admin\/roster\.md$/)
    // app-registry/org 缺席：该系仍有 roster 在档 → available 汇总为真（聚合层判断）
    expect(infos.some((i) => i.available)).toBe(true)
    expect(infos.filter((i) => !i.available).length).toBe(2)
  })
})

describe('聚合入口：collectCapabilityCatalog', () => {
  it('三系合并 + meta 写明本轮边界（不做统一写通道）', async () => {
    const mcpDir = join(dir, 'mcp')
    mkdirSync(mcpDir)
    writeFileSync(join(mcpDir, 'only.json'), JSON.stringify({ name: 'only', scope: 'global', timeoutMs: 1, authState: 'authorized', updatedAt: 9 }))
    process.env.HERMES_MCP_CONFIG_DIR = mcpDir
    process.env.HERMES_SKILLS_DIR = join(dir, 'nope-skills') // 缺席如实降级
    process.env.GOVERNANCE_REPO = makeGitRegistryRepo()

    const { collectCapabilityCatalog } = await import('../capability-catalog')
    const res = await collectCapabilityCatalog()
    expect(res.ok).toBe(true)
    expect(res.entries.length).toBeGreaterThanOrEqual(3) // mcp 1 + roster 2
    expect(res.sources.map((s) => s.id)).toEqual(['mcpcatalog', 'extmarket', 'registry-admin'])
    expect(res.sources.find((s) => s.id === 'extmarket')!.available).toBe(false)
    expect(res.gapSummary.overall.gapRate).toBeGreaterThan(0) // 版本/审计缺口如实暴露
    expect(res.meta.notDoing).toContain('不在本轮')

    const filtered = await collectCapabilityCatalog('mcpcatalog')
    expect(filtered.entries.every((e) => e.source === 'mcpcatalog')).toBe(true)
  })
})
