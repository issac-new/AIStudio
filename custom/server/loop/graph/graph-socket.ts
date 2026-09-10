// overlay/custom/server/loop/graph/graph-socket.ts
// P1 Task 7 — /graph namespace：run 级订阅，转发 GraphService.onEvent。
// 事件名沿用 GraphEvent.type 原值（graph.node-complete 等），前端零翻译；
// loop.* 桥接事件同样透传（type 即负载的一部分）。

import type { GraphService } from './graph-service'
import type { EventLogStore } from './event-log-store'
import type { GraphEvent } from './types'

/** 结构化 socket 形状（避免 custom→upstream import；装配层传真实 io 实例） */
export interface SocketIOLike {
  of(namespace: string): {
    on(event: string, listener: (socket: SocketLike) => void): void
    to(room: string): { emit(event: string, payload: unknown): unknown }
  }
}

export interface SocketLike {
  on(event: string, listener: (...args: never[]) => void): void
  join(room: string): void
  leave(room: string): void
  emit(event: string, payload: unknown): void
}

const RUN_ID_RE = /^[A-Za-z0-9._:-]+$/

export function setupGraphSocketNamespace(
  io: SocketIOLike,
  graphService: GraphService,
  eventLog: EventLogStore,
): void {
  const nsp = io.of('/graph')

  // 写侧：service 事件 → 订阅了该 run 的房间（threadId 即 runId）。
  // P3 台账（事件幂等）：runtime 先落日志后广播，append resolve 的微任务里把
  // eid（`<runId>-<seq>`）回填到事件对象上；此处以两步微任务链延迟下发——
  // 第二步在回填微任务之后入队，flush 时快照 {...e} 即携带 eid，与
  // graph:history 的 eid 同源（前端按 eid 去重，首连双发不再重复投影）。
  // 例外：graph.forked / graph.failed 走 service 直发路径，无 runtime append
  // 回填——不带 eid 下发，前端按 type+ts+nodeId 复合键兜底。
  graphService.onEvent((e: GraphEvent) => {
    const runId = (e as { threadId?: string }).threadId
    if (!runId) return
    queueMicrotask(() => {
      queueMicrotask(() => {
        try {
          nsp.to(`run:${runId}`).emit('graph:event', { ...e })
        } catch { /* 房间下发失败不影响图执行 */ }
      })
    })
  })

  // 读侧：订阅 + 回放最近 50 条日志事件
  nsp.on('connection', (socket) => {
    socket.on('subscribe', (runId: string) => {
      if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) return
      socket.join(`run:${runId}`)
      eventLog.query(runId, { limit: 50 })
        .then(events => { socket.emit('graph:history', events) })
        .catch(() => { /* 回放失败不中断订阅 */ })
    })
    socket.on('unsubscribe', (runId: string) => {
      if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) return
      socket.leave(`run:${runId}`)
    })
  })
}
