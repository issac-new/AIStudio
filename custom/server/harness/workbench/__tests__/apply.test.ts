// managed 面写盘/回滚：快照、原子写、外部改动拒绝。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { applyProposalFile, rollbackProposalFile } from '../apply'
import { sha256 } from '../loop'
import type { Proposal } from '../types'

let dir: string
let file: string

function proposal(content = 'new persona'): Proposal {
  const path = 'profiles/p1/SOUL.md'
  return {
    id: 'hw-001', title: 't', hypothesis: 'h', surfaceKey: 'system_prompt', targetPath: path,
    risk: 'medium', mode: 'parallel', status: 'promoted', budgetCapUsd: 5,
    evidenceRefs: ['task:t1'], experienceIds: [], baselineRunId: 'r', baseline: null,
    base: { content: 'old persona', digest: sha256('old persona'), revision: null, exists: true },
    variants: [{ id: 'v1', label: 'v1', content, digest: sha256(content), diffSummary: { added: 1, removed: 1, unchanged: 0 } }],
    probes: [], approval: null,
    composition: { variantId: 'v1', digest: sha256(content), rationale: 'x', actor: 'a', at: 'now' },
    promotion: { actor: 'a', at: 'now', digest: sha256(content), applied: true, targetPath: path },
    rollback: null, createdBy: 'a', createdAt: 'now', updatedAt: 'now',
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness2-apply-'))
  process.env.HERMES_HOME = join(dir, 'home')
  process.env.HARNESS2_STORE = join(dir, 'store', 'workbench.json')
  process.env.HARNESS2_APPLY = '1'
  mkdirSync(join(process.env.HERMES_HOME, 'profiles/p1'), { recursive: true })
  file = join(process.env.HERMES_HOME, 'profiles/p1/SOUL.md')
  writeFileSync(file, 'old persona')
})

afterEach(() => {
  for (const k of ['HERMES_HOME', 'HARNESS2_STORE', 'HARNESS2_APPLY']) delete process.env[k]
  rmSync(dir, { recursive: true, force: true })
})

