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
// 房间可能已随服务端重启丢失）；首连不重发（订阅 emit 已由 socket.io 缓冲，
// 连接即送达，重发会让服务端重放 graph:history——首连双发）。
//
// overlay[P3]（台账 #1/#2）：applyEvent 按 eid 去重（服务端 socket 层为实时事件
// 补挂与 history 同源的 `<runId>-<seq>`；缺 eid 的旧事件回退 type+ts+nodeId 复合键），
// history 回放 ∩ 实时流的首连双发拷贝不再重复投影；订阅域收敛为"可见页"——
// 视图经 syncVisibleRunIds 驱动，翻页 unsubscribe 旧页（1000 run 台账量级项）。

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { GraphEventLike, RunListItem, RunSummary } from '../types'
import { latestOpenInterrupt, sortRuns, toRunSummary } from '../adapters'
import { loadArchivedMap, markArchived, unmarkArchived } from '../adapters/inbox'
import { connectGraph, disconnectGraph, runRest, type GraphSocketLike } from '../api'

/** 单 run 事件缓冲上限（订阅回放 50 条 + 增量余量） */
const EVENT_BUFFER_LIMIT = 100

/** 单 run 去重键集上限（有界防泄漏；超出裁最旧——重放极旧事件可能再次入缓冲，可接受） */
const SEEN_KEY_LIMIT = 400

/** 状态承载事件 → run 状态（双词汇：socket type + 日志 kind，对照 EVENT_KIND_MAP；
 *  graph.forked / graph.step-start 日志同名落盘） */
