// PR 交付链规约守门（multica：--base 显式/分支规约/验据锚点/提示词四条）。
import { describe, it, expect } from 'vitest'
import { buildPrPrompt, validatePr } from '../pr-delivery'

const good = {
  branch: 'feat/login-fix', base: 'main', title: '修复登录页会话丢失',
  verification: { command: 'pytest tests/login -q', summary: '12/12 绿' },
}

describe('PR 交付规约（multica 语义）', () => {
  it('合规 PR 零 issue；--base 缺失/分支不合规/缺验据逐条报', () => {
    expect(validatePr(good)).toEqual([])
    const noBase = validatePr({ ...good, base: '' })
    expect(noBase[0]).toMatchObject({ where: 'base' })
    const badBranch = validatePr({ ...good, branch: 'fix-up' })
    expect(badBranch.some((i) => i.where === 'branch')).toBe(true)
    const noVer = validatePr({ ...good, verification: undefined })
    expect(noVer.some((i) => i.where === 'verification')).toBe(true)
    const emptyVer = validatePr({ ...good, verification: { command: ' ', summary: '' } })
    expect(emptyVer.some((i) => i.where === 'verification')).toBe(true)
  })

  it('提示词四条（--base 命令/分支/验据/交付边界）', () => {
    const p = buildPrPrompt(good)
    expect(p).toContain('gh pr create --base main')
    expect(p).toContain('feat/login-fix')
    expect(p).toContain('验证证据')
    expect(p).toContain('合并是人的动作')
  })
})
