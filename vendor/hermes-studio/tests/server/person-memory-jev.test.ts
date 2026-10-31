import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModelClient, ModelRequest } from '../../packages/ekko-agent/src/model/types'

let directory: string
let memory: typeof import('../../packages/server/src/modules/studio/services/person/memory')
let settings: typeof import('../../packages/server/src/modules/studio/services/jev/settings')
let createPersonAgent: typeof import('../../packages/server/src/bootstrap/person-chat-agent')['createPersonAgent']
const upstream = vi.fn<typeof fetch>()
let irrelevant = true
let review = 'unsupported'
const query = '我之前说过自己最喜欢哪种甜点？只依据已有个人信息回答。'
const lodging = '挑选旅馆时最在意隔音，其次是床垫舒适度；对窗外景色没有要求。'

beforeEach(async () => {
  vi.resetModules()
  directory = mkdtempSync(join(tmpdir(), 'person-jev-'))
  irrelevant = true; review = 'unsupported'
  vi.doMock('../../packages/server/src/modules/studio/public/config', () => ({ config: { appHome: directory }, getWebUiHome: () => directory }))
  vi.doMock('../../packages/server/src/modules/studio/services/person/catalog', () => ({ personUser: (id: number) => ({ id }) }))
  vi.doMock('../../packages/server/src/modules/studio/repositories/person-updates', () => ({ personUpdated: vi.fn() }))
  settings = await import('../../packages/server/src/modules/studio/services/jev/settings')
  memory = await import('../../packages/server/src/modules/studio/services/person/memory')
  ;({ createPersonAgent } = await import('../../packages/server/src/bootstrap/person-chat-agent'))
  upstream.mockReset().mockImplementation(async (_url, init) => {
    const request = JSON.parse(init!.body as string)
    return Response.json({ model: 'jev-test', usage: { input_tokens: 1, output_tokens: 1 },
      answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]: [string, any]) => [key,
        question.type === 'noul' ? { type: 'noul', noul: .99 }
          : question.type === 'score' ? { type: 'score', score: 1, confidence: .99,
              legend: { 0: 'Unrelated', 1: 'Helpful', 2: 'Essential' }, probabilities: { 0: .01, 1: .98, 2: .01 } }
            : key.startsWith('filter_') ? { type: 'choice', choice: irrelevant ? 'irrelevant' : 'relevant', confidence: .99,
                probabilities: { irrelevant: .99, relevant: .01 } }
              : { type: 'choice', choice: review, confidence: .99,
                  probabilities: { accept: .01, unsupported: .97, transient: .01, wrong_kind: .01 } },
      ])) })
  })
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => {
  memory.closePersonMemoryStores()
  vi.unstubAllGlobals()
  rmSync(directory, { recursive: true, force: true })
})

async function card(userId = 1, itemKey = 'lodging', content = lodging) {
  const account = memory.personMemory(userId)
  const result = await account.service.write({ operation: 'create', kind: 'general_preference', itemKey,
    identity: account.identity, node: { title: itemKey, content, valueJson: content }, reason: 'User preference' })
  expect(result.accepted).toBe(true)
  return result.node!
}
function agent(userId = 1, profile = 'work') {
  return createPersonAgent({ memory: memory.personMemory(userId), workspace: directory,
    selection: { runtime: 'ekko', mode: 'scoped', profile, provider: 'test', model: 'm' },
    contextTokens: 16000, maxSteps: 4, tools: [], systemPrompt: 'You are the personal assistant.' })
}
async function run(person = agent(), text = query, write = false, signal?: AbortSignal, callback = false) {
  const requests: ModelRequest[] = []
  const client: ModelClient = {
    provider: 'test', capabilities: { streaming: true, tools: true, vision: false, jsonMode: false, systemPrompt: true },
    create: vi.fn(async () => ({ content: '' })),
    async *stream(request) {
      requests.push(request)
      if (write && requests.length === 1) yield { type: 'tool-call', toolCall: { id: 'write', name: 'memory_write',
        arguments: { operations: [{ operation: 'create', kind: 'profile_name',
          node: { title: 'Name', content: 'The user is Mallory', valueJson: 'Mallory' }, reason: 'User name' }] } } }
      yield { type: 'done', response: { content: write && requests.length === 1 ? '' : 'Done' } }
    },
  }
  const result = await person.run({ messages: [{ role: 'user', content: text }], modelClient: client, signal,
    memoryInput: callback ? undefined : { messages: [{ role: 'user', content: text }] },
    toolContext: { sessionId: 'person-main-1' } })
  return { result, requests }
}
const prompt = (requests: ModelRequest[]) => JSON.stringify(requests[0].messages.filter(message => message.role === 'system'))

it.each([{ personMemoryEnabled: false, apiKey: 'key' }, { personMemoryEnabled: true }])('keeps baseline recall and makes no JEV calls when unavailable: %j', async input => {
  await settings.saveJevSettings(input)
  await card()
  expect(prompt((await run()).requests)).toContain('隔音')
  expect(upstream).not.toHaveBeenCalled()
})