const STATUS_BY_EVENT: Record<string, RunSummary['status']> = {
  // socket 词汇（graph:event）
  'graph.started': 'running',
  'graph.step-start': 'running',
  'graph.node-start': 'running',
  'graph.resume': 'running',
  'graph.interrupt': 'awaiting-input',
  'graph.forked': 'paused',
  'graph.completed': 'completed',
  'graph.failed': 'failed',
  // 日志词汇（graph:history，GraphLogEvent.kind）
  'run.started': 'running',
  'node.started': 'running',
  'interrupt.raised': 'awaiting-input',
  'interrupt.resumed': 'running',
  'run.completed': 'completed',
  'run.failed': 'failed',
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
  /** 首连标记：ensureSocket 时 socket 已连接（复用单例）视为首连已发生过 */
  let sawConnect = false
  /** runId → 已见事件去重键集（Set 迭代序 = 插入序，超限裁最旧） */
  const seenKeys = new Map<string, Set<string>>()

  // ── getters ──
  /** 待我处理（awaiting-input）置顶 → 最后活动倒序 */
  const sortedRuns = computed(() => sortRuns(runs.value))
  const awaitingCount = computed(() => runs.value.filter(r => r.status === 'awaiting-input').length)
  const selectedRun = computed(() => runs.value.find(r => r.runId === selectedRunId.value) ?? null)

  // ── 介入收件箱两态（task-7）：归档仅本地 kv 标记，不改 run 状态 ──
  /** runId → 归档时刻 ISO（localStorage 持久，跨会话保留） */
  const archivedMap = ref<Record<string, string>>(loadArchivedMap())
  const awaitingRuns = computed(() => sortRuns(runs.value.filter(r => r.status === 'awaiting-input')))
  const pendingInboxRuns = computed(() => awaitingRuns.value.filter(r => archivedMap.value[r.runId] === undefined))
  const archivedInboxRuns = computed(() => awaitingRuns.value.filter(r => archivedMap.value[r.runId] !== undefined))

  /** 归档（本地标记；两态都以 awaiting-input 为域，run 恢复后自动退出收件箱） */
  function archiveRun(runId: string): void {
    archivedMap.value = markArchived(runId, new Date().toISOString())
  }
  /** 取消归档 */
  function unarchiveRun(runId: string): void {
    archivedMap.value = unmarkArchived(runId)
  }

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

  // ── 内部：事件去重（P3 台账 #1）──
  /** 去重键：eid 优先（服务端 socket 层补挂，与 history 同源）；缺 eid 回退复合键 */
  function dedupeKeyOf(e: GraphEventLike): string {
    if (typeof e.eid === 'string' && e.eid) return `eid:${e.eid}`
    const type = typeof e.type === 'string' && e.type ? e.type : (e.kind ?? '')
    return `k:${type}|${String(e.ts)}|${typeof e.nodeId === 'string' ? e.nodeId : ''}`
  }

  /** 首次见到返回 false 并登记；重复返回 true。键集按 run 隔离、有界。 */
  function markSeenOnce(runId: string, key: string): boolean {
    let set = seenKeys.get(runId)
    if (!set) {
      set = new Set()
      seenKeys.set(runId, set)
    }
    if (set.has(key)) return true
    set.add(key)
    if (set.size > SEEN_KEY_LIMIT) {
      const drop = set.size - SEEN_KEY_LIMIT
      let dropped = 0
      for (const k of set) {
        set.delete(k)
        if (++dropped >= drop) break
      }
    }
    return false
  }

  // ── 内部：事件增量（graph:event 与 graph:history 同一条投影路径）──
  function applyEvent(e: GraphEventLike): void {
    // 双词汇 run 字段：socket GraphEvent.threadId ∪ 日志 GraphLogEvent.runId
    // （审查修复：graph:history 推 GraphLogEvent，此前 threadId 门卫把历史事件全量丢弃）
    const runId = typeof e.runId === 'string' && e.runId ? e.runId
      : typeof e.threadId === 'string' && e.threadId ? e.threadId : undefined
    if (!runId) return
    // eid 去重：history 回放 ∩ 实时流的首连双发拷贝只投影一次
    if (markSeenOnce(runId, dedupeKeyOf(e))) return
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
    const nextStatus = STATUS_BY_EVENT[e.type] ?? STATUS_BY_EVENT[e.kind ?? '']
    if (nextStatus) run.status = nextStatus
    recompute(run)
  }

  // ── 内部：socket 生命周期 ──
  function ensureSocket(): void {
    if (socket) return
    socket = connectGraph()
    // 复用已连接的单例时首连已发生过——重连回调必须照常重发订阅
    sawConnect = socket.connected
    // 监听器只注册一次——按 threadId 路由，杜绝 loop store 曾出现的监听器叠加
    socket.on('connect', () => {
      connection.value = 'connected'
      if (!sawConnect) {
        // 首连：订阅 emit 在 subscribeRun 时已发出（未连接则由 socket.io 缓冲，
        // 连接即送达一次）——重发会让服务端对同一房间重放 graph:history（首连双发）
        sawConnect = true
        return
      }
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

  // ── 批量订阅（P3 台账 #2）：订阅域 = 可见页 ──
  /** 视图翻页/过滤后调用：订阅新可见页，退出不再可见的页（unsubscribe 旧页）。
   *  事件驱动的现场新 run 仍走 applyEvent 内的即订阅（安全网，不与可见页冲突）。 */
  function syncVisibleRunIds(runIds: string[]): void {
    ensureSocket()
    if (!socket) return
    const want = new Set(runIds)
    for (const id of [...subscribed]) {
      if (!want.has(id)) {
        subscribed.delete(id)
        socket.emit('unsubscribe', id)
      }
    }
    for (const id of runIds) subscribeRun(id)
  }

  // ── actions ──
  /** REST 拉全量列表并合并（保留既有 run 的事件缓冲与投影）。
   *  只建连不订阅（P3 台账 #2）：连接态徽标与重连重发机制在此武装，
   *  订阅域由 syncVisibleRunIds（视图可见页）唯一驱动。 */
  async function fetchRuns(): Promise<void> {
    loading.value = true
    ensureSocket()
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
      // P3 台账 #2：fetchRuns 只做数据合并，不再全量订阅——订阅域由
      // syncVisibleRunIds（视图可见页）驱动
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

  /** HITL 恢复：interruptId 取自事件投影的未决中断（无未决中断则拒绝）。
   *  REST 成功后立即落一条本地 resume 事件（乐观投影，走 applyEvent 同一投影路径）：
   *  状态 → running、未决中断关闭，不等 socket 回声；REST 失败则不落（状态不动）。 */
  async function resumeRun(runId: string, value?: unknown): Promise<void> {
    const run = runs.value.find(r => r.runId === runId)
    const interruptId = run?.pendingInterruptId
    if (!run || !interruptId) throw new Error(`No pending interrupt for run ${runId}`)
    await runRest.resumeRun(runId, interruptId, value)
    applyEvent({
      type: 'graph.resume',
      graphId: run.graphId,
      threadId: runId,
      interruptId,
      resumeValue: value,
      ts: new Date().toISOString(),
    })
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
    sawConnect = false
    subscribed.clear()
    // 去重键集不清空：重连重放的 history 仍按 eid 丢弃（有界，见 SEEN_KEY_LIMIT）
    connection.value = 'disconnected'
  }

  return {
    // state
    runs, selectedRunId, loading, error, connection,
    replayRunId, replayEvents, replayLoading,
    archivedMap,
    // getters
    sortedRuns, awaitingCount, selectedRun,
    awaitingRuns, pendingInboxRuns, archivedInboxRuns,
    // actions
    fetchRuns, selectRun, resumeRun, forkRun, fetchReplay, disconnect,
    archiveRun, unarchiveRun, syncVisibleRunIds,
    // 测试与调试暴露（不发生产语义）
    applyEvent,
  }
})
