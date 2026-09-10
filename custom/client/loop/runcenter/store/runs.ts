// overlay/custom/client/loop/runcenter/store/runs.ts
// 运行中心 Pinia store — runs 列表 + /graph socket 订阅增量更新 + 断线重连 resubscribe。
//
// 投影纪律：事件缓冲是 stage/迭代/成本/最后活动/未决中断的唯一事实源，
// 派生一律走 adapters.ts 纯函数（recompute 统一入口），store 不自算业务字段。
//
// overlay[fix-resubscribe]（对照 loop store 的去重修复）：socket 事件监听器在
// ensureSocket 中只注册一次（按 threadId 路由，绝不按 run 叠加监听器）；
// 订阅集合 subscribed 记录已订阅 runId——连接期内不重发 subscribe；
// 断线重连（'connect' 回调）时对集合内全部 runId 重发（服务端 join 幂等，
// 房间可能已随服务端重启丢失）。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GraphEventLike, RunListItem, RunSummary } from '../types'
import { latestOpenInterrupt, sortRuns, toRunSummary } from '../adapters'
import { connectGraph, disconnectGraph, runRest, type GraphSocketLike } from '../api'

/** 单 run 事件缓冲上限（订阅回放 50 条 + 增量余量） */
const EVENT_BUFFER_LIMIT = 100

/** 状态承载事件 → run 状态（graph.forked 对齐服务端 fork 实例起点 paused） */
const STATUS_BY_EVENT: Record<string, RunSummary['status']> = {
  'graph.started': 'running',
  'graph.step-start': 'running',
  'graph.node-start': 'running',
  'graph.resume': 'running',
  'graph.interrupt': 'awaiting-input',
  'graph.forked': 'paused',
  'graph.completed': 'completed',
  'graph.failed': 'failed',
}

