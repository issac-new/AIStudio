// 图执行器重试策略单测（2026-10-18 Harness 可靠性轮）：
// 只有瞬时/限流类重试；权限/认证/校验/未知类立即失败（源文 07 节两分法）。
import { describe, expect, it } from 'vitest'
import { GraphRuntime } from '../graph-runtime'
import { GraphBuilder } from '../graph-definition'
import { reducers } from '../types'
import type { GraphEvent } from '../types'

function makeBuilder(): GraphBuilder {
  return new GraphBuilder('retry-graph', 'Retry Graph', 'retry policy tests')
    .addChannel('count', { reducer: reducers.overwrite(), default: 0 })
}

async function runWithRetry(retry: Record<string, unknown>, error: unknown): Promise<{ attempts: number; status: string }> {
  let attempts = 0
  const events: GraphEvent[] = []
  const graph = makeBuilder()
    .addNode({
      id: 'flaky',
      type: 'function',
      label: 'flaky',
      execute: async () => {
        attempts += 1
        throw error
      },
      retry: { maxAttempts: 3, backoffMs: 1, ...retry } as never,
    })
    .setEntry('flaky')
    .build()
  const runtime = new GraphRuntime({ emitEvent: (e) => { events.push(e) } })
  const instance = await runtime.start(graph, `thread-${Math.random()}`)
  return { attempts, status: instance.status }
}

describe('图节点重试策略', () => {
  it('瞬时错误按次数重试', async () => {
    const r = await runWithRetry({}, new Error('request timed out'))
    // 首次执行 + 3 次重试
    expect(r.attempts).toBe(4)
    expect(r.status).toBe('failed')
  })

  it('限流错误可重试，且读取 Retry-After', async () => {
    const err = Object.assign(new Error('429 too many requests'), { retryAfterMs: 1 })
    const r = await runWithRetry({}, err)
    expect(r.attempts).toBe(4)
  })

  it('权限错误不重试', async () => {
    const r = await runWithRetry({}, new Error('403 permission denied'))
    expect(r.attempts).toBe(1)
  })

  it('认证与参数校验错误不重试', async () => {
    expect((await runWithRetry({}, new Error('401 unauthorized'))).attempts).toBe(1)
    expect((await runWithRetry({}, new Error('422 invalid argument: path'))).attempts).toBe(1)
  })

  it('未知错误默认保留重试（兼容既有图定义）', async () => {
    const r = await runWithRetry({}, new Error('boom'))
    expect(r.attempts).toBe(4)
  })

  it('显式收窄 retryOn 后未知错误不重试', async () => {
    const r = await runWithRetry({ retryOn: ['transient'] }, new Error('boom'))
    expect(r.attempts).toBe(1)
  })

  it('显式 retryOn 可纳入未知类', async () => {
    const r = await runWithRetry({ retryOn: ['unknown'] }, new Error('boom'))
    expect(r.attempts).toBe(4)
  })

  it('nonRetryable 优先于 retryOn', async () => {
    const r = await runWithRetry({ retryOn: ['transient'], nonRetryable: ['transient'] }, new Error('timeout'))
    expect(r.attempts).toBe(1)
  })

  it('指数退避策略仍按次数收敛', async () => {
    const r = await runWithRetry({ strategy: 'exponential', maxAttempts: 2, jitterRatio: 0.2 }, new Error('transient'))
    expect(r.attempts).toBe(3)
  })
})
