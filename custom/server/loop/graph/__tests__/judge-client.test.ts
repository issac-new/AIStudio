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

function anthropicClient(text: string, status = 200) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers?: unknown }> = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      headers: init?.headers,
    })
    return new Response(JSON.stringify({
      content: [
        { type: 'thinking', thinking: 'internal reasoning must be ignored' },
        { type: 'text', text },
      ],
    }), { status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return {
    calls,
    client: createOpenAiJudgeClient({
      baseUrl: 'http://judge.local', model: 'glm-5.3', apiKey: 'secret-token',
      protocol: 'anthropic', fetchImpl,
    }),
  }
}

describe('createOpenAiJudgeClient · anthropic protocol', () => {
  it('posts to /v1/messages with x-api-key and parses text blocks only', async () => {
    const { client, calls } = anthropicClient('{"score":0.77,"reasoning":"tests present"}')
    await expect(client('', 'diff', 'rubric')).resolves.toEqual({
      score: 0.77, reasoning: 'tests present',
    })
    expect(calls[0].url).toBe('http://judge.local/v1/messages')
    expect((calls[0].headers as Record<string, string>)['x-api-key']).toBe('secret-token')
    expect(calls[0].body).toMatchObject({
      model: 'glm-5.3', temperature: 0, max_tokens: 1024,
    })
  })

  it('does not double /v1 when base URL already ends with /v1', async () => {
    const calls: string[] = []
    const fetchImpl = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '{"score":1,"reasoning":"ok"}' }],
      }), { status: 200 })
    }) as typeof fetch
    const client = createOpenAiJudgeClient({
      baseUrl: 'http://judge.local/v1', model: 'm', apiKey: 'k',
      protocol: 'anthropic', fetchImpl,
    })
    await client('', 'diff', 'rubric')
    expect(calls[0]).toBe('http://judge.local/v1/messages')
  })

  it('missing api key degrades to pending without calling the endpoint', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const client = createOpenAiJudgeClient({
      baseUrl: 'http://judge.local', model: 'm', protocol: 'anthropic', fetchImpl,
    })
    expect(await client('', 'diff', 'rubric')).toMatchObject({ status: 'pending' })
    expect(called).toBe(false)
  })
})