describe('applyProposalFile', () => {
  it('写前备份、原子写入候选内容', () => {
    const res = applyProposalFile(proposal())
    expect(res.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('new persona')
    expect(res.backupPath && existsSync(res.backupPath)).toBe(true)
    expect(readFileSync(res.backupPath!, 'utf8')).toBe('old persona')
  })

  it('未开 HARNESS2_APPLY 拒绝', () => {
    delete process.env.HARNESS2_APPLY
    const res = applyProposalFile(proposal())
    expect(res.ok).toBe(false)
    expect(res.error).toContain('HARNESS2_APPLY')
  })

  it('目标被外部改动后拒绝覆盖', () => {
    writeFileSync(file, 'someone else')
    const res = applyProposalFile(proposal())
    expect(res.ok).toBe(false)
    expect(res.error).toContain('已')
    expect(readFileSync(file, 'utf8')).toBe('someone else')
  })
})

describe('rollbackProposalFile', () => {
  it('晋级后回滚到基线内容', () => {
    const p = proposal()
    expect(applyProposalFile(p).ok).toBe(true)
    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('old persona')
  })

  it('晋级后文件被外部改动 → 拒绝回滚覆盖', () => {
    const p = proposal()
    expect(applyProposalFile(p).ok).toBe(true)
    writeFileSync(file, 'external edit')
    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe('external edit')
  })

  it('未实际写盘的提案回滚是 no-op', () => {
    const p = proposal()
    p.promotion = { ...p.promotion!, applied: false }
    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('old persona')
  })

  it('带 .bak 快照的单文件回滚：文件恢复到基线内容并返回基线摘要（快照文件只用来选分支，不读它）', () => {
    const p = proposal()
    const backupPath = join(dir, 'store', 'backups', 'hw-001-1.bak')
    p.promotion = { ...p.promotion!, backupPath }
    writeFileSync(file, 'new persona')
    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(true)
    expect(res.digest).toBe(sha256('old persona'))
    expect(readFileSync(file, 'utf8')).toBe('old persona')
    expect(existsSync(backupPath)).toBe(false)
  })

  it('带 .bak 快照的单文件回滚：文件被外部改动时拒绝覆盖', () => {
    const p = proposal()
    p.promotion = { ...p.promotion!, backupPath: join(dir, 'store', 'backups', 'hw-001-1.bak') }
    writeFileSync(file, 'external edit')
    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('拒绝回滚覆盖')
    expect(readFileSync(file, 'utf8')).toBe('external edit')
  })
})

describe('多文件回滚（JSON 树快照）：先全部校验，再恢复', () => {
  interface Touched { path: string; abs: string; existed: boolean; oldContent: string | null; action: 'write' | 'delete'; newContent: string | null }
  let skill: string

  beforeEach(() => {
    mkdirSync(join(process.env.HERMES_HOME, 'skills/s1'), { recursive: true })
    skill = join(process.env.HERMES_HOME, 'skills/s1/SKILL.md')
  })

  /** 把一份树快照写到备份目录，返回指向它的已写盘晋级记录。 */
  function treePromotion(touched: Touched[], id: string): Proposal {
    const backupDir = join(dir, 'store', 'backups')
    mkdirSync(backupDir, { recursive: true })
    const backupPath = join(backupDir, `${id}-tree-1.json`)
    writeFileSync(backupPath, JSON.stringify({ touched }))
    const p = proposal()
    return { ...p, id, surfaceKey: 'skills', promotion: { actor: 'a', at: 'now', digest: 'tree-digest', applied: true, backupPath } }
  }

  const soulTouched = (newContent: string): Touched => ({ path: 'profiles/p1/SOUL.md', abs: file, existed: true, oldContent: 'old persona', action: 'write', newContent })
  const skillTouched = (newContent: string): Touched => ({ path: 'skills/s1/SKILL.md', abs: skill, existed: true, oldContent: 'old skill', action: 'write', newContent })

  it('全部文件仍等于晋级时内容：各自恢复到改前内容；晋级时新建的文件被删掉、删掉的文件被重建', () => {
    const fresh = join(process.env.HERMES_HOME, 'skills/s1/FRESH.md')
    const removed = join(process.env.HERMES_HOME, 'skills/s1/REMOVED.md')
    const p = treePromotion([
      soulTouched('new persona'),
      skillTouched('new skill'),
      { path: 'skills/s1/FRESH.md', abs: fresh, existed: false, oldContent: null, action: 'write', newContent: 'fresh' },
      { path: 'skills/s1/REMOVED.md', abs: removed, existed: true, oldContent: 'removed earlier', action: 'delete', newContent: null },
    ], 'hw-tree-ok')
    writeFileSync(file, 'new persona')
    writeFileSync(skill, 'new skill')
    writeFileSync(fresh, 'fresh')

    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('old persona')
    expect(readFileSync(skill, 'utf8')).toBe('old skill')
    expect(existsSync(fresh)).toBe(false)
    expect(readFileSync(removed, 'utf8')).toBe('removed earlier')
  })

  it('后面一个文件被外部改动：返回失败，前面本来能恢复的文件一个都不动（全有或全无）', () => {
    const p = treePromotion([soulTouched('new persona'), skillTouched('new skill')], 'hw-tree-drift')
    writeFileSync(file, 'new persona')
    writeFileSync(skill, 'external skill')

    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('skills/s1/SKILL.md')
    expect(res.error).toContain('拒绝回滚覆盖')
    // 逐文件交替时会先把 SOUL.md 恢复成 old persona；先全部校验则它保持晋级后的内容
    expect(readFileSync(file, 'utf8')).toBe('new persona')
    expect(readFileSync(skill, 'utf8')).toBe('external skill')
  })

  it('校验失败后现场不变，排除外部改动后再回滚一次就能完成', () => {
    const p = treePromotion([soulTouched('new persona'), skillTouched('new skill')], 'hw-tree-retry')
    writeFileSync(file, 'new persona')
    writeFileSync(skill, 'external skill')
    expect(rollbackProposalFile(p).ok).toBe(false)

    writeFileSync(skill, 'new skill')
    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('old persona')
    expect(readFileSync(skill, 'utf8')).toBe('old skill')
  })

  it('被删除的文件与被重建的删除路径同样在校验阶段拦下', () => {
    const removed = join(process.env.HERMES_HOME, 'skills/s1/REMOVED.md')
    const p = treePromotion([soulTouched('new persona'), { path: 'skills/s1/REMOVED.md', abs: removed, existed: true, oldContent: 'x', action: 'delete', newContent: null }], 'hw-tree-rebuilt')
    writeFileSync(file, 'new persona')
    writeFileSync(removed, 'rebuilt')

    const res = rollbackProposalFile(p)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('被外部重建')
    expect(readFileSync(file, 'utf8')).toBe('new persona')
  })
})
