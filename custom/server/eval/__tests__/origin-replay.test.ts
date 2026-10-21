// overlay[eval] origin 自动复判守门（2026-10-21 生产失败回流轮）。
// 原证据只用于复现与诊断；修复关闭必须认 fresh explicit 证据。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetJudgeDefaultsForTests,
  _useStoreDirForTests,
  appendRun,
  appendTasksToSet,
  createRemediation,
  getRun,
  listRuns,
  loadEvalConfig,
  reflowTraceToSet,
  runReplayEval,
  sealSet,
  verifyRemediation,
  type AskFn,
} from '../index'
import { sampleFromTrace, sampleSpanFromTrace } from '../trace-sampler'

let storeDir: string
let traceDir: string

beforeEach(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'eval-origin-store-'))
  traceDir = mkdtempSync(join(tmpdir(), 'eval-origin-trace-'))
  _useStoreDirForTests(storeDir)
  process.env.EVAL_TRACE_DIR = traceDir
  process.env.HERMES_TRACES_DIR = traceDir
  _resetJudgeDefaultsForTests()
})

afterEach(() => {
  delete process.env.EVAL_TRACE_DIR
  delete process.env.HERMES_TRACES_DIR
  rmSync(storeDir, { recursive: true, force: true })
  rmSync(traceDir, { recursive: true, force: true })
})

