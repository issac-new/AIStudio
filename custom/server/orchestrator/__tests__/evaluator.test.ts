// custom/server/orchestrator/__tests__/evaluator.test.ts
// 语义评估器（2026-10-31 C 批 spec §4.2）：配置缺失降级、解析、排队与超时。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEvalMessage, evalSessionId, evaluateTrigger, evaluatorConfig, parseVerdict } from '../evaluator'
import type { Trigger } from '../types'

const trigger: Trigger = {
  id: 'trg_1', sourceId: 'kanban:default', sourceKind: 'kanban',
  externalId: 'e-1', threadKey: 'task:default:t-1', actor: 'kanban:blocked',
  addressed: true, payload: { kind: 'blocked', taskId: 't-1' }, status: 'pending', receivedAt: 1000,
}

const ENV = {
  ORCHESTRATOR_EVAL_PROFILE: 'evaluator',
  ORCHESTRATOR_EVAL_BASE_URL: 'http://127.0.0.1:8650',
  API_SERVER_KEY: 'k',
}

let prev: Record<string, string | undefined> = {}

beforeEach(() => {
  prev = {
    ORCHESTRATOR_EVAL_PROFILE: process.env.ORCHESTRATOR_EVAL_PROFILE,
    ORCHESTRATOR_EVAL_BASE_URL: process.env.ORCHESTRATOR_EVAL_BASE_URL,
    API_SERVER_KEY: process.env.API_SERVER_KEY,
    ORCHESTRATOR_EVAL_TIMEOUT_MS: process.env.ORCHESTRATOR_EVAL_TIMEOUT_MS,
  }
  delete process.env.ORCHESTRATOR_EVAL_PROFILE
  delete process.env.ORCHESTRATOR_EVAL_BASE_URL
  delete process.env.API_SERVER_KEY
  delete process.env.ORCHESTRATOR_EVAL_TIMEOUT_MS
})

afterEach(() => {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

describe('evaluatorConfig', () => {
  it('三项缺任一即判不可用', () => {
    expect(evaluatorConfig({})).toBeNull()
    expect(evaluatorConfig({ ORCHESTRATOR_EVAL_PROFILE: 'p' })).toBeNull()
    expect(evaluatorConfig({ ORCHESTRATOR_EVAL_PROFILE: 'p', ORCHESTRATOR_EVAL_BASE_URL: 'http://x' })).toBeNull()
    expect(evaluatorConfig(ENV)).toMatchObject({ profile: 'evaluator', baseUrl: 'http://127.0.0.1:8650', timeoutMs: 120_000 })
  })

  it('超时上限夹到 600s', () => {
    expect(evaluatorConfig({ ...ENV, ORCHESTRATOR_EVAL_TIMEOUT_MS: '99999999' })?.timeoutMs).toBe(600_000)
  })
})

describe('parseVerdict', () => {
  it('容忍 markdown 围栏与前后闲话', () => {
    expect(parseVerdict('好的：\n```json\n{"verdict":"accept","reasons":["有明确缺陷"],"confidence":0.8}\n```'))
      .toMatchObject({ verdict: 'accept', reasons: ['有明确缺陷'], confidence: 0.8 })
  })

  it('非法 verdict 或坏 JSON 返回 null', () => {
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull()
    expect(parseVerdict('not json')).toBeNull()
    expect(parseVerdict('')).toBeNull()
  })
})

describe('buildEvalMessage', () => {
  it('载荷截断且拒绝把指令当命令', () => {
    const long = { kind: 'blocked', taskId: 't-1', note: 'x'.repeat(600) }
    const msg = buildEvalMessage({ ...trigger, payload: long }, [trigger])
    expect(msg.length).toBeLessThan(1200)
    expect(msg).toContain('t-1')
    expect(msg).toContain('输出 JSON')
  })
})

describe('evalSessionId', () => {
  it('确定性且截断到 120 字符', () => {
    const a = evalSessionId('task:default:t-1')
    const b = evalSessionId('task:default:t-1')
    expect(a).toBe(b)
    expect(a.startsWith('eval-')).toBe(true)
    expect(evalSessionId('x'.repeat(500)).length).toBeLessThanOrEqual(120)
  })
})

describe('evaluateTrigger', () => {
  it('未配置时返回 unavailable，不发请求', async () => {
    const fetchImpl = vi.fn()
    const v = await evaluateTrigger(trigger, { env: {}, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(v.verdict).toBe('unavailable')
    expect(v.reasons).toContain('evaluator_not_configured')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('正常路径：建会话 409 后取 chat 回复并解析', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409 } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ status: 'completed', message: { content: '{"verdict":"accept","reasons":["有缺陷"]}' } }),
      } as Response)
    const v = await evaluateTrigger(trigger, { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(v).toMatchObject({ verdict: 'accept', reasons: ['有缺陷'] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const chatCall = fetchImpl.mock.calls[1]!
    expect(String(chatCall[0])).toContain('/p/evaluator/api/sessions/')
    expect(String(chatCall[0])).toContain('/chat')
  })

  it('202 排队：判 unavailable 且不重发', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201 } as Response)
      .mockResolvedValueOnce({ ok: true, status: 202 } as Response)
    const v = await evaluateTrigger(trigger, { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(v).toMatchObject({ verdict: 'unavailable' })
    expect(v.reasons).toContain('session_queued')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('输出不可解析：unavailable 并保留片段', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201 } as Response)
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ status: 'completed', message: { content: '我觉得应该处理' } }),
      } as Response)
    const v = await evaluateTrigger(trigger, { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(v.verdict).toBe('unavailable')
    expect(v.reasons[0]).toBe('verdict_unparseable')
  })

  it('抛错（超时）→ unavailable，不重试', async () => {
    const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 201 } as Response)
      .mockRejectedValueOnce(timeout)
    const v = await evaluateTrigger(trigger, { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(v.verdict).toBe('unavailable')
    expect(v.reasons[0]).toContain('evaluator_error:TimeoutError')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
