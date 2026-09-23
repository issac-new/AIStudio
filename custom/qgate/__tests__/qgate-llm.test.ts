// LLM executor 守门（OD-005）：凭据缺失→INCONCLUSIVE；LLM 判 pass 也强转 conditional（永不单独构成 PASS）；
// 响应不可解析→error；网络失败→error 不 crash。fetch 全程 stub（不碰真网络）。
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { runLlmExecutor } from '../src/executors/llm.js'
import type { ExecutorSpec } from '../src/core/types.js'

const executor: ExecutorSpec = { id: 'llm-reviewer', type: 'llm', evidenceType: 'llm-review-result' }
const input = { runId: 'r1', gateId: 'llm.review-reasoner', workspace: '/tmp', changedPaths: ['src/a.ts'] }

describe('LLM executor', () => {
  const envBackup = { ...process.env }
  beforeEach(() => {
    delete process.env.QGATE_LLM_API_KEY
    delete process.env.QGATE_LLM_PROVIDER
    delete process.env.QGATE_LLM_BASE_URL
    delete process.env.QGATE_LLM_MODEL
  })
  afterEach(() => {
    process.env = { ...envBackup }
    vi.restoreAllMocks()
  })

  it('无凭据 → error/wired → INCONCLUSIVE 输入（不 crash）', async () => {
    const ev = await runLlmExecutor(executor, input)
    expect(ev.result).toBe('error')
    expect(ev.execution).toBe('wired')
    expect(ev.summary).toContain('QGATE_LLM_API_KEY')
  })

  it('LLM 判 pass → 强转 conditional（v0.1 §4.3：LLM 判定不单独构成 PASS）', async () => {
    process.env.QGATE_LLM_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"verdict":"pass","summary":"looks clean"}' } }],
    }), { status: 200 })))
    const ev = await runLlmExecutor(executor, input)
    expect(ev.result).toBe('conditional')
    expect(ev.execution).toBe('exercised')
    expect(ev.summary).toContain('cannot constitute PASS')
  })

  it('LLM 判 fail → fail 证据；判 conditional → conditional', async () => {
    process.env.QGATE_LLM_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"verdict":"fail","summary":"nullability violated"}' } }],
    }), { status: 200 })))
    const fail = await runLlmExecutor(executor, input)
    expect(fail.result).toBe('fail')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '基于评审：{"verdict":"conditional","summary":"cannot prove idempotency","conditions":["add retry test"]}' } }],
    }), { status: 200 })))
    const cond = await runLlmExecutor(executor, input)
    expect(cond.result).toBe('conditional')
  })

  it('http 非 200 / 响应非 JSON / 网络异常 → error 不 crash', async () => {
    process.env.QGATE_LLM_API_KEY = 'sk-test'
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota', { status: 429 })))
    expect((await runLlmExecutor(executor, input)).result).toBe('error')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '这根本不是 JSON' } }],
    }), { status: 200 })))
    expect((await runLlmExecutor(executor, input)).result).toBe('error')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    const ev = await runLlmExecutor(executor, input)
    expect(ev.result).toBe('error')
    expect(ev.summary).toContain('ECONNRESET')
  })
})
