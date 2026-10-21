// qgate command executor 沙箱档守门（2026-10-21 挂账清偿批次 C）：
// sandbox:true → OS 沙箱执行（exec-sandbox 单一事实源）；不可用/被策略禁用 →
// error(INCONCLUSIVE) 且不执行命令，绝不降级裸跑。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommandExecutor } from '../src/executors/command.js'
import { detectSandboxSupport } from '../src/executors/exec-sandbox.js'
import type { ExecutorSpec } from '../src/core/types.js'

const scratch = mkdtempSync(join(tmpdir(), 'qgate-sandbox-'))

const spec = (over: Partial<ExecutorSpec> = {}): ExecutorSpec => ({
  id: 'exec-1',
  type: 'command',
  evidenceType: 'test-report',
  command: ['/bin/sh', '-c', 'echo sandboxed'],
  ...over,
} as ExecutorSpec)

const input = { runId: 'r', gateId: 'g', workspace: scratch }

afterEach(() => { delete process.env.HERMES_EXEC_SANDBOX })

describe('command executor sandbox 档', () => {
  it('沙箱被策略禁用（HERMES_EXEC_SANDBOX=off）→ error(INCONCLUSIVE)，命令不裸跑', async () => {
    process.env.HERMES_EXEC_SANDBOX = 'off'
    const out = await runCommandExecutor(spec({ sandbox: true, command: ['/bin/sh', '-c', 'echo LEAKED'] }), input)
    expect(out.evidence.result).toBe('error')
    expect(out.evidence.summary).toContain('sandbox')
    expect(out.stdoutPreview ?? '').not.toContain('LEAKED')
  })

  it('本机沙箱可用时命令在沙箱内执行，退出码命中=pass', async () => {
    const support = detectSandboxSupport()
    if (!support.available) return // 非目标平台：由上一例覆盖 fail-closed 语义
    const out = await runCommandExecutor(spec({ sandbox: true }), input)
    expect(out.evidence.result).not.toBe('error')
    expect(out.stdoutPreview).toContain('sandboxed')
    expect(out.evidence.provenance.command).toContain('[sandbox]')
  }, 30_000)

  it('沙箱内超时 → error(INCONCLUSIVE) 而非 fail', async () => {
    const support = detectSandboxSupport()
    if (!support.available) return
    const out = await runCommandExecutor(spec({ sandbox: true, command: ['/bin/sh', '-c', 'sleep 3'], timeoutMs: 500 }), input)
    expect(out.evidence.result).toBe('error')
    expect(out.evidence.summary).toContain('timed out')
  }, 30_000)
})
