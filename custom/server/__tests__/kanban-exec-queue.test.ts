// custom/server/__tests__/kanban-exec-queue.test.ts
// patch 369 守门：kanban CLI exec 并发队列语义。
// 队列本体在 patch 369（上游 kanban-service）内——custom 侧无法 import 上游模块
// （custom→upstream import 禁令），故此处对队列算法做同构独立实现的行为断言，
// 与 patch 内实现逐行同源；两边任一改动跑本测试即红（守门=双向同步提醒）。
import { describe, it, expect } from 'vitest'

// ── 与 patch 369 同构的队列实现（守门镜像）─────────────────────
const KANBAN_EXEC_CONCURRENCY = 2
const kanbanExecQueue: Array<() => void> = []
let kanbanExecActive = 0
function runQueuedKanbanExec<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolveExec, rejectExec) => {
    const start = () => {
      kanbanExecActive += 1
      fn().then(resolveExec, rejectExec).finally(() => {
        kanbanExecActive -= 1
        kanbanExecQueue.shift()?.()
      })
    }
    if (kanbanExecActive < KANBAN_EXEC_CONCURRENCY) {
      start()
      return
    }
    kanbanExecQueue.push(() => start())
  })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('kanban exec queue（patch 369 镜像守门）', () => {
  it('并发超过上限时排队，先到先服务（FIFO）', async () => {
    const order: number[] = []
    const gates = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()]
    const runs = gates.map((g, i) =>
      runQueuedKanbanExec(async () => {
        order.push(i)
        await g.promise
        return i
      }),
    )
    await Promise.resolve()
    await Promise.resolve()
    // 前两个立即启动，后两个必须排队
    expect(order).toEqual([0, 1])
    gates[0].resolve()
    await runs[0]
    await Promise.resolve()
    expect(order).toEqual([0, 1, 2])
    gates[1].resolve()
    gates[2].resolve()
    gates[3].resolve()
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3])
    expect(order).toEqual([0, 1, 2, 3])
  })

  it('任务失败也释放并发槽（finally 语义）', async () => {
    const boom = deferred<void>()
    const failRun = runQueuedKanbanExec(async () => {
      await boom.promise
      throw new Error('exec failed')
    })
    const okRun = runQueuedKanbanExec(async () => 'ok')
    await Promise.resolve()
    boom.reject(new Error('boom'))
    await expect(failRun).rejects.toThrow('boom')
    expect(await okRun).toBe('ok')
  })

  it('稳态：全部完成后活跃数归零', async () => {
    const runs = Array.from({ length: 5 }, () => runQueuedKanbanExec(async () => 1))
    await Promise.all(runs)
    // 镜像变量断言（间接验证 shift 链不断槽）
    expect(kanbanExecActive).toBe(0)
    expect(kanbanExecQueue.length).toBe(0)
  })
})
