// custom/server/__tests__/retry-guard.test.ts
// 防死循环守卫单测：sidecar 计数持久化 + Leader 介入阈值（3/5）
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { RetryStore } from '../services/kanban/retry-store'
import { RetryGuardService, RETRY_LEADER_THRESHOLD, RETRY_MAX } from '../services/kanban/retry-guard'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
}))
vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

let storePath = ''

beforeEach(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aipaydev-retry-'))
  storePath = join(dir, 'retry.json')
  vi.stubEnv('AIPAYDEV_LEADER_MATRIX_ID', '')
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

  it('assertReopenAllowed 在第 RETRY_MAX 次起拒绝 reopen（patch 363 前置熔断闸）', async () => {
    // 未打回：放行
    await expect(RetryGuardService.assertReopenAllowed('T-gate')).resolves.toBeUndefined()
    for (let i = 0; i < RETRY_MAX - 1; i++) {
      await RetryGuardService.onTestReject('T-gate')
    }
    // 4 次：仍放行
    await expect(RetryGuardService.assertReopenAllowed('T-gate')).resolves.toBeUndefined()
    await RetryGuardService.onTestReject('T-gate')
    // 第 5 次：熔断拒绝
    await expect(RetryGuardService.assertReopenAllowed('T-gate')).rejects.toThrow(/BLOCKED_BY_POLICY/)
    // reset 解除后恢复放行
    await RetryGuardService.reset('T-gate')
    await expect(RetryGuardService.assertReopenAllowed('T-gate')).resolves.toBeUndefined()
  })

  it('env 未设时不外呼；设置后经 hermes send 实弹送达（仅阈值轮）', async () => {
    // env 未设：纯留痕，无 spawn
    await RetryGuardService.onTestReject('T-quiet')
    expect(spawnMock).not.toHaveBeenCalled()
    // env 设定：达到阈值才外呼
    vi.stubEnv('AIPAYDEV_LEADER_MATRIX_ID', '@lead:matrix.test')
    const v1 = await RetryGuardService.onTestReject('T-notify')
    expect(v1.leaderIntervention).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
    const v2 = await RetryGuardService.onTestReject('T-notify')
    const v3 = await RetryGuardService.onTestReject('T-notify')
    expect(v3.leaderIntervention).toBe(true)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [bin, args] = spawnMock.mock.calls[0]!
    expect(String(bin)).toContain('hermes')
    expect(args?.[0]).toBe('send')
    expect(args?.[1]).toBe('--to')
    expect(args?.[2]).toBe('matrix:@lead:matrix.test')
    expect(String(args?.[3])).toContain('T-notify')
    await RetryGuardService.reset('T-notify')
    await RetryGuardService.reset('T-quiet')
  })
})

afterEach(async () => {
  await rm(storePath, { force: true }).catch(() => {})
})
