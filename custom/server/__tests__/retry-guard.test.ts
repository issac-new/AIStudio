// custom/server/__tests__/retry-guard.test.ts
// 防死循环守卫单测：sidecar 计数持久化 + Leader 介入阈值（3/5）
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { RetryStore } from '../services/kanban/retry-store'
import { RetryGuardService, RETRY_LEADER_THRESHOLD, RETRY_MAX } from '../services/kanban/retry-guard'

let storePath = ''

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aipaydev-retry-'))
  storePath = join(dir, 'retry.json')
})

describe('RetryStore', () => {
  it('increments from zero and persists across reads', async () => {
    expect(await RetryStore.get('T-1', storePath)).toBe(0)
    expect(await RetryStore.increment('T-1', storePath)).toBe(1)
    expect(await RetryStore.increment('T-1', storePath)).toBe(2)
    // 新实例读同一文件（持久化语义）
    expect(await RetryStore.get('T-1', storePath)).toBe(2)
    const raw = JSON.parse(await readFile(storePath, 'utf8')) as Record<string, number>
    expect(raw['T-1']).toBe(2)
  })

  it('keeps per-task counters isolated and resets a single task', async () => {
    await RetryStore.increment('T-A', storePath)
    await RetryStore.increment('T-B', storePath)
    await RetryStore.increment('T-B', storePath)
    await RetryStore.reset('T-B', storePath)
    expect(await RetryStore.get('T-A', storePath)).toBe(1)
    expect(await RetryStore.get('T-B', storePath)).toBe(0)
  })

  it('tolerates missing file', async () => {
    expect(await RetryStore.get('nope', join(storePath, 'nested', 'x.json'))).toBe(0)
  })
})

describe('RetryGuardService', () => {
  it('flags leader intervention at threshold 3 and max at 5', async () => {
    expect(RETRY_LEADER_THRESHOLD).toBe(3)
    expect(RETRY_MAX).toBe(5)
    const verdicts = []
    for (let i = 0; i < 5; i++) {
      verdicts.push(await RetryGuardService.onTestReject('T-loop'))
    }
    expect(verdicts[0]).toEqual({ count: 1, leaderIntervention: false, maxExceeded: false })
    expect(verdicts[2]?.leaderIntervention).toBe(true)
    expect(verdicts[2]?.maxExceeded).toBe(false)
    expect(verdicts[4]?.leaderIntervention).toBe(true)
    expect(verdicts[4]?.maxExceeded).toBe(true)
    await RetryGuardService.reset('T-loop')
    expect(await RetryGuardService.countOf('T-loop')).toBe(0)
  })
})

afterEach(async () => {
  await rm(storePath, { force: true }).catch(() => {})
})