export const useRunCenterStore = defineStore('runCenter', () => {
  // ── state ──
  const runs = ref<RunSummary[]>([])
  const selectedRunId = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const connection = ref<'disconnected' | 'connected'>('disconnected')
  /** 回放面板数据（fetchReplay 产物，与实时列表互不干扰） */
  const replayRunId = ref<string | null>(null)
  const replayEvents = ref<GraphEventLike[]>([])
  const replayLoading = ref(false)

  // ── socket（非响应式内部态）──
  let socket: GraphSocketLike | null = null
  const subscribed = new Set<string>()

  // ── getters ──
  /** 待我处理（awaiting-input）置顶 → 最后活动倒序 */
  const sortedRuns = computed(() => sortRuns(runs.value))
  const awaitingCount = computed(() => runs.value.filter(r => r.status === 'awaiting-input').length)
  const selectedRun = computed(() => runs.value.find(r => r.runId === selectedRunId.value) ?? null)

  // ── 内部：投影重算（事件缓冲 → 派生字段，纯函数统一入口）──
  function recompute(run: RunSummary): void {
    const projected = toRunSummary(
      { runId: run.runId, graphId: run.graphId, status: run.status, updatedAt: run.updatedAt },
      run.events,
    )
    run.stage = projected.stage
    run.iteration = projected.iteration
    run.lastActivityAt = projected.lastActivityAt
    run.cost = projected.cost
    run.pendingInterruptId = latestOpenInterrupt(run.events)
  }

  // ── 内部：事件增量（graph:event 与 graph:history 同一条投影路径）──
  function applyEvent(e: GraphEventLike): void {
    const runId = (e as { threadId?: unknown }).threadId
    if (typeof runId !== 'string' || !runId) return
    let run = runs.value.find(r => r.runId === runId)
    if (!run) {
      // 新 run 现场上线（graph.started / graph.forked 先于 REST 列表可见）
      run = toRunSummary({
        runId,
        graphId: typeof e.graphId === 'string' ? e.graphId : '',
        status: 'unknown',
        updatedAt: null,
      })
      runs.value.push(run)
      subscribeRun(runId)
    }
    run.events.push(e)
    if (run.events.length > EVENT_BUFFER_LIMIT) {
      run.events.splice(0, run.events.length - EVENT_BUFFER_LIMIT)
    }
    const nextStatus = STATUS_BY_EVENT[e.type]
    if (nextStatus) run.status = nextStatus
    recompute(run)
  }

  // ── 内部：socket 生命周期 ──
  function ensureSocket(): void {
    if (socket) return
    socket = connectGraph()
    // 监听器只注册一次——按 threadId 路由，杜绝 loop store 曾出现的监听器叠加
    socket.on('connect', () => {
      connection.value = 'connected'
      // 断线重连：服务端房间可能已丢，对全部已订阅 runId 重发 subscribe（join 幂等）
      for (const id of subscribed) socket!.emit('subscribe', id)
    })
    socket.on('disconnect', () => {
      connection.value = 'disconnected'
    })
    socket.on('graph:event', (e: unknown) => {
      try { applyEvent(e as GraphEventLike) } catch { /* 单事件畸形不炸 store */ }
    })
    socket.on('graph:history', (events: unknown) => {
      if (!Array.isArray(events)) return
      for (const e of events) {
        try { applyEvent(e as GraphEventLike) } catch { /* 同上 */ }
      }
    })
  }

  function subscribeRun(runId: string): void {
    ensureSocket()
    if (!socket || subscribed.has(runId)) return // 连接期内去重
    subscribed.add(runId)
    socket.emit('subscribe', runId)
  }

  // ── actions ──
  /** REST 拉全量列表并合并（保留既有 run 的事件缓冲与投影）；随后订阅全部已知 run */
  async function fetchRuns(): Promise<void> {
    loading.value = true
    try {
      const list = await runRest.listRuns()
      const next: RunSummary[] = []
      for (const row of list) {
        const existing = runs.value.find(r => r.runId === row.runId)
        if (existing) {
          existing.graphId = row.graphId
          existing.updatedAt = row.updatedAt
          // REST 'unknown'（服务端已卸载）不覆盖事件驱动的已知状态
          if (row.status !== 'unknown' || existing.status === 'unknown') existing.status = row.status
          recompute(existing)
          next.push(existing)
        } else {
          next.push(toRunSummary(row))
        }
      }
      runs.value = next
      error.value = null
      for (const r of runs.value) subscribeRun(r.runId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** 列表级选中态（P3 保留位）：Task 6 起行点击直达运行详情页，生产路径暂无消费者；
   *  保留 API 与状态——B7 检查器 / 列表内嵌详情可能复用，删除前先清 runs-store 测试锚点 */
  function selectRun(runId: string | null): void {
    selectedRunId.value = runId
  }

  /** HITL 恢复：interruptId 取自事件投影的未决中断（无未决中断则拒绝） */
  async function resumeRun(runId: string, value?: unknown): Promise<void> {
    const run = runs.value.find(r => r.runId === runId)
    const interruptId = run?.pendingInterruptId
    if (!interruptId) throw new Error(`No pending interrupt for run ${runId}`)
    await runRest.resumeRun(runId, interruptId, value)
  }

  /** 从检查点分叉；刷新列表纳入 fork 产物，返回新 runId */
  async function forkRun(runId: string, superStep?: number): Promise<string> {
    const res = await runRest.forkRun(runId, superStep)
    await fetchRuns()
    return res.runId
  }

  /** 拉完整事件序列回放（终态 run 的回放入口） */
  async function fetchReplay(runId: string): Promise<void> {
    replayLoading.value = true
    try {
      replayEvents.value = await runRest.replay(runId)
      replayRunId.value = runId
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      replayLoading.value = false
    }
  }

  function disconnect(): void {
    disconnectGraph() // 关真实连接（module 级单例归 null）
    socket = null
    subscribed.clear()
    connection.value = 'disconnected'
  }

  return {
    // state
    runs, selectedRunId, loading, error, connection,
    replayRunId, replayEvents, replayLoading,
    // getters
    sortedRuns, awaitingCount, selectedRun,
    // actions
    fetchRuns, selectRun, resumeRun, forkRun, fetchReplay, disconnect,
    // 测试与调试暴露（不发生产语义）
    applyEvent,
  }
})
