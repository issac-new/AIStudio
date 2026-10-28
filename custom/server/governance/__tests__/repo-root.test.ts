// 治理仓根解析守门（2026-10-28 清偿）：
// 三级序 GOVERNANCE_REPO → OBS_SIM_ROOT/central/aipaydev → <cwd>/governance；
// 末级不得再出现外机绝对路径（旧实现写死 /Volumes/nvme2230，卷缺席时把「源缺席」
// 伪装成有效路径）。
import { describe, expect, it, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { governanceRepoRoot } from '../repo-root'

const saved = { GOVERNANCE_REPO: process.env.GOVERNANCE_REPO, OBS_SIM_ROOT: process.env.OBS_SIM_ROOT, AIPAY_SIM_ROOT: process.env.AIPAY_SIM_ROOT }

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k as keyof typeof saved]
    else process.env[k as keyof typeof saved] = v
  }
})

describe('governanceRepoRoot 解析序', () => {
  it('显式 GOVERNANCE_REPO 最高优先', () => {
    process.env.GOVERNANCE_REPO = '/tmp/explicit-governance'
    process.env.OBS_SIM_ROOT = '/tmp/sim'
    expect(governanceRepoRoot()).toBe('/tmp/explicit-governance')
  })

  it('OBS_SIM_ROOT 次选，拼 central/aipaydev 且去尾斜杠', () => {
    delete process.env.GOVERNANCE_REPO
    process.env.OBS_SIM_ROOT = '/tmp/sim/'
    expect(governanceRepoRoot()).toBe('/tmp/sim/central/aipaydev')
  })

  it('末级回落检出根 governance/，且源码不再出现外机绝对路径', () => {
    delete process.env.GOVERNANCE_REPO
    delete process.env.OBS_SIM_ROOT
    delete process.env.AIPAY_SIM_ROOT
    expect(governanceRepoRoot()).toBe(resolve(process.cwd(), 'governance'))
    const src = readFileSync(resolve(__dirname, '../repo-root.ts'), 'utf8')
    // 只查代码行：注释里保留事故史是刻意的，不算外机路径回落
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toContain('/Volumes/')
    expect(code).not.toContain('nvme2230')
  })
})
