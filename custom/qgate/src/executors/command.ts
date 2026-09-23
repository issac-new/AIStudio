// command executor：argv 固定命令，无 shell 拼接（安全边界，设计 §5.5）。
// 退出码 → evidence.result：expectExit 命中=pass；不命中=fail；spawn/超时=error（→ INCONCLUSIVE，不是 FAIL）。

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Evidence, ExecutorSpec } from '../core/types.js'

const DEFAULT_TIMEOUT_MS = 120_000

export interface CommandOutcome {
  evidence: Evidence
  stdoutPreview?: string
  stderrPreview?: string
}

export async function runCommandExecutor(
  executor: ExecutorSpec,
  input: { runId: string; gateId: string; workspace: string; commit?: string; treeHash?: string },
): Promise<CommandOutcome> {
  const argv = executor.command ?? []
  const expectExit = executor.expectExit ?? 0
  const timeoutMs = executor.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const cwd = executor.cwd
    ? resolveWithin(input.workspace, executor.cwd)
    : input.workspace
  const startedAt = Date.now()

  const execResult = await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; spawnError?: string }>((resolveP) => {
    let child
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      resolveP({ code: null, stdout: '', stderr: '', timedOut: false, spawnError: (e as Error).message })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout?.on('data', (c) => { if (stdout.length < 64_000) stdout += String(c) })
    child.stderr?.on('data', (c) => { if (stderr.length < 64_000) stderr += String(c) })
    child.on('error', (e) => { clearTimeout(timer); resolveP({ code: null, stdout, stderr, timedOut, spawnError: e.message }) })
    child.on('close', (code) => { clearTimeout(timer); resolveP({ code, stdout, stderr, timedOut }) })
  })

  const endedAt = Date.now()
  const id = `ev-${randomUUID().slice(0, 12)}`
  const out: CommandOutcome = { evidence: {
    id,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    provenance: {
      startedAt, endedAt,
      command: argv.join(' '),
      cwd,
      commit: input.commit,
      treeHash: input.treeHash,
    },
  }, stdoutPreview: execResult.stdout.slice(-2000), stderrPreview: execResult.stderr.slice(-2000) }

  if (execResult.spawnError) {
    out.evidence.summary = `spawn failed: ${execResult.spawnError}`
    out.evidence.provenance.exitCode = -1
    return out
  }
  if (execResult.timedOut) {
    out.evidence.summary = `timed out after ${timeoutMs}ms`
    out.evidence.provenance.exitCode = -2
    return out
  }
  const code = execResult.code ?? -3
  out.evidence.provenance.exitCode = code
  out.evidence.execution = 'exercised'
  if (code === expectExit) {
    out.evidence.result = 'pass'
    out.evidence.independence = 'implementation-derived'
    out.evidence.summary = `exit ${code} (expected ${expectExit})`
  } else {
    out.evidence.result = 'fail'
    out.evidence.independence = 'implementation-derived'
    out.evidence.summary = `exit ${code} (expected ${expectExit}); stderr tail: ${execResult.stderr.slice(-300) || '(empty)'}`
  }
  return out
}

import { resolve as resolvePath } from 'node:path'
import { isInside } from '../core/safe-path.js'
function resolveWithin(root: string, rel: string): string {
  const resolved = resolvePath(root, rel)
  return isInside(root, resolved) ? resolved : root
}
