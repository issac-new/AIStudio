// overlay/custom/server/loop/engine/__tests__/loop-guard.test.ts
// 防死循环守卫（aipaydev 缺口 3 核心纯逻辑）直测：重试计数、连续阻断、
// Leader 介入阈值、上限拒绝、safeRetry 封顶。
import { describe, it, expect } from 'vitest'
import {
  recordRetry,
  isMaxRetriesExceeded,
  shouldLeaderIntervene,
  buildLeaderIntervention,
  safeRetry,
  MAX_RETRY_COUNT,
  LEADER_THRESHOLD,
  type RetryState,
  type LoopAction,
} from '../loop-guard'

function freshState(): RetryState {
  return { taskId: 'T-x', retryCount: 0, lastAction: 'CONTINUE', consecutiveBlocked: 0, history: [] }
}

const blocked = (taskId: string): LoopAction => ({ type: 'BLOCKED_BY_POLICY', taskId, message: 'blocked' })
const ok = (taskId: string): LoopAction => ({ type: 'CONTINUE' })

describe('loop-guard 防死循环', () => {
  it('连续 BLOCK 累加 retryCount 与 consecutiveBlocked；一次非 BLOCK 归零连续计数', () => {
    let st = freshState()
    st = recordRetry(st, blocked('T-x')).updatedState
    st = recordRetry(st, blocked('T-x')).updatedState
    expect(st.retryCount).toBe(2)
    expect(st.consecutiveBlocked).toBe(2)
    st = recordRetry(st, ok('T-x')).updatedState
    expect(st.retryCount).toBe(2) // 累计不归零
    expect(st.consecutiveBlocked).toBe(0)
  })

  it('连续阻断达 LEADER_THRESHOLD 即建议 Leader 介入；retry 达 MAX 判超限', () => {
    let st = freshState()
    let suggest = false
    for (let i = 0; i < LEADER_THRESHOLD; i++) {
      const r = recordRetry(st, blocked('T-x'))
      suggest = r.shouldLeaderIntervene
      st = r.updatedState
    }
    expect(suggest).toBe(true)
    expect(shouldLeaderIntervene(st)).toBe(true)
    // 未到 MAX
    expect(isMaxRetriesExceeded(st)).toBe(false)
    // 补到 MAX
    for (let i = st.retryCount; i < MAX_RETRY_COUNT; i++) {
      st = recordRetry(st, blocked('T-x')).updatedState
    }
    expect(isMaxRetriesExceeded(st)).toBe(true)
  })

  it('Leader 介入动作携带任务与计数', () => {
    const st = { ...freshState(), retryCount: 5, consecutiveBlocked: 3 }
    const action = buildLeaderIntervention('T-x', st)
    expect(action.type).toBe('LEADER_INTERVENTION')
    expect(action.taskId).toBe('T-x')
    expect(action.retryCount).toBe(5)
    expect(action.message).toContain('T-x')
  })

  it('safeRetry 未超限放行；超限拒绝执行并返回介入动作', async () => {
    const under = freshState()
    const ran = await safeRetry('T-x', under, async () => 42)
    expect(ran.result).toBe(42)
    expect(ran.action).toBeUndefined()

    const atCap = { ...freshState(), retryCount: MAX_RETRY_COUNT }
    let executed = false
    const denied = await safeRetry('T-x', atCap, async () => { executed = true; return 1 })
    expect(executed).toBe(false)
    expect(denied.error).toContain('Max retries')
    expect(denied.action?.type).toBe('LEADER_INTERVENTION')
  })

  it('safeRetry 透传执行异常为 error 字段（不抛出）', async () => {
    const st = freshState()
    const out = await safeRetry('T-x', st, async () => { throw new Error('boom') })
    expect(out.error).toBe('boom')
    expect(out.result).toBeUndefined()
  })
})
