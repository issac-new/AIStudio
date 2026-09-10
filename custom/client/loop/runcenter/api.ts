// overlay/custom/client/loop/runcenter/api.ts
// 运行中心 REST + /graph socket 封装。
//
// REST：graph-rest.ts 的 P1 契约（GET /api/graph/runs、GET /api/graph/runs/:id、
// POST resume/fork、GET replay），复用 @/api/client 的 token/baseUrl 通道
// （参照 loop-rest.ts 模式）。
// Socket：/graph namespace 等价封装（参照 loop-socket.ts）；事件名沿用服务端
// GraphEvent.type 原值（graph.node-complete 等），客户端 emit 'subscribe'/'unsubscribe'，
// 服务端推 'graph:event'（单事件）与 'graph:history'（订阅回放最近 50 条）。

import { io } from 'socket.io-client'
import { request, getApiKey, getBaseUrlValue } from '@/api/client'
import type { GraphEventLike, RunListItem } from './types'
import type { RunGraphTopologyLike } from './adapters/run-graph'

/** /graph socket 的结构化最小形状（测试用 FakeGraphSocket 同构，不耦合 socket.io-client） */
export interface GraphSocketLike {
  connected: boolean
  on(event: string, listener: (...args: unknown[]) => void): void
  emit(event: string, ...args: unknown[]): void
  disconnect(): void
}

const BASE = '/api/graph/runs'

export const runRest = {
  /** GET /api/graph/runs — 全部 run（含服务端状态推导；已卸载 run status='unknown'） */
  listRuns: async (): Promise<RunListItem[]> => {
    const res = await request<{ runs: RunListItem[] }>(`${BASE}s`)
    return res.runs
  },

  /** GET /api/graph/runs/:id — 单 run 详情（instance 快照） */
  getRun: async (id: string): Promise<{ runId: string; graphId: string; instance: Record<string, unknown> }> => {
    return request(`${BASE}/${encodeURIComponent(id)}`)
  },

  /** POST /api/graph/runs/:id/resume — HITL 闭环：应答 interrupt（审批恢复入口） */
  resumeRun: async (id: string, interruptId: string, value?: unknown): Promise<{ runId: string; instance: Record<string, unknown> }> => {
    return request(`${BASE}/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
      body: JSON.stringify({ interruptId, value }),
    })
  },

  /** POST /api/graph/runs/:id/fork — 从检查点分叉（superStep 缺省取最新 checkpoint） */
  forkRun: async (id: string, superStep?: number): Promise<{ runId: string; forkedFrom: string; superStep?: number }> => {
    return request(`${BASE}/${encodeURIComponent(id)}/fork`, {
      method: 'POST',
      body: JSON.stringify(superStep !== undefined ? { superStep } : {}),
    })
  },

  /** GET /api/graph/runs/:id/replay — 完整事件序列回放 */
  replay: async (id: string): Promise<GraphEventLike[]> => {
    const res = await request<{ runId: string; events: GraphEventLike[] }>(`${BASE}/${encodeURIComponent(id)}/replay`)
    return res.events
  },

  /**
   * GET /api/graph/specs → 按 id 检索图规格（执行图拓扑来源）。
   * 服务端现仅暴露列表端点（graph-rest.ts 无 /specs/:id 路由），客户端本地检索；
   * P2 规模内规格数有限，一次列表拉取可接受。loop 场景 specId = `loop-<loopId>`
   * （graph-compiler 约定，与 run 的 graphId / instance.graphDefId 同值域）。
   */
  getSpec: async (id: string): Promise<RunGraphTopologyLike | null> => {
    const res = await request<{ specs: RunGraphTopologyLike[] }>('/api/graph/specs')
    return res.specs.find(s => s.id === id) ?? null
  },
}

let graphSocket: GraphSocketLike | null = null

/** 连接 /graph namespace（幂等：已连接直接复用） */
export function connectGraph(): GraphSocketLike {
  if (graphSocket?.connected) return graphSocket
  const baseUrl = getBaseUrlValue() || window.location.origin
  const token = getApiKey()
  graphSocket = io(`${baseUrl}/graph`, {
    auth: {
      token: token || undefined,
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  }) as unknown as GraphSocketLike
  return graphSocket
}

/** 断开 /graph socket（store.disconnect 经此清理） */
export function disconnectGraph(): void {
  if (graphSocket) {
    graphSocket.disconnect()
    graphSocket = null
  }
}
