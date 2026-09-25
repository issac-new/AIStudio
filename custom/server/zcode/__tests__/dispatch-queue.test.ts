// 派发让位队列守门（minimax GOAL-05：用户消息>自治目标——yield/drain/出队优先序）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  dequeueNext, enqueue, queueView, restoreYielded, yieldToUser, type QueueItem,
} from '../dispatch-queue'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dq-'))
  process.env.HERMES_DISPATCH_QUEUE_DIR = dir
})
afterEach(() => {
  delete process.env.HERMES_DISPATCH_QUEUE_DIR
  rmSync(dir, { recursive: true, force: true })
})

const item = (id: string, origin: 'user' | 'autonomy', at: number, source?: string): QueueItem => ({
  itemId: id, workspacePath: '/w', origin, text: `文本 ${id}`, at, state: 'pending', source,
})

describe('GOAL-05 让位语义', () => {
  it('用户消息到达→autonomy 项全部让位；user 项不动', () => {
    enqueue(item('a1', 'autonomy', 1, 'squad:core'))
    enqueue(item('u1', 'user', 2))
    enqueue(item('a2', 'autonomy', 3, 'column:todo'))
    const yielded = yieldToUser('/w')
    expect(yielded).toBe(2)  // a1+a2 让位
    const view = queueView('/w')
    expect(view.find((i) => i.itemId === 'u1')?.state).toBe('pending')
    expect(view.find((i) => i.itemId === 'a1')?.state).toBe('yielded')
  })

  it('用户轮空→drain 恢复；出队 user 先于 autonomy，同型按序', () => {
    enqueue(item('a1', 'autonomy', 1))
    enqueue(item('u1', 'user', 2))
    enqueue(item('a2', 'autonomy', 3))
    yieldToUser('/w')
    expect(restoreYielded('/w')).toBe(2)
    expect(dequeueNext('/w')!.itemId).toBe('u1')   // user 先
    expect(dequeueNext('/w')!.itemId).toBe('a1')   // 同 origin 按 at
    expect(dequeueNext('/w')!.itemId).toBe('a2')
    expect(dequeueNext('/w')).toBeNull()           // 空队 null
  })

  it('入队幂等+环形 100+队列视图不含 dispatched', () => {
    expect(enqueue(item('x', 'user', 1)).added).toBe(true)
    expect(enqueue(item('x', 'user', 1)).added).toBe(false)
    for (let i = 0; i < 105; i++) enqueue(item(`q${i}`, 'autonomy', i))
    const view = queueView('/w')
    expect(view.length).toBeLessThanOrEqual(100)
    dequeueNext('/w')
    expect(queueView('/w').some((i) => i.state === 'dispatched')).toBe(false)
  })
})
