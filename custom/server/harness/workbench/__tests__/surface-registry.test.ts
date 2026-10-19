// 八面登记与 managed 路径守卫：真实产物扫描、缺席如实、路径逃逸拒绝。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { collectSurfaces, resolveManagedTarget } from '../surface-registry'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness2-surfaces-'))
  process.env.HERMES_HOME = join(dir, 'home')
  const home = process.env.HERMES_HOME
  for (const p of ['profiles/p1', 'profiles/_shared', 'skills/s1', 'memories', 'scripts', 'plugins', 'mcp', 'agents']) {
    mkdirSync(join(home, p), { recursive: true })
  }
  writeFileSync(join(home, 'profiles/p1/SOUL.md'), 'persona')
  writeFileSync(join(home, 'profiles/p1/config.yaml'), 'approvals: {}\n')
  writeFileSync(join(home, 'profiles/_shared/constraint-policy.md'), 'constraints')
  writeFileSync(join(home, 'skills/s1/SKILL.md'), '# skill')
  writeFileSync(join(home, 'memories/m1.md'), 'memory')
  writeFileSync(join(home, 'scripts/run.sh'), 'echo hi')
  writeFileSync(join(home, 'plugins/p.json'), '{}')
  writeFileSync(join(home, 'mcp/m.json'), '{}')
  writeFileSync(join(home, 'tool-desc-overrides.json'), '{}')
})

afterEach(() => {
  delete process.env.HERMES_HOME
  rmSync(dir, { recursive: true, force: true })
})

describe('collectSurfaces', () => {
  it('恒八面；真实产物有数、缺失面 available=false；只有两面 managed', () => {
    const surfaces = collectSurfaces()
    expect(surfaces).toHaveLength(8)
    const byKey = Object.fromEntries(surfaces.map((s) => [s.key, s]))
    expect(byKey.system_prompt.available).toBe(true)
    expect(byKey.system_prompt.applyMode).toBe('managed')
    expect(byKey.system_prompt.revision).toMatch(/^[0-9a-f]{16}$/)
    expect(byKey.skills.available).toBe(true)
    expect(byKey.skills.applyMode).toBe('managed')
    expect(byKey.tool_guidance.available).toBe(true)
    expect(byKey.subagents.available).toBe(false)
    expect(byKey.subagents.expected).toContain('subagents')
    expect(surfaces.filter((s) => s.applyMode === 'managed').map((s) => s.key)).toEqual(['system_prompt', 'skills'])
    expect(byKey.system_prompt.source).toMatchObject({ components: ['c1'], context: 'always_on' })
    expect(byKey.plugins.source).toMatchObject({ components: ['c8'], context: 'tool_loop' })
    expect(byKey.skills.source.opencode).toContain('SKILL.md')
  })

  it('产物的 samples 只列真实相对路径', () => {
    const sp = collectSurfaces().find((s) => s.key === 'system_prompt')!
    expect(sp.artifacts.samples).toContain('profiles/p1/SOUL.md')
  })
})

describe('resolveManagedTarget', () => {
  it('接受 HERMES_HOME 内合法文件（相对与绝对）', () => {
    expect(resolveManagedTarget('system_prompt', 'profiles/p1/SOUL.md').ok).toBe(true)
    const abs = join(process.env.HERMES_HOME!, 'profiles/p1/SOUL.md')
    expect(resolveManagedTarget('system_prompt', abs).ok).toBe(true)
  })

  it('拒绝 ..、根外、错误文件名、不存在的文件', () => {
    expect(resolveManagedTarget('system_prompt', 'profiles/p1/../../../etc/passwd').error).toContain('..')
    expect(resolveManagedTarget('system_prompt', 'skills/s1/SKILL.md').ok).toBe(false)
    expect(resolveManagedTarget('system_prompt', 'profiles/p1/config.yaml').error).toContain('文件名')
    expect(resolveManagedTarget('system_prompt', 'profiles/p9/SOUL.md').error).toContain('不存在')
  })

  it('建议面拒绝直接写盘', () => {
    expect(resolveManagedTarget('guardrails', 'profiles/p1/config.yaml').error).toContain('建议模式')
  })

  it('符号链接逃出 HERMES_HOME 拒绝', () => {
    const outside = join(dir, 'outside.md')
    writeFileSync(outside, 'outside')
    mkdirSync(join(process.env.HERMES_HOME!, 'profiles/p2'), { recursive: true })
    symlinkSync(outside, join(process.env.HERMES_HOME!, 'profiles/p2/SOUL.md'))
    const res = resolveManagedTarget('system_prompt', 'profiles/p2/SOUL.md')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('符号链接')
  })
})
