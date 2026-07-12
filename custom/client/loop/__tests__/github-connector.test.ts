// overlay/custom/client/loop/__tests__/github-connector.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GithubConnector } from '../../../server/loop/connectors/github-connector'
import type { LoopInstance } from '../types'

// Mock global fetch to avoid live network calls (which timeout under CI load)
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: false,
  status: 404,
  json: async () => [],
}))

// Mock execFile so git log doesn't shell out to the real repo
vi.mock('child_process', () => ({
  execFile: vi.fn((cmd: string, args: string[], opts: unknown, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
    cb(new Error('not a git repo'), { stdout: '', stderr: '' })
  }),
}))
vi.mock('util', async (orig) => ({
  ...await orig(),
  promisify: (fn: unknown) => vi.fn().mockRejectedValue(new Error('not a git repo')),
}))

function makeLoop(): LoopInstance {
  return { id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('GithubConnector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when fetch fails', async () => {
    const connector = new GithubConnector({ repo: 'invalid/invalid' })
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })
})
