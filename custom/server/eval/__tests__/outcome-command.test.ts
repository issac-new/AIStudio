// 命令式验收器守门（2026-10-30 HelixHarness 吸收轮）：
// 默认关闭 / 退出码核对 / argv 形态 / cwd 守卫 / 超时与启动失败一律失败（不伪造通过）。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listOutcomeVerifiers, runOutcomeCheck } from '../outcome'
import type { OutcomeCheckDecl } from '../types'

let root: string
const NODE = process.execPath
const ctxBase = () => ({ runStartedAt: Date.now(), allowedRoots: [root] })
const decl = (d: Partial<OutcomeCheckDecl>): OutcomeCheckDecl => ({ verifier: 'command', params: {}, ...d })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'outcome-cmd-'))
  delete process.env.EVAL_ALLOW_COMMANDS
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.EVAL_ALLOW_COMMANDS
})

describe('command 验收器', () => {
  it('已注册且在默认关闭时 fail-closed（不伪造通过）', async () => {
    expect(listOutcomeVerifiers()).toContain('command')
    const r = await runOutcomeCheck(decl({ argv: [NODE, '-e', 'process.exit(0)'], params: { cwd: root } }), ctxBase())
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('未启用')
  })

  it('启用后退出码 0 达成', async () => {
    process.env.EVAL_ALLOW_COMMANDS = '1'
    const r = await runOutcomeCheck(decl({ argv: [NODE, '-e', 'process.exit(0)'], params: { cwd: root } }), ctxBase())
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('退出码 0')
  })

  it('非零退出与期望不符判失败；expectExit 命中则通过', async () => {
    process.env.EVAL_ALLOW_COMMANDS = '1'
    const argv = [NODE, '-e', 'process.exit(3)']
    const bad = await runOutcomeCheck(decl({ argv, params: { cwd: root } }), ctxBase())
    expect(bad.ok).toBe(false)
    expect(bad.detail).toContain('期望 0')
    const good = await runOutcomeCheck(decl({ argv, params: { cwd: root }, expectExit: 3 }), ctxBase())
    expect(good.ok).toBe(true)
  })

  it('argv 缺失/非法 → 失败', async () => {
    process.env.EVAL_ALLOW_COMMANDS = '1'
    const noArgv = await runOutcomeCheck(decl({ params: { cwd: root } }), ctxBase())
    expect(noArgv.ok).toBe(false)
    const emptyItem = await runOutcomeCheck(decl({ argv: ['  '], params: { cwd: root } }), ctxBase())
    expect(emptyItem.ok).toBe(false)
  })

  it('cwd 越出 allowedRoots → fail-closed', async () => {
    process.env.EVAL_ALLOW_COMMANDS = '1'
    const r = await runOutcomeCheck(decl({ argv: [NODE, '-e', 'process.exit(0)'], params: { cwd: '/etc' } }), ctxBase())
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('不在允许根目录内')
  })

  it('执行异常/超时 → 失败且带原因', async () => {
    process.env.EVAL_ALLOW_COMMANDS = '1'
    const ctx = { ...ctxBase(), commandExec: async () => Promise.reject(new Error('timed out after 1000ms')) }
    const r = await runOutcomeCheck(decl({ argv: [NODE, '-e', '0'], params: { cwd: root } }), ctx)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('命令执行失败')
  })
})
