// overlay/custom/server/loop/engine/__tests__/guard-round7.test.ts
// R7-D/E/F 守门：看板并发闸（同 board 同刻 1 handoff + board_concurrency_full）/
// 委派兜底（invoke 失败 → session-end 兜底 reason requeued_after_repair 不静默吞）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SubagentDispatcher } from '../subagent-dispatcher'
import type { DispatchReason } from '../dispatch-reason'
import type { TaskContract } from '../../types'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function mkContract(over: Partial<TaskContract> = {}): TaskContract {
  return {
    id: 'c1', loopId: 'l1',
    source: { summary: 's' } as never,
    readPlan: { requiredReads: [] } as never,
    writeBoundary: [],
    verificationIntent: {} as never,
    resultTemplate: { artifactType: 'code' } as never,
    worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    ...over,
  } as TaskContract
}

describe('R7-F 委派兜底（routa session-end 语义）', () => {
  it('invokeAgent 失败 → session-end 兜底 reason（requeued_after_repair + 错误 detail），仍放行不静默丢', async () => {
    const reasons: DispatchReason[] = []
    const d = new SubagentDispatcher({
      invokeAgent: async () => { throw new Error('agent crashed') },
      onDispatchReason: (_id, r) => reasons.push(r),
    })
    const out = await d.dispatchWithOutcome(mkContract(), 'maker')
    expect(out.ok).toBe(true)
    expect(out.reason.code).toBe('requeued_after_repair')
    expect(out.reason.detail).toContain('session-end fallback')
    expect(out.reason.detail).toContain('agent crashed')
    expect(reasons.some(r => r.code === 'requeued_after_repair')).toBe(true)
  })

  it('invokeAgent 成功 → handed_off（正常路径不受影响）', async () => {
    const d = new SubagentDispatcher({ invokeAgent: async () => 'ok' })
    const out = await d.dispatchWithOutcome(mkContract(), 'maker')
    expect(out.ok).toBe(true)
    expect(out.reason.code).toBe('handed_off')
  })
})

describe('R7-D 看板并发闸（loop-engine 源码锚点）', () => {
  const overlayRoot = resolve(__dirname, '../../../../..')

  it('boardHandoffBusy 静态集 + boardKey + board_concurrency_full 事件/落库', () => {
    const eng = readFileSync(resolve(overlayRoot, 'custom/server/loop/engine/loop-engine.ts'), 'utf8')
    expect(eng).toContain('boardHandoffBusy')
    expect(eng).toContain('boardKey')
    expect(eng).toContain("reason: 'board_concurrency_full'")
    expect(eng).toContain("dispatchReason: 'board_concurrency_full'")
    // 占用/释放配对（try/finally 释放，不泄漏闸）
    expect(eng).toContain('LoopEngine.boardHandoffBusy.add(boardKey)')
    expect(eng).toContain('LoopEngine.boardHandoffBusy.delete(boardKey)')
  })
})