const TRACE = [
  { type: 'header', session_id: 'prod-origin', started_at: 1000, model: 'glm-5' },
  { type: 'chunk', kind: 'llm_span', phase: 'post', api_request_id: 'req-1', usage: { input_tokens: 20, output_tokens: 5 }, response_preview: '测试失败' },
  { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-1', api_request_id: 'req-1', tool_name: 'run_tests', status: 'error', error_message: 'login spec failed', duration_ms: 100, args: { cmd: 'npm test -- login' } },
  { type: 'trailer', session_id: 'prod-origin', duration_ms: 300 },
]

function writeTrace(lines: unknown[] = TRACE): void {
  writeFileSync(join(traceDir, 'prod-origin.jsonl'), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    problem: '生产会话没有修好登录测试',
    expectedBehavior: '修复后登录测试通过',
    rubric: [{ id: 'a1', text: '证据是否包含修复完成标记', expect: 'yes', kind: 'result', s0: { kind: 'regex', pattern: 'FIXED' } }],
    ...overrides,
  }
}

function reflow(overrides: Record<string, unknown> = {}) {
  writeTrace()
  const preview = sampleFromTrace('prod-origin', { tracesDir: traceDir })
  expect(preview.ok).toBe(true)
  return reflowTraceToSet({
    sessionId: 'prod-origin',
    expectedTraceHash: preview.meta!.traceHash!,
    task: task(overrides),
  }, { tracesDir: traceDir })
}

function deps(ask?: AskFn) {
  return {
    judge: { config: loadEvalConfig(), ...(ask ? { ask } : {}) },
    outcomeCtx: { runStartedAt: Date.now() },
  }
}

describe('origin 自动复判', () => {
  it('生产失败转题后可按 origin 复现，但修复关闭必须提供 fresh explicit 证据', async () => {
    const reflowed = reflow()
    expect(reflowed.ok).toBe(true)
    if (!reflowed.ok) return

    const originRun = await runReplayEval({ setId: reflowed.set.id, samples: {}, useOrigin: true }, deps())
    expect(originRun.ok).toBe(true)
    if (!originRun.ok) return
    expect(originRun.run.evidenceMode).toBe('origin')
    expect(originRun.run.k).toBe(1)
    expect(originRun.run.aggregates.statisticallyInsufficient).toBe(true)
    expect(originRun.run.attempts[0]).toMatchObject({ taskId: reflowed.taskId, sessionId: 'prod-origin', passed: false })

    const remediation = createRemediation({ runId: originRun.run.id, taskId: reflowed.taskId, sampleIdx: 1 })
    expect(remediation.ok).toBe(true)
    if (!remediation.ok) return

    appendRun({
      id: 'diagnostic-pass',
      setId: reflowed.set.id,
      setHash: originRun.run.setHash,
      setRevision: originRun.run.setRevision,
      target: {},
      k: 1,
      status: 'done',
      evidenceMode: 'origin',
      attempts: [{ taskId: reflowed.taskId, sampleIdx: 1, verdicts: [], passed: true }],
      aggregates: originRun.run.aggregates,
      createdAt: Date.now(),
    })
    const blocked = verifyRemediation(remediation.remediation.id, 'diagnostic-pass')
    expect(blocked.ok).toBe(false)
    expect(blocked.ok === false && blocked.problems.join('\n')).toContain('诊断证据')
    expect(createRemediation({ runId: originRun.run.id, taskId: reflowed.taskId, sampleIdx: 1 }).ok).toBe(true)

    const fresh = await runReplayEval({
      setId: reflowed.set.id,
      samples: { [reflowed.taskId]: [{ evidence: { transcript: 'FIXED: login spec passed' } }] },
      useOrigin: true,
      expectedSetHash: originRun.run.setHash,
      expectedRevision: originRun.run.setRevision,
    }, deps())
    expect(fresh.ok).toBe(true)
    if (!fresh.ok) return
    expect(fresh.run.evidenceMode).toBe('explicit')
    expect(fresh.run.attempts[0].passed).toBe(true)
    const closed = verifyRemediation(remediation.remediation.id, fresh.run.id)
    expect(closed.ok).toBe(true)
    if (closed.ok) expect(closed.closed).toBe(true)
  })

  it('显式 samples 优先于 origin；没有样本也没有 origin 的任务使整次运行拒绝', async () => {
    const reflowed = reflow()
    expect(reflowed.ok).toBe(true)
    if (!reflowed.ok) return
    const explicit = await runReplayEval({
      setId: reflowed.set.id,
      samples: { [reflowed.taskId]: [{ evidence: { transcript: 'FIXED by fresh run' } }] },
      useOrigin: true,
    }, deps())
    expect(explicit.ok).toBe(true)
    if (!explicit.ok) return
    expect(explicit.run.evidenceMode).toBe('explicit')
    expect(explicit.run.attempts[0].sessionId).toBeUndefined()
    expect(explicit.run.attempts[0].passed).toBe(true)

    const manual = appendTasksToSet(reflowed.set.id, [{
      id: 'manual-no-origin',
      problem: '手工题',
      expectedBehavior: '有显式证据',
      rubric: [{ id: 'a1', text: '包含 OK', expect: 'yes', kind: 'result', s0: { kind: 'regex', pattern: 'OK' } }],
    }])
    expect(manual.ok).toBe(true)
    const rejected = await runReplayEval({ setId: reflowed.set.id, samples: {}, useOrigin: true }, deps())
    expect(rejected.ok).toBe(false)
    expect(rejected.ok === false && rejected.problems.join('\n')).toContain('manual-no-origin')
    expect(getRun((rejected as { run?: { id: string } }).run?.id ?? '')).toBeUndefined()
  })

  it('span origin 保留 spanRef，不会扩展成整 session', async () => {
    writeTrace()
    const preview = sampleSpanFromTrace('prod-origin', 'tc-1', { tracesDir: traceDir })
    expect(preview.ok).toBe(true)
    const reflowed = reflowTraceToSet({
      sessionId: 'prod-origin',
      spanRef: 'tc-1',
      expectedTraceHash: preview.meta!.traceHash!,
      task: task(),
    }, { tracesDir: traceDir })
    expect(reflowed.ok).toBe(true)
    if (!reflowed.ok) return

    const run = await runReplayEval({ setId: reflowed.set.id, samples: {}, useOrigin: true }, deps())
    expect(run.ok).toBe(true)
    if (!run.ok) return
    expect(run.run.evidenceMode).toBe('origin')
    expect(run.run.attempts[0]).toMatchObject({ sessionId: 'prod-origin', spanRef: 'tc-1' })
    expect(run.run.attempts[0].toolCalls).toHaveLength(1)
  })

  it('密封集拒绝按 origin 自动展开', async () => {
    const reflowed = reflow()
    expect(reflowed.ok).toBe(true)
    if (!reflowed.ok) return
    expect(sealSet(reflowed.set.id, 'tester').ok).toBe(true)
    const run = await runReplayEval({ setId: reflowed.set.id, samples: {}, useOrigin: true }, deps())
    expect(run.ok).toBe(false)
    expect(run.ok === false && run.problems.join('\n')).toContain('密封集')
  })

  it('origin 证据 hash 漂移时拒绝运行，judge 零调用且不落 run', async () => {
    let askCalls = 0
    const ask: AskFn = async () => {
      askCalls += 1
      return { a1: 0.9 }
    }
    const reflowed = reflow({ rubric: [{ id: 'a1', text: '裁判判断是否通过', expect: 'yes', kind: 'result' }] })
    expect(reflowed.ok).toBe(true)
    if (!reflowed.ok) return
    const before = listRuns(reflowed.set.id).length

    writeTrace([...TRACE, { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-2', tool_name: 'git_status', status: 'ok' }])
    const run = await runReplayEval({ setId: reflowed.set.id, samples: {}, useOrigin: true }, deps(ask))
    expect(run.ok).toBe(false)
    expect(run.ok === false && run.problems.join('\n')).toContain('trace')
    expect(askCalls).toBe(0)
    expect(listRuns(reflowed.set.id)).toHaveLength(before)
  })
})
