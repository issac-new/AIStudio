import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../../packages/server/src/modules/studio/public/config'
import { evaluateJev, getJevRuntimeConfig, getPersonJevRuntimeConfig, choice, score, noul } from '../../packages/server/src/modules/studio/public/jev'
import { getJevSettings, saveJevSettings, deleteJevSettings, readJevCredentials } from '../../packages/server/src/modules/studio/services/jev/settings'
import { getSettings, saveSettings, evaluate } from '../../packages/server/src/modules/studio/controllers/jev'

const computerDefaults = { ekkoComputerUseMatchEnabled: false, ekkoComputerUseMatchCandidateLimit: 20, ekkoComputerUseMatchMinConfidence: 0.8, ekkoComputerUseMatchTimeoutMs: 3000, ekkoComputerUseVerifyEnabled: false, ekkoComputerUseVerifyMinConfidence: 0.8, ekkoComputerUseVerifyTimeoutMs: 3000 }
const personMemoryDefaults = { personMemoryEnabled: false, personMemoryKindRoutingEnabled: true,
  personMemoryRelevanceFilterEnabled: true, personMemoryRerankEnabled: true, personMemoryWriteReviewEnabled: true,
  personMemoryCandidateLimit: 20, personMemoryRecallMinConfidence: .5, personMemoryFilterMinConfidence: .8,
  personMemoryMinConfidence: .8, personMemoryTimeoutMs: 3000 }
const skillsDefaults = { ekkoSkillsEnabled: false, ekkoSkillsCandidateLimit: 20, ekkoSkillsMinConfidence: 0.8, ekkoSkillsTimeoutMs: 3000 }
const directory = join(config.appHome, 'models', 'jev')
const upstream = vi.fn<typeof fetch>()
const questions = {
  route: choice('Route?', { billing: null, technical: 'Software' }),
  urgency: score('Urgency?', ['Routine', 'Urgent']),
  actionable: noul('Is action needed?'),
}
const response = {
  model: 'jev-test', usage: { input_tokens: 10, output_tokens: 5 },
  answers: {
    route: { type: 'choice', choice: 'billing', confidence: 0.9, probabilities: { billing: 0.9, technical: 0.1 } },
    urgency: { type: 'score', score: 0.7, confidence: 0.8, legend: { '0': 'Routine', '1': 'Urgent' }, probabilities: { '0': 0.3, '1': 0.7 } },
    actionable: { type: 'noul', noul: 0.9 },
  },
}