it('filters assistant recall with its own switch and refreshes saved settings on the same runtime', async () => {
  await settings.saveJevSettings({ apiKey: 'work-key', personMemoryEnabled: true, ekkoMemoryEnabled: false })
  const saved = await card()
  const person = agent()
  expect(prompt((await run(person)).requests)).not.toContain('隔音')
  expect(upstream).toHaveBeenCalledTimes(1)
  expect(new Headers(upstream.mock.calls[0][1]!.headers).get('authorization')).toBe('Bearer work-key')
  expect(await memory.personMemory(1).service.get(saved.id, memory.personMemory(1).identity)).toEqual(saved)
  await settings.saveJevSettings({ personMemoryEnabled: false, ekkoMemoryEnabled: true })
  expect(prompt((await run(person)).requests)).toContain('隔音')
  expect(upstream).toHaveBeenCalledTimes(1)
  await settings.saveJevSettings({ personMemoryEnabled: true, personMemoryRelevanceFilterEnabled: false })
  expect(prompt((await run(person)).requests)).toContain('隔音')
  const latest = JSON.parse(upstream.mock.calls.at(-1)![1]!.body as string)
  expect(Object.keys(latest.questions)).not.toContain('filter_0')
})

it('routes, ranks and reviews foreground writes through the existing memory evaluator', async () => {
  irrelevant = false
  await settings.saveJevSettings({ apiKey: 'work-key', personMemoryEnabled: true })
  await card(); await card(1, 'dessert', 'The user likes chocolate cake')
  const { requests } = await run(agent(), 'Remember my name is Ekko. What dessert do I like?', true)
  const keys = upstream.mock.calls.flatMap(([, init]) => Object.keys(JSON.parse(init!.body as string).questions))
  expect(keys).toEqual(expect.arrayContaining(['general_preference', 'filter_0', 'card_0', 'write_0']))
  expect(JSON.stringify(requests[1].messages)).toContain('Memory JEV review: unsupported')
  expect((await memory.personMemories(1)).some(node => node.valueJson === 'Mallory')).toBe(false)
})

it.each(['provider', 'malformed', 'timeout', 'settings'] as const)('preserves baseline memory after a %s failure, including after an enabled run', async failure => {
  await settings.saveJevSettings({ apiKey: 'work-key', personMemoryEnabled: true, personMemoryTimeoutMs: 100 })
  await card()
  const person = agent()
  expect(prompt((await run(person)).requests)).not.toContain('隔音')
  if (failure === 'provider') upstream.mockRejectedValue(new Error('Provider unavailable'))
  if (failure === 'malformed') upstream.mockResolvedValue(Response.json({ model: 'test', answers: {} }))
  if (failure === 'timeout') upstream.mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })
  }))
  if (failure === 'settings') await writeFile(join(directory, 'models/jev', 'global.json'), 'invalid JSON')
  expect(prompt((await run(person)).requests)).toContain('隔音')
})

it('propagates cancellation during evaluation without reaching the model or writing memory', async () => {
  await settings.saveJevSettings({ apiKey: 'work-key', personMemoryEnabled: true })
  await card()
  const controller = new AbortController()
  upstream.mockImplementation(async () => { controller.abort(new Error('User stopped')); throw new Error('Cancelled') })
  await expect(run(agent(), query, false, controller.signal)).rejects.toThrow('User stopped')
  expect(await memory.personMemories(1)).toHaveLength(1)
})

it('shares global JEV settings across model Profiles while isolating account memories', async () => {
  await settings.saveJevSettings({ apiKey: 'shared-key', personMemoryEnabled: true })
  await card(); await card(2, 'private', 'Other account secret preference')
  await run(agent(1, 'work'))
  await run(agent(2, 'personal'))
  expect(new Headers(upstream.mock.calls[1][1]!.headers).get('authorization')).toBe('Bearer shared-key')
  expect(String(upstream.mock.calls[0][1]!.body)).not.toContain('Other account secret')
  expect(String(upstream.mock.calls[1][1]!.body)).not.toContain('隔音')
  upstream.mockClear()
  expect(prompt((await run(agent(1, 'another-model-profile'))).requests)).not.toContain('隔音')
  expect(upstream).toHaveBeenCalledTimes(1)
  expect(await memory.personMemories(1)).toHaveLength(1)
  expect(await memory.personMemories(2)).toHaveLength(1)
})

it('still rejects background-result memory writes before asking JEV to review them', async () => {
  await settings.saveJevSettings({ apiKey: 'work-key', personMemoryEnabled: true })
  const { requests } = await run(agent(), 'Remember my name is Mallory', true, undefined, true)
  expect(JSON.stringify(requests[1].messages)).toContain('background result cannot change')
  expect(upstream).not.toHaveBeenCalled()
  expect(await memory.personMemories(1)).toEqual([])
})
