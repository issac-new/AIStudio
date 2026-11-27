// 树候选可写边界（2026-11-27）：只建议面的文件在可写根下，树候选不得借道写入；回滚恢复不受此限。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveManagedTarget } from '../surface-registry'

let home = ''
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'tree-boundary-')) })
afterEach(() => { rmSync(home, { recursive: true, force: true }) })

const tree = { requireExists: false, relaxPattern: true } as const
const errorOf = (key: 'system_prompt' | 'skills', path: string) => {
  const r = resolveManagedTarget(key, path, home, tree)
  return r.ok ? '' : r.error
}

describe('树候选不得写入只建议面的文件', () => {
  it('系统提示词面：档案配置、共享约束策略与工具指导、档案下的 subagents 目录都被拒，并指明属于哪个只建议面', () => {
    const cases: Array<[string, string]> = [
      ['profiles/p1/config.yaml', '护栏'],
      ['profiles/_shared/constraint-policy.md', '护栏'],
      ['profiles/_shared/tool-guidance.md', '工具指导'],
      ['profiles/p1/subagents/reviewer.md', '子智能体'],
    ]
    for (const [path, surface] of cases) expect(errorOf('system_prompt', path), path).toContain(`只建议面「${surface}」`)
  })

  it('技能面的可写根也包含 profiles：同样被拒', () => {
    expect(resolveManagedTarget('skills', 'profiles/p1/config.yaml', home, tree).ok).toBe(false)
  })

  it('不属于只建议面的路径照常可写：人格文件、技能主文件与技能目录下的其他文件、档案内其他新文件', () => {
    const cases: Array<[Parameters<typeof resolveManagedTarget>[0], string]> = [
      ['system_prompt', 'profiles/p1/SOUL.md'],
      ['skills', 'skills/s1/SKILL.md'],
      ['skills', 'skills/s1/references/notes.md'],
      ['skills', 'profiles/p1/skills/s2/SKILL.md'],
      ['system_prompt', 'profiles/p1/notes.md'],
    ]
    for (const [key, path] of cases) expect(resolveManagedTarget(key, path, home, tree).ok, path).toBe(true)
  })

  it('单文件候选仍只认文件名格式（与改动前一致）', () => {
    expect(resolveManagedTarget('system_prompt', 'profiles/p1/config.yaml', home).ok).toBe(false)
    expect(resolveManagedTarget('system_prompt', 'profiles/p1/SOUL.md', home, { requireExists: false }).ok).toBe(true)
  })

  it('回滚恢复快照里的文件不受此限（存量提案可能改过这些文件）', () => {
    const r = resolveManagedTarget('system_prompt', 'profiles/p1/config.yaml', home, { requireExists: false, relaxPattern: true, restoring: true })
    expect(r.ok).toBe(true)
  })
})
