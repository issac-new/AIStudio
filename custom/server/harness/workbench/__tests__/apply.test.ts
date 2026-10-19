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
})