beforeEach(async () => {
  await rm(directory, { recursive: true, force: true })
  upstream.mockReset().mockImplementation(async () => Response.json(response))
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => vi.unstubAllGlobals())

describe('JEV settings', () => {

  it('round-trips personal assistant memory independently and uses the shared configuration at each read', async () => {
    const options = { personMemoryEnabled: true, personMemoryKindRoutingEnabled: false,
      personMemoryRelevanceFilterEnabled: true, personMemoryRerankEnabled: false, personMemoryWriteReviewEnabled: true,
      personMemoryCandidateLimit: 9, personMemoryRecallMinConfidence: .65, personMemoryFilterMinConfidence: .9,
      personMemoryMinConfidence: .95, personMemoryTimeoutMs: 1400 }
    expect(await getJevSettings()).toMatchObject(personMemoryDefaults)
    expect(await getPersonJevRuntimeConfig()).toMatchObject({ enabled: false, memoryEnabled: false })
    await saveJevSettings({ ...options, apiKey: 'work-key', ekkoMemoryEnabled: false })
    expect(await getJevSettings()).toMatchObject({ ...options, ekkoMemoryEnabled: false, hasApiKey: true })
    expect(await getPersonJevRuntimeConfig()).toEqual({ enabled: true, apiKey: 'work-key',
      baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', timeoutMs: 10000,
      memoryEnabled: true, memoryKindRoutingEnabled: false, memoryRelevanceFilterEnabled: true,
      memoryRerankEnabled: false, memoryWriteReviewEnabled: true, memoryCandidateLimit: 9,
      memoryRecallMinConfidence: .65, memoryFilterMinConfidence: .9, memoryMinConfidence: .95, memoryTimeoutMs: 1400 })
    expect((await getJevRuntimeConfig()).memoryEnabled).toBe(false)
    await saveJevSettings({ personMemoryEnabled: false, ekkoMemoryEnabled: true })
    expect(await getJevSettings()).toMatchObject({ ...options, personMemoryEnabled: false })
    expect((await getPersonJevRuntimeConfig()).memoryEnabled).toBe(false)
    expect((await getJevRuntimeConfig()).memoryEnabled).toBe(true)
    expect(await getJevSettings()).toMatchObject({ ...options, personMemoryEnabled: false })
    expect(await deleteJevSettings()).toMatchObject(personMemoryDefaults)
    expect((await getPersonJevRuntimeConfig()).enabled).toBe(false)
  })

  it.each([
    { personMemoryEnabled: 'true' }, { personMemoryKindRoutingEnabled: 1 },
    { personMemoryRelevanceFilterEnabled: null }, { personMemoryRerankEnabled: 'false' },
    { personMemoryWriteReviewEnabled: [] }, { personMemoryCandidateLimit: 0 }, { personMemoryCandidateLimit: 51 },
    { personMemoryRecallMinConfidence: .49 }, { personMemoryFilterMinConfidence: 1.01 },
    { personMemoryMinConfidence: '0.8' }, { personMemoryTimeoutMs: 99 }, { personMemoryTimeoutMs: 30001 },
  ])('rejects invalid personal assistant memory settings %j', async input => {
    await expect(saveJevSettings(input)).rejects.toMatchObject({ code: 'jev_invalid_request' })
  })

  it('round-trips Computer Use options, maps runtime snapshots, and retains options on disable', async () => {
    const options = { ekkoComputerUseMatchEnabled: true, ekkoComputerUseMatchCandidateLimit: 7,
      ekkoComputerUseMatchMinConfidence: .9, ekkoComputerUseMatchTimeoutMs: 1200,
      ekkoComputerUseVerifyEnabled: true, ekkoComputerUseVerifyMinConfidence: .95, ekkoComputerUseVerifyTimeoutMs: 1600 }
    expect(await getJevSettings()).toMatchObject(computerDefaults)
    await saveJevSettings({ ...options, apiKey: 'work-key' })
    expect(await getJevSettings()).toMatchObject(options)
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, computerUseMatchEnabled: true,
      computerUseMatchCandidateLimit: 7, computerUseMatchMinConfidence: .9, computerUseMatchTimeoutMs: 1200,
      computerUseVerifyEnabled: true, computerUseVerifyMinConfidence: .95, computerUseVerifyTimeoutMs: 1600 })
    await saveJevSettings({ ekkoComputerUseMatchEnabled: false, ekkoComputerUseVerifyEnabled: false })
    expect(await getJevRuntimeConfig()).toMatchObject({ computerUseMatchEnabled: false, computerUseVerifyEnabled: false, computerUseMatchCandidateLimit: 7 })
    expect(await getJevSettings()).toMatchObject({ ...options, ekkoComputerUseMatchEnabled: false, ekkoComputerUseVerifyEnabled: false })
    expect(await deleteJevSettings()).toMatchObject(computerDefaults)
  })

  it.each([
    { ekkoComputerUseMatchEnabled: 'true' }, { ekkoComputerUseVerifyEnabled: null },
    { ekkoComputerUseMatchCandidateLimit: 0 }, { ekkoComputerUseMatchCandidateLimit: 51 },
    { ekkoComputerUseMatchMinConfidence: .49 }, { ekkoComputerUseVerifyMinConfidence: 1.01 },
    { ekkoComputerUseMatchTimeoutMs: 99 }, { ekkoComputerUseVerifyTimeoutMs: 30001 },
  ])('rejects invalid Computer Use settings %j', async input => {
    await expect(saveJevSettings(input)).rejects.toMatchObject({ code: 'jev_invalid_request' })
  })


  it('round-trips all group and workflow fields, explicit false and partial global saves', async () => {
    const options = { groupSummaryReviewEnabled: true, groupSummaryReviewMinConfidence: .9,
      groupSummaryRevisionEnabled: true, groupSummaryReviewTimeoutMs: 1200,
      workflowQualityEnabled: true, workflowQualityMinConfidence: .95, workflowQualityTimeoutMs: 1400,
      groupMessageRoutingEnabled: true, groupMessageRoutingMinConfidence: .85, groupMessageRoutingMode: 'auto',
      groupMessageRoutingTimeoutMs: 1600, groupHandoffReviewEnabled: false, groupLoopDetectionEnabled: false }
    const saved = await saveJevSettings(options)
    expect(saved).toMatchObject({ ...options, hasApiKey: false })
    await saveJevSettings({ model: 'edited', groupSummaryReviewEnabled: false,
      groupSummaryRevisionEnabled: false, workflowQualityEnabled: false, groupMessageRoutingEnabled: false })
    expect(await getJevSettings()).toMatchObject({ ...options, model: 'edited', groupSummaryReviewEnabled: false,
      groupSummaryRevisionEnabled: false, workflowQualityEnabled: false, groupMessageRoutingEnabled: false })
    const defaults = { groupSummaryReviewEnabled: false, groupSummaryRevisionEnabled: false, workflowQualityEnabled: false,
      groupMessageRoutingEnabled: false, groupHandoffReviewEnabled: true, groupLoopDetectionEnabled: true,
      groupMessageRoutingMode: 'suggest', groupSummaryReviewTimeoutMs: 3000, workflowQualityTimeoutMs: 5000, groupMessageRoutingTimeoutMs: 1500 }
    expect(await deleteJevSettings()).toMatchObject(defaults)
  })

  it.each([
    { groupSummaryReviewEnabled: 'true' }, { groupSummaryRevisionEnabled: 1 }, { workflowQualityEnabled: null },
    { groupMessageRoutingEnabled: 1 }, { groupHandoffReviewEnabled: 'false' }, { groupLoopDetectionEnabled: null },
    { groupMessageRoutingMode: 'invalid' }, { groupSummaryReviewMinConfidence: .49 },
    { workflowQualityMinConfidence: 1.01 }, { groupMessageRoutingMinConfidence: '0.9' },
    { groupSummaryReviewTimeoutMs: 99 }, { workflowQualityTimeoutMs: 30001 }, { groupMessageRoutingTimeoutMs: 100.5 },
  ])('rejects invalid group/workflow configuration %j', async input => {
    await expect(saveJevSettings(input)).rejects.toMatchObject({ code: 'jev_invalid_request' })
  })

  it('round-trips global browser switches and options without leaking them into standalone config', async () => {
    const defaults = { browserMatchEnabled: false, browserMatchCandidateLimit: 20, browserMatchMinConfidence: 0.8,
      browserMatchTimeoutMs: 3000, browserVerifyEnabled: false, browserVerifyMinConfidence: 0.8, browserVerifyTimeoutMs: 3000 }
    const options = { browserMatchEnabled: true, browserMatchCandidateLimit: 7, browserMatchMinConfidence: 0.9,
      browserMatchTimeoutMs: 1200, browserVerifyEnabled: true, browserVerifyMinConfidence: 0.95, browserVerifyTimeoutMs: 1600 }
    expect(await getJevSettings()).toMatchObject(defaults)
    await saveJevSettings({ ...options, apiKey: 'work-key' })
    expect(await getJevSettings()).toMatchObject(options)
    expect(await getJevSettings()).toMatchObject(options)
    expect(Object.keys(await getJevRuntimeConfig()).some(key => key.startsWith('browser'))).toBe(false)
    await saveJevSettings({ browserMatchEnabled: false, browserVerifyEnabled: false })
    expect(await getJevSettings()).toMatchObject({ ...options, browserMatchEnabled: false, browserVerifyEnabled: false })
    expect(await deleteJevSettings()).toMatchObject(defaults)
  })

  it.each([
    ['browserMatchEnabled', 'true'], ['browserVerifyEnabled', 1], ['browserMatchCandidateLimit', 0],
    ['browserMatchCandidateLimit', 51], ['browserMatchCandidateLimit', 2.5], ['browserMatchMinConfidence', 0.4],
    ['browserVerifyMinConfidence', 1.1], ['browserMatchTimeoutMs', 99], ['browserVerifyTimeoutMs', 30001],
  ])('rejects invalid browser setting %s=%s', async (key, value) => {
    await expect(saveJevSettings({ [key]: value })).rejects.toMatchObject({ code: 'jev_invalid_request' })
  })

  it('round-trips one skills switch and shared parameters, with defaults and reset', async () => {
    const options = { ekkoSkillsEnabled: true, ekkoSkillsCandidateLimit: 7, ekkoSkillsMinConfidence: 0.95, ekkoSkillsTimeoutMs: 1200 }
    expect(await getJevSettings()).toMatchObject(skillsDefaults)
    await saveJevSettings({ ...options, apiKey: 'work-key' })
    expect(await getJevSettings()).toMatchObject(options)
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, skillsEnabled: true,
      skillsCandidateLimit: 7, skillsMinConfidence: 0.95, skillsTimeoutMs: 1200, memoryEnabled: false })
    await saveJevSettings({ ekkoSkillsEnabled: false })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, skillsEnabled: false, skillsCandidateLimit: 7 })
    expect(await getJevSettings()).toMatchObject({ ...options, ekkoSkillsEnabled: false })
    expect(await deleteJevSettings()).toMatchObject({ ...skillsDefaults, hasApiKey: false })
  })

  it('round-trips all memory options, preserves them while disabled, and resets global settings', async () => {
    const options = { ekkoMemoryEnabled: true, ekkoMemoryKindRoutingEnabled: true, ekkoMemoryRelevanceFilterEnabled: true, ekkoMemoryRerankEnabled: true,
      ekkoMemoryWriteReviewEnabled: true, ekkoMemoryCandidateLimit: 7, ekkoMemoryRecallMinConfidence: 0.65, ekkoMemoryFilterMinConfidence: 0.9, ekkoMemoryMinConfidence: 0.95, ekkoMemoryTimeoutMs: 1200 }
    await saveJevSettings({ ...options, apiKey: 'research-key' })
    await saveJevSettings({ ekkoMemoryEnabled: false })
    expect(await getJevSettings()).toMatchObject({ ...options, ekkoMemoryEnabled: false })
    expect(await getJevSettings()).toMatchObject(skillsDefaults)
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: false,
      memoryKindRoutingEnabled: true, memoryRelevanceFilterEnabled: true, memoryRerankEnabled: true, memoryWriteReviewEnabled: true,
      memoryCandidateLimit: 7, memoryRecallMinConfidence: 0.65, memoryFilterMinConfidence: 0.9, memoryMinConfidence: 0.95, memoryTimeoutMs: 1200 })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: false })
    await saveJevSettings(options)
    expect(await deleteJevSettings()).toMatchObject({ ekkoMemoryKindRoutingEnabled: true,
      ekkoMemoryRelevanceFilterEnabled: true, ekkoMemoryRerankEnabled: true, ekkoMemoryWriteReviewEnabled: true, ekkoMemoryCandidateLimit: 20,
      ekkoMemoryRecallMinConfidence: 0.5, ekkoMemoryFilterMinConfidence: 0.8, ekkoMemoryMinConfidence: 0.8, ekkoMemoryTimeoutMs: 3000 })
    expect((await getJevSettings()).ekkoMemoryEnabled).toBe(false)
  })
  it('exports complete server-only runtime values and explicitly disables an unconfigured installation', async () => {
    await saveJevSettings({ apiKey: 'research-key', model: 'jev-research' })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, apiKey: 'research-key', model: 'jev-research' })
    await deleteJevSettings()
    expect(await getJevRuntimeConfig()).toEqual({
      computerUseMatchEnabled: computerDefaults.ekkoComputerUseMatchEnabled, computerUseMatchCandidateLimit: computerDefaults.ekkoComputerUseMatchCandidateLimit, computerUseMatchMinConfidence: computerDefaults.ekkoComputerUseMatchMinConfidence, computerUseMatchTimeoutMs: computerDefaults.ekkoComputerUseMatchTimeoutMs, computerUseVerifyEnabled: computerDefaults.ekkoComputerUseVerifyEnabled, computerUseVerifyMinConfidence: computerDefaults.ekkoComputerUseVerifyMinConfidence, computerUseVerifyTimeoutMs: computerDefaults.ekkoComputerUseVerifyTimeoutMs,
      skillsEnabled: false, skillsCandidateLimit: 20, skillsMinConfidence: 0.8, skillsTimeoutMs: 3000,
      enabled: false, memoryEnabled: false, memoryKindRoutingEnabled: true, memoryRelevanceFilterEnabled: true, memoryRerankEnabled: true, memoryWriteReviewEnabled: true, memoryCandidateLimit: 20, memoryRecallMinConfidence: 0.5, memoryFilterMinConfidence: 0.8, memoryMinConfidence: 0.8, memoryTimeoutMs: 3000, apiKey: '', baseUrl: 'https://api.typesafe.ai', model: 'jev-latest', timeoutMs: 10000,
    })
    expect(JSON.stringify(await getJevSettings())).not.toContain('research-key')
  })
  it('stores one global configuration and returns only credential presence', async () => {
    const saved = await saveJevSettings({ apiKey: 'private-key', model: 'jev-research' })
    expect(saved).toEqual({ ...personMemoryDefaults, ...computerDefaults, groupMessageRoutingEnabled: false, groupHandoffReviewEnabled: true, groupLoopDetectionEnabled: true, groupMessageRoutingMinConfidence: 0.9, groupMessageRoutingMode: 'suggest', groupMessageRoutingTimeoutMs: 1500, workflowQualityEnabled: false, workflowQualityMinConfidence: 0.8, workflowQualityTimeoutMs: 5000, groupSummaryReviewEnabled: false, groupSummaryReviewMinConfidence: 0.8, groupSummaryRevisionEnabled: false, groupSummaryReviewTimeoutMs: 3000, browserMatchEnabled: false, browserMatchCandidateLimit: 20, browserMatchMinConfidence: 0.8, browserMatchTimeoutMs: 3000, browserVerifyEnabled: false, browserVerifyMinConfidence: 0.8, browserVerifyTimeoutMs: 3000, ...skillsDefaults, baseUrl: 'https://api.typesafe.ai', model: 'jev-research', timeoutMs: 10000, hasApiKey: true, ekkoMemoryEnabled: false, ekkoMemoryKindRoutingEnabled: true, ekkoMemoryRelevanceFilterEnabled: true, ekkoMemoryRerankEnabled: true, ekkoMemoryWriteReviewEnabled: true, ekkoMemoryCandidateLimit: 20, ekkoMemoryRecallMinConfidence: 0.5, ekkoMemoryFilterMinConfidence: 0.8, ekkoMemoryMinConfidence: 0.8, ekkoMemoryTimeoutMs: 3000 })
    expect(JSON.stringify(await getJevSettings())).not.toContain('private-key')
    expect(await getJevSettings()).toMatchObject({ model: 'jev-research', hasApiKey: true })
    const [file] = await readdir(directory)
    // Windows stat mode bits do not round-trip chmod 0o600/0o700.
    if (process.platform !== 'win32') {
      expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600)
      expect((await stat(directory)).mode & 0o777).toBe(0o700)
    }
  })

  it('persists the global memory switch, maps it to Ekko, and resets it on deletion', async () => {
    await saveJevSettings({ apiKey: 'research-key', ekkoMemoryEnabled: true })
    await saveJevSettings({ model: 'updated' })
    expect(await getJevSettings()).toMatchObject({ ekkoMemoryEnabled: true })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: true,
      memoryKindRoutingEnabled: true, memoryRelevanceFilterEnabled: true, memoryRerankEnabled: true, memoryWriteReviewEnabled: true })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: true })
    await saveJevSettings({ ekkoMemoryEnabled: false })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: false, apiKey: 'research-key' })
    // The memory switch does not disable the shared evaluator.
    await expect(evaluateJev({ state: '', questions })).resolves.toEqual(response)
    await saveJevSettings({ ekkoMemoryEnabled: true })
    expect(await deleteJevSettings()).toMatchObject({ ekkoMemoryEnabled: false, hasApiKey: false })
  })

  it('defaults missing legacy Studio child switches on while keeping the master off', async () => {
    await saveJevSettings({ apiKey: 'legacy-key' })
    const [file] = await readdir(directory)
    await writeFile(join(directory, file), JSON.stringify({ apiKey: 'legacy-key', model: 'legacy-model', ekkoMemoryMinConfidence: 0.9 }))
    expect(await getJevSettings()).toMatchObject({ browserMatchEnabled: false, browserVerifyEnabled: false, browserMatchCandidateLimit: 20 })
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: false,
      memoryKindRoutingEnabled: true, memoryRelevanceFilterEnabled: true, memoryRerankEnabled: true, memoryWriteReviewEnabled: true,
      apiKey: 'legacy-key', model: 'legacy-model', memoryRecallMinConfidence: 0.5, memoryMinConfidence: 0.9 })
  })

  it('preserves explicit disabled switches in existing Studio settings and partial updates', async () => {
    await saveJevSettings({ apiKey: 'key' })
    const [file] = await readdir(directory)
    const disabled = { ekkoMemoryEnabled: true, ekkoMemoryKindRoutingEnabled: false,
      ekkoMemoryRelevanceFilterEnabled: false, ekkoMemoryRerankEnabled: false, ekkoMemoryWriteReviewEnabled: false }
    await writeFile(join(directory, file), JSON.stringify({ apiKey: 'key', ...disabled }))
    expect(await getJevSettings()).toMatchObject(disabled)
    await saveJevSettings({ model: 'edited' })
    expect(await getJevSettings()).toMatchObject(disabled)
    expect(await getJevRuntimeConfig()).toMatchObject({ enabled: true, memoryEnabled: true,
      memoryKindRoutingEnabled: false, memoryRelevanceFilterEnabled: false, memoryRerankEnabled: false, memoryWriteReviewEnabled: false })
  })

  it('preserves blank/omitted keys, replaces explicit keys and clears the global key', async () => {
    await saveJevSettings({ apiKey: 'default-key' })
    await saveJevSettings({ apiKey: 'old-key' })
    await saveJevSettings({ apiKey: '', model: 'jev-edited' })
    expect((await readJevCredentials()).apiKey).toBe('old-key')
    await saveJevSettings({ timeoutMs: 20000 })
    expect((await readJevCredentials()).apiKey).toBe('old-key')
    await saveJevSettings({ apiKey: 'new-key' })
    expect((await readJevCredentials()).apiKey).toBe('new-key')
    expect(await deleteJevSettings()).toMatchObject({ hasApiKey: false, model: 'jev-latest' })
    expect((await readJevCredentials()).apiKey).toBe('')
    for (const file of await readdir(directory)) {
      expect(await readFile(join(directory, file), 'utf8')).not.toMatch(/old-key|new-key/)
    }
  })

  it('serializes concurrent changes without losing the key or other settings', async () => {
    await Promise.all([
      saveJevSettings({ apiKey: 'key' }),
      saveJevSettings({ model: 'jev-new' }),
      saveJevSettings({ timeoutMs: 5000 }),
    ])
    expect(await readJevCredentials()).toMatchObject({ apiKey: 'key', model: 'jev-new', timeoutMs: 5000 })
  })

  it.each([
    { baseUrl: 'file:///tmp/key' }, { baseUrl: 'https://user:pass@example.test' },
    { baseUrl: 'https://example.test?token=key' }, { model: '' },
    { timeoutMs: 0 }, { timeoutMs: '10000' }, { apiKey: 123 }, { unknown: true },
    { ekkoMemoryKindRoutingEnabled: 'true' }, { ekkoMemoryRerankEnabled: 1 }, { ekkoMemoryWriteReviewEnabled: null },
    { ekkoMemoryCandidateLimit: 0 }, { ekkoMemoryCandidateLimit: 51 }, { ekkoMemoryMinConfidence: 0.2 },
    { ekkoMemoryRecallMinConfidence: 0.2 }, { ekkoMemoryRecallMinConfidence: 1.1 }, { ekkoMemoryRecallMinConfidence: '0.5' },
    { ekkoMemoryRelevanceFilterEnabled: 'true' }, { ekkoMemoryFilterMinConfidence: 0.4 }, { ekkoMemoryFilterMinConfidence: 1.1 }, { ekkoMemoryFilterMinConfidence: '0.8' },
    { ekkoMemoryMinConfidence: '0.9' }, { ekkoMemoryTimeoutMs: 99 }, { ekkoMemoryTimeoutMs: 30001 },
    { ekkoSkillsEnabled: 'false' }, { ekkoSkillsEnabled: null }, { ekkoSkillsCandidateLimit: 0 }, { ekkoSkillsCandidateLimit: 51 },
    { ekkoSkillsMinConfidence: 0.4 }, { ekkoSkillsMinConfidence: 1.1 }, { ekkoSkillsMinConfidence: '0.8' },
    { ekkoSkillsTimeoutMs: 99 }, { ekkoSkillsTimeoutMs: 30001 },
    { ekkoMemoryEnabled: 'false' }, { ekkoMemoryEnabled: 1 }, { ekkoMemoryEnabled: null },
  ])('rejects invalid settings without changing saved data: %j', async input => {
    await saveJevSettings({ apiKey: 'key' })
    await expect(saveJevSettings(input)).rejects.toMatchObject({ status: 400 })
    expect((await readJevCredentials()).apiKey).toBe('key')
  })
})

