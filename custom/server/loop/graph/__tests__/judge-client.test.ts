/** 独立 judge 客户端测试（2026-11-19 调度智能批）：解析/失败降级/截断。 */
import { describe, expect, it } from 'vitest'
import { createOpenAiJudgeClient } from '../judge-client'

function clientWithContent(content: string, status = 200) {
  const calls: Array<Record<string, unknown>> = []
  const fetchImpl = (async (_url: string, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return {
    calls,
    client: createOpenAiJudgeClient({
      baseUrl: 'http://judge.local/v1', model: 'judge-model', fetchImpl,
    }),
  }
}

describe('createOpenAiJudgeClient', () => {
  it('parses strict JSON score/reasoning', async () => {
    const { client } = clientWithContent('{"score":0.82,"reasoning":"tests present"}')
    await expect(client('', 'diff', 'rubric')).resolves.toEqual({
      score: 0.82, reasoning: 'tests present',
    })
  })

  it('parses fenced JSON', async () => {
    const { client } = clientWithContent('```json\n{"score":0.5,"reasoning":"partial"}\n```')
    await expect(client('m', 'diff', 'rubric')).resolves.toEqual({
      score: 0.5, reasoning: 'partial',
    })
  })

  it('HTTP failure degrades to pending', async () => {
    const { client } = clientWithContent('{}', 503)
    const verdict = await client('', 'diff', 'rubric')
    expect(verdict).toMatchObject({ status: 'pending' })
  })

  it('invalid JSON degrades to pending', async () => {
    const { client } = clientWithContent('not json at all')
    expect(await client('', 'diff', 'rubric')).toMatchObject({ status: 'pending' })
  })

  it('out-of-range score degrades to pending', async () => {
    const { client } = clientWithContent('{"score":1.7,"reasoning":"x"}')
    expect(await client('', 'diff', 'rubric')).toMatchObject({ status: 'pending' })
  })

  it('truncates oversized diff before sending', async () => {
    const { client, calls } = clientWithContent('{"score":0.9,"reasoning":"ok"}')
    const big = 'x'.repeat(25_000)
    await client('', big, 'rubric')
    const messages = calls[0].messages as Array<{ content?: string }>
    const user = messages.find((m) => m.content?.includes('Diff under review'))?.content ?? ''
    expect(user).toContain('diff truncated')
    expect(user.length).toBeLessThan(big.length)
  })
})
