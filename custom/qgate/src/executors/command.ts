// command executor：argv 固定命令，无 shell 拼接（安全边界，设计 §5.5）。
// 退出码 → evidence.result：expectExit 命中=pass；不命中=fail；spawn/超时=error（→ INCONCLUSIVE，不是 FAIL）。

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { parseRawOutput } from '../core/raw-evidence.js'

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

  // rawOutput 交叉核验（v0.3 §3.1）：退出码之外，内核独立重解析原始测试报告重算计数。
  // exit 0 但报告含失败 / 总数低于 minTotal 静默空跑 / 报告缺失或畸形 → error（INCONCLUSIVE）。
  const raw = executor.rawOutput
  if (raw) {
    const reportPath = resolveWithin(cwd, raw.file)
    let text: string | null = null
    try {
      if (existsSync(reportPath)) text = readFileSync(reportPath, 'utf8')
    } catch {
      text = null
    }
    if (text === null) {
      out.evidence.result = 'error'
      out.evidence.summary = `rawOutput report missing: ${raw.file} (exit ${code} alone is not evidence — emit the report or drop the declaration)`
      return out
    }
    let counts
    try {
      counts = parseRawOutput(raw.format, text)
    } catch (e) {
      out.evidence.result = 'error'
      out.evidence.summary = `rawOutput ${raw.format} cross-check rejected: ${(e as Error).message}`
      return out
    }
    const tally = `${counts.parser}: ${counts.total} total/${counts.passed} passed/${counts.failed} failed/${counts.skipped} skipped`
    // 逐用例身份（v0.3.1 case binding）：内核重解析出的逐测试点结果——RTM 元门按 AC
    // 绑定逐用例复核的证据源（无关成功门禁不能充当 AC 证据）。
    out.evidence.caseOutcomes = counts.cases.map((c) => ({
      id: c.name,
      status: c.status === 'passed' ? 'pass' : c.status === 'skipped' ? 'skip' : 'fail',
    }))
    if (code === expectExit && counts.failed > 0) {
      out.evidence.result = 'error'
      out.evidence.summary = `exit ${code} but report has ${counts.failed} failed (${tally}) — exit code alone is not evidence`
      return out
    }
    if (code === expectExit && raw.minTotal !== undefined && counts.total < raw.minTotal) {
      out.evidence.result = 'error'
      out.evidence.summary = `silent no-op suspected: exit ${code} but only ${counts.total} tests < minTotal ${raw.minTotal} (${tally})`
      return out
    }
    out.evidence.artifacts = [raw.file]
    if (code === expectExit) {
      out.evidence.result = 'pass'
      out.evidence.independence = 'implementation-derived'
      out.evidence.summary = `exit ${code} (expected ${expectExit}); kernel cross-checked ${tally}`
    } else {
      out.evidence.result = 'fail'
      out.evidence.independence = 'implementation-derived'
      out.evidence.summary = `exit ${code} (expected ${expectExit}); kernel recomputed ${tally}; stderr tail: ${execResult.stderr.slice(-300) || '(empty)'}`
    }
    return out
  }

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