describe('shared JEV client', () => {
  it.each([
    ['https://jev.example.test/', 'https://jev.example.test'],
    ['https://jev.example.test/v1', 'https://jev.example.test'],
    ['https://jev.example.test/v1/', 'https://jev.example.test'],
    ['https://jev.example.test/v1/systemone', 'https://jev.example.test'],
    ['https://jev.example.test/v1/systemone/', 'https://jev.example.test'],
    ['https://jev.example.test/gateway', 'https://jev.example.test/gateway'],
    ['https://jev.example.test/gateway/v1/', 'https://jev.example.test/gateway'],
    ['https://jev.example.test/gateway/v1/systemone/', 'https://jev.example.test/gateway'],
    ['https://jev.example.test/v1/systemone/gateway/', 'https://jev.example.test/v1/systemone/gateway'],
  ])('batches typed questions with global credentials at %s', async (baseUrl, root) => {
    await saveJevSettings({ apiKey: 'default-key' })
    await saveJevSettings({ apiKey: 'research-key', model: 'jev-research', baseUrl })
    const result = await evaluateJev({ state: { message: 'billing issue' }, questions })
    expect(result).toEqual(response)
    expect(upstream).toHaveBeenCalledTimes(1)
    const [url, init] = upstream.mock.calls[0]
    expect(url).toBe(`${root}/v1/systemone`)
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer research-key')
    expect(init?.redirect).toBe('error')
    expect(JSON.parse(init!.body as string)).toEqual({ state: { message: 'billing issue' }, questions, model: 'jev-research' })
    expect(await getJevSettings()).toMatchObject({ baseUrl: root })
    expect(await getJevRuntimeConfig()).toMatchObject({ baseUrl: root })
  })

  it('normalizes an existing saved endpoint when reading settings without rewriting the file', async () => {
    await saveJevSettings({ apiKey: 'research-key' })
    const [file] = await readdir(directory)
    const path = join(directory, file)
    const saved = JSON.parse(await readFile(path, 'utf8'))
    saved.baseUrl = 'https://jev.example.test/gateway/v1/systemone/'
    const original = JSON.stringify(saved)
    await writeFile(path, original)

    await expect(evaluateJev({ state: null, questions })).resolves.toEqual(response)
    expect(upstream.mock.calls[0][0]).toBe('https://jev.example.test/gateway/v1/systemone')
    expect(await getJevRuntimeConfig()).toMatchObject({ baseUrl: 'https://jev.example.test/gateway' })
    expect(await readFile(path, 'utf8')).toBe(original)
  })

  it('does not fall back to the process environment', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'environment-key')
    try { await expect(evaluateJev({ state: null, questions })).rejects.toMatchObject({ status: 409, code: 'jev_not_configured' }) }
    finally { vi.unstubAllEnvs() }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('picks up edited settings on the next call and respects a model override', async () => {
    await saveJevSettings({ apiKey: 'old-key' })
    await evaluateJev({ state: '', questions })
    await saveJevSettings({ apiKey: 'new-key' })
    await evaluateJev({ state: '', questions, model: 'jev-override' })
    const [, init] = upstream.mock.calls[1]
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer new-key')
    expect(JSON.parse(init!.body as string).model).toBe('jev-override')
  })

  it.each([400, 401, 403, 404, 429, 500, 503])('sanitizes provider HTTP %i errors without retries', async status => {
    await saveJevSettings({ apiKey: 'private-key' })
    upstream.mockResolvedValue(Response.json({ error: 'private-key and private-state' }, { status }))
    const code = [401, 403].includes(status) ? 'jev_auth_failed' : status === 404 ? 'jev_endpoint_not_found' : status === 429 ? 'jev_rate_limited' : 'jev_provider_error'
    await expect(evaluateJev({ state: 'private-state', questions })).rejects.toMatchObject({ status: 502, code, message: `JEV provider returned HTTP ${status}` })
    expect(upstream).toHaveBeenCalledTimes(1)
  })

  it('honors cancellation', async () => {
    await saveJevSettings({ apiKey: 'key' })
    const controller = new AbortController()
    controller.abort()
    await expect(evaluateJev({ state: null, questions }, { signal: controller.signal })).rejects.toMatchObject({ status: 499, code: 'jev_cancelled' })
    expect(upstream).not.toHaveBeenCalled()
  })

  it('aborts an upstream request at the configured timeout', async () => {
    await saveJevSettings({ apiKey: 'key', timeoutMs: 1000 })
    upstream.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    await expect(evaluateJev({ state: null, questions })).rejects.toMatchObject({ status: 504, code: 'jev_timeout' })
  })

  it.each([{}, { state: '', questions: {} }, { state: true, questions },
    { state: '', questions: { bad: { type: 'unknown' } } },
    { state: '', questions: { bad: { type: 'choice', criteria: [] } } },
    { state: '', questions: { bad: { type: 'score', criteria: ['only one'] } } },
  ])('rejects invalid evaluations before contacting the provider: %j', async input => {
    await expect(evaluateJev(input as any)).rejects.toMatchObject({ status: 400 })
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('JEV controllers', () => {
  it('uses the global configuration regardless of middleware or body Profile', async () => {
    const ctx = { state: { profile: { name: 'research' } }, request: { body: { apiKey: 'key' } } } as any
    await saveSettings(ctx)
    expect(ctx.body.hasApiKey).toBe(true)
    expect((await getJevSettings()).hasApiKey).toBe(true)
    ctx.request.body = { state: 'hello', questions, profile: 'default' }
    await evaluate(ctx)
    expect(ctx.body).toEqual(response)
    expect(new Headers(upstream.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer key')
  })

  it('reads global settings without a middleware Profile', async () => {
    const ctx = { state: {}, request: { body: {} } } as any
    await getSettings(ctx)
    expect(ctx.status).toBeUndefined()
    expect(ctx.body.hasApiKey).toBe(false)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('returns stable error codes for client-side translation', async () => {
    const ctx = { state: { profile: { name: 'research' } }, request: { body: { state: null, questions } } } as any
    await evaluate(ctx)
    expect(ctx.body.code).toBe('jev_not_configured')
    await saveJevSettings({ apiKey: 'key' })
    upstream.mockResolvedValue(Response.json({ error: 'private provider detail' }, { status: 401 }))
    await evaluate(ctx)
    expect(ctx.status).toBe(502)
    expect(ctx.body).toEqual({ code: 'jev_auth_failed', error: 'JEV provider returned HTTP 401' })
    ctx.request.body = { timeoutMs: 0 }
    await saveSettings(ctx)
    expect(ctx.status).toBe(400)
    expect(ctx.body.code).toBe('jev_invalid_request')
  })
})
