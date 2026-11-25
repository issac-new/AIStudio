// inject --check 全链干跑与失败汇总守门（2026-11-06 复盘 P0-2）。
// 事故形态：459 条补丁按行序逐条 git apply，无全链预检；agent 补丁失败只 WARN
// 逐条 continue，最终得到「带病可用」的静默半注入态。
// 链式语义：series 是顺序重放链，逐条 --check 会从 pristine 起算误报依赖前置补丁者，
// 因此实现按目标树分组、把补丁串成单个 stdin 流一次性检查。
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
type CheckResult = {
  total: number
  failures: { patch: string; reason: string; group?: string }[]
  skipped: { patch: string; reason: string }[]
  groups: { studio: number; agent: number }
}
type Sentinel = { verdict: 'ok' | 'reverted' | 'mixed'; lanes: Record<string, unknown> }
const { checkPatchChain, injectedTreeDiagnosis } = await import('../inject.mjs') as {
  checkPatchChain: (opts?: Record<string, unknown>) => CheckResult
  injectedTreeDiagnosis: (manifest: unknown, sentinel: Sentinel) => string | null
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

// 2026-11-25（挂账 N35-6）：干跑以当前工作树为输入。已注入的树上补丁已经落盘，链式检查
// 必然失败，旧输出只有一句“若目标树已注入过，先 npm run clean”，使用者读成补丁坏了。
// 锁三件事：①三种树形态各给各的结论；②CLI 先识别再决定跑不跑；③真实进程与判断一致。
describe('inject --check 干跑前的注入态识别', () => {
  const ok: Sentinel = { verdict: 'ok', lanes: {} }
  const manifest = { schemaVersion: 2, status: 'complete', patches: [{ name: 'a', status: 'applied' }, { name: 'b', status: 'applied' }] }

  it('已注入：给出明确说明，讲清为什么没跑、该在哪里跑', () => {
    const notice = injectedTreeDiagnosis(manifest, ok)
    expect(notice).toContain('当前树已注入')
    expect(notice).toContain('2 条补丁已应用')
    expect(notice).toContain('不代表补丁有问题')
    expect(notice).toContain('npm run ensure-injected')
  })

  it('干净树的三种形态都放行：无清单／清单里没有已应用项／清单残留而树已被还原', () => {
    expect(injectedTreeDiagnosis(null, ok)).toBeNull()
    expect(injectedTreeDiagnosis({ schemaVersion: 1, patches: [] }, ok)).toBeNull()
    expect(injectedTreeDiagnosis({ schemaVersion: 2, status: 'complete', patches: [] }, ok)).toBeNull()
    expect(injectedTreeDiagnosis(manifest, { verdict: 'reverted', lanes: {} })).toBeNull()
  })

  it('半注入态：说明并逐通道列出不在位的状态，指引 clean', () => {
    const mixed: Sentinel = {
      verdict: 'mixed',
      lanes: { 'hermes-agent': { state: 'partial', tracked: 3, present: 1, neutral: 0, missing: ['x.py'] } },
    }
    const notice = injectedTreeDiagnosis(manifest, mixed)
    expect(notice).toContain('半注入态')
    expect(notice).toContain('hermes-agent：部分还原')
    expect(notice).toContain('npm run clean')
  })

  it('CLI：先做注入态识别，识别出即退出，不再跑链式检查；旧的笼统提示已移除', () => {
    const text = readFileSync(join(ROOT, 'scripts/inject.mjs'), 'utf8')
    const block = text.slice(text.indexOf("isDirectRun && process.argv.includes('--check')"))
    const at = block.indexOf('injectedTreeNotice()')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(block.indexOf('checkPatchChain()'))
    expect(text).not.toContain('若目标树已注入过')
  })

  it('真实进程：树处于哪种形态，--check 就给哪种结论', () => {
    const stateOut = process.env.OVERLAY_STATE_OUT?.trim()
    const manifestPath = join(stateOut ? resolve(stateOut) : ROOT, '.overlay-injected.json')
    const declared = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, 'utf8')).patches ?? []).filter((p: { status: string }) => p.status === 'applied').length
      : 0
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/inject.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 180_000 })
    if (declared > 0) {
      expect(r.status, r.stderr).toBe(1)
      expect(r.stderr).toMatch(/当前树已注入|半注入态/)
      expect(r.stderr).toContain(`${declared} 条补丁已应用`)
      expect(r.stderr).not.toContain('链式检查失败')
    } else {
      // 干净树：照常干跑；补丁链在干净基线上必须整体可应用
      expect(r.status, r.stderr).toBe(0)
      expect(r.stdout).toContain('失败 0')
    }
  }, 200_000)
})
