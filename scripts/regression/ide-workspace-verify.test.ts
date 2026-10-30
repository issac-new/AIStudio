// IDE 工作区任务链探针资产守门（2026-10-31 回归清偿批）：
// 探针在位、语法可解析、判据面（深链一致性/Git 锚定）在文件内可检索——
// 防止资产被误删或判据被静默掏空。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const probe = resolve(__dirname, 'ide-workspace-verify.mjs')

describe('ide-workspace-verify 探针资产', () => {
  it('探针在位且语法可解析（node --check）', () => {
    expect(existsSync(probe)).toBe(true)
    execFileSync(process.execPath, ['--check', probe], { stdio: 'pipe' })
  })

  it('三轮一致性判据与 Git 锚定判据在面', () => {
    const src = readFileSync(probe, 'utf8')
    expect(src).toContain('round')                 // 三轮循环
    expect(src).toContain('workspaceOrigin')       // origin=task 切根断言
    expect(src).toContain('materialized')          // 物化断言
    expect(src).toContain('ide-sidepane-tab-review') // Git 页签锚定
    expect(src).toContain('IDE_VERIFY_TOKEN')      // 双角色 token 通道
  })
})
