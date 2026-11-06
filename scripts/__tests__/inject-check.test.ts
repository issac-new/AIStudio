// inject --check 全链干跑与失败汇总守门（2026-11-06 复盘 P0-2）。
// 事故形态：459 条补丁按行序逐条 git apply，无全链预检；agent 补丁失败只 WARN
// 逐条 continue，最终得到「带病可用」的静默半注入态。
// 链式语义：series 是顺序重放链，逐条 --check 会从 pristine 起算误报依赖前置补丁者，
// 因此实现按目标树分组、把补丁串成单个 stdin 流一次性检查。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
type CheckResult = {
  total: number
  failures: { patch: string; reason: string; group?: string }[]
  skipped: { patch: string; reason: string }[]
  groups: { studio: number; agent: number }
}
const { checkPatchChain } = await import('../inject.mjs') as {
  checkPatchChain: (opts?: Record<string, unknown>) => CheckResult
}

function harness(overrides: Record<string, unknown> = {}) {
  const calls: { text: string; tree: string }[] = []
  const result = checkPatchChain({
    patches: ['001-a.patch', '002-b.patch'],
    fileExists: () => true,
    read: (p: string) => `PATCH(${p})`,
    route: () => 'studio',
    isAgent: () => false,
    agentTreePresent: true,
    checkText: (text: string, tree: string) => { calls.push({ text, tree }) },
    ...overrides,
  })
  return { result, calls }
}

describe('inject --check 全链干跑', () => {
  it('全链成功：条目数完整、同一目标树只做一次串联检查且保持 series 顺序', () => {
    const { result, calls } = harness()
    expect(result.total).toBe(2)
    expect(result.failures).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.groups).toEqual({ studio: 2, agent: 0 })
    expect(calls).toHaveLength(1)
    expect(calls[0].text.indexOf('001-a.patch')).toBeLessThan(calls[0].text.indexOf('002-b.patch'))
  })

  it('缺文件进 failures，不静默吞掉', () => {
    const { result, calls } = harness({ fileExists: (p: string) => !String(p).includes('002') })
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].patch).toBe('002-b.patch')
    expect(result.failures[0].reason).toContain('补丁文件缺失')
    expect(result.groups.studio).toBe(1)
    expect(calls).toHaveLength(1)
  })

  it('链式失配聚合为一条失败并用前缀二分定位到首个破坏者', () => {
    const failingCalls: string[] = []
    const { result } = harness({
      checkText: (text: string) => { failingCalls.push(text); throw new Error('patch does not apply') },
    })
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].patch).toBe('001-a.patch')
    expect(result.failures[0].reason).toContain('链式检查失败')
    expect(result.failures[0].reason).toContain('patch does not apply')
    // 初次全链检查 + 二分前缀检查，证明确实做了定位而非简单报整组失败。
    expect(failingCalls.length).toBeGreaterThan(1)
  })

  it('按目标树分组，agent 组单独串联检查', () => {
    const { result, calls } = harness({
      route: (text: string) => (text.includes('002') ? 'agent' : 'studio'),
      isAgent: (t: string) => t === 'agent',
    })
    expect(result.groups).toEqual({ studio: 1, agent: 1 })
    expect(calls).toHaveLength(2)
  })

  it('目标树缺席单独归入 skipped，不算失败也不触发检查', () => {
    const { result, calls } = harness({ isAgent: () => true, agentTreePresent: false })
    expect(result.failures).toEqual([])
    expect(result.skipped).toHaveLength(2)
    expect(result.groups).toEqual({ studio: 0, agent: 0 })
    expect(calls).toHaveLength(0)
  })

  it('生产实现走串联 stdin --check，CLI 有直跑守卫，agent 失败有汇总与收紧档', () => {
    const text = readFileSync(join(ROOT, 'scripts/inject.mjs'), 'utf8')
    expect(text).toContain("applyPatchTextAtRoot(text, treeRoot, ' --check')")
    expect(text).toContain("extra} -")
    expect(text).toContain('isDirectRun && process.argv.includes(\'--check\')')
    expect(text).toContain('agentFailures')
    expect(text).toContain("process.env.STRICT_INJECT === '1'")
    expect(text).toContain('if (isDirectRun) main()')
  })
})
