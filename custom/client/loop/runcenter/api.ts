// overlay/custom/client/loop/runcenter/api.ts
// 运行中心 REST + /graph socket 封装。
//
// REST：graph-rest.ts 契约（GET /api/graph/runs、GET /api/graph/runs/:id、
// POST resume/fork/start、GET replay/export、GET /api/graph/specs/:id），
// 复用 @/api/client 的 token/baseUrl 通道（参照 loop-rest.ts 模式）。
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

/** GET /api/graph/engine 响应（graph-assembly.ts 只读导出，三态字段一致） */
export interface GraphEnginePolicy {
  mode: 'legacy' | 'shadow' | 'on'
  policy: {
    /** §7B.7 连续失败熔断阈值（默认 10） */
    failureBreakerLimit: number
    /** 停滞熔断阈值（P2 台账④，默认 = failureBreakerLimit） */
    stagnationLimit: number
    /** 审批 interrupt 默认超时（72h，P0 台账 h） */
    interruptTimeoutMs: number
    /** escalate 重发节流窗口（24h） */
    escalationResendMs: number
  }
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

  /** POST /api/graph/runs/:id/start — fork 产物显式起跑（graph-rest.ts P1 台账 a 显式语义）；
   *  "从失败重跑" = fork（新 runId，paused）→ startRun(newId) */
  startRun: async (id: string): Promise<{ runId: string; instance: Record<string, unknown> }> => {
    return request(`${BASE}/${encodeURIComponent(id)}/start`, { method: 'POST', body: JSON.stringify({}) })
  },

  /** GET /api/graph/runs/:id/replay — 完整事件序列回放 */
  replay: async (id: string): Promise<GraphEventLike[]> => {
    const res = await request<{ runId: string; events: GraphEventLike[] }>(`${BASE}/${encodeURIComponent(id)}/replay`)
    return res.events
  },

  /**
   * GET /api/graph/specs — 已注册图规格列表（P3 Task 6 编排区模板库数据源）。
   * 服务端 specStore.list() 原样返回全量 GraphSpec（含 nodes/edges/entryNode/limits），
   * 空库返回空数组。编排区据此渲染模板卡片；单条检索仍走 getSpec。
   */
  listSpecs: async (): Promise<RunGraphTopologyLike[]> => {
    const res = await request<{ specs: RunGraphTopologyLike[] }>('/api/graph/specs')
    return res.specs
  },

  /**
   * GET /api/graph/specs/:id → 按 id 检索图规格（执行图拓扑来源，P3 台账 #25）。
   * 服务端返回 {id, version, spec}，404 表示规格不存在/未注册（返回 null，视图据此
   * 显示"图规格缺失"占位）。loop 场景 specId = `loop-<loopId>`（graph-compiler 约定，
   * 与 run 的 graphId / instance.graphDefId 同值域）。
   */
  getSpec: async (id: string): Promise<RunGraphTopologyLike | null> => {
    try {
      const res = await request<{ id: string; version: number; spec: RunGraphTopologyLike }>(
        `/api/graph/specs/${encodeURIComponent(id)}`)
      return res?.spec ?? null
    } catch (err) {
      // 404 = 规格未注册（合法缺失）；其他错误原样上抛
      if ((err as { status?: number }).status === 404) return null
      throw err
    }
  },

  /**
   * GET /api/graph/engine → 图引擎策略快照（P3 Task 8 §7B.4 最小版）：
   * 当前模式（legacy|shadow|on）+ 默认审批超时/熔断阈值（只读，策略文件化随 P4）。
   * 设置页"图引擎策略"卡数据源。
   */
  getEnginePolicy: async (): Promise<GraphEnginePolicy> => {
    return request<GraphEnginePolicy>('/api/graph/engine')
  },

  /**
   * GET /api/graph/runs/:id/export → 运行导出包（P3 台账 #30）：run instance + 图规格 + 全事件。
   * 服务端同时设置 Content-Disposition attachment（直开 URL 可下载）；此处取 JSON 后
   * 由视图用 Blob 落盘（request 走授权头，<a href> 直链不带凭证）。
   */
  exportRun: async (id: string): Promise<{ run: Record<string, unknown>; spec: unknown; events: GraphEventLike[] }> => {
    return request(`${BASE}/${encodeURIComponent(id)}/export`)
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
