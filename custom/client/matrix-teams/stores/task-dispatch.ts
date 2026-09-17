// overlay/custom/client/matrix-teams/stores/task-dispatch.ts
// 任务投递：leader 发 assign 消息；外派视图 = assign ∪ 最新 receipt（leader 不做本地 kanban 镜像，
// 单一事实源在 Matrix，spec §6.2）。成员侧接收落地在 receiveAssign（Task 9 实现）。
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useTeamRegistryStore } from './team-registry'
import {
  TASK_EVENT_TYPES, isSwarmStudioEventType,
  parseAssignContent, parseReceiptContent,
  type AssignContent, type ReceiptContent, type ReceiptStatus,
} from '../protocol'
import type { TeamAccountView } from '../adapters/accounts'
import { createTask, getTask } from '@/api/hermes/kanban'
import { resolveTargetProfile, mapKanbanStatusToReceipt } from '../adapters/dispatch-target'
import { loadDispatchIndex, saveDispatchIndex, type DispatchIndexEntry } from '../store/dispatch-kv'
import { unwrapRef } from '../utils'

export interface DispatchView {
  assign: AssignContent
  receipt: ReceiptContent | null
}

export const useTaskDispatchStore = defineStore('matrix-task-dispatch', () => {
  const matrixClientStore = useMatrixClientStore()
  const registry = useTeamRegistryStore()
  const dispatches = ref<DispatchView[]>([])

  // pinia 代理读取时已解包；测试 mock 的是 setup 原始返回（ref 形态 { value }）。
  // 双形态解包统一走 unwrapRef（utils.ts 单一事实源）。
  const clientRef = computed<MatrixClient | null>(() => unwrapRef<MatrixClient>((matrixClientStore as unknown as { client?: unknown }).client))
  const userIdRef = computed<string | null>(() => unwrapRef<string>((matrixClientStore as unknown as { userId?: unknown }).userId))
  const registryRoomIdRef = computed<string | null>(() => unwrapRef<string>((registry as unknown as { registryRoomId?: unknown }).registryRoomId))
  const accountsRef = computed<TeamAccountView[]>(() => unwrapRef<TeamAccountView[]>((registry as unknown as { accounts?: unknown }).accounts) ?? [])

  async function sendAssignment(input: {
    title: string
    body?: string
    priority?: string
    target: { account: string; agentTeam?: string; profile?: string }
  }): Promise<boolean> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    if (!client || !roomId) return false
    const selfId = userIdRef.value ?? ''
    try {
      await client.sendEvent(roomId, TASK_EVENT_TYPES.assign, {
        taskId: crypto.randomUUID(),
        title: input.title,
        body: input.body,
        priority: input.priority,
        target: { account: input.target.account, agentTeam: input.target.agentTeam, profile: input.target.profile },
        issuedBy: selfId,
        issuedAt: Date.now(),
      } as AssignContent)
      return true
    } catch {
      return false
    }
  }

  // 孤儿回执暂存：receipt 先于 assign 到达（迟到排序/历史重放）时不丢，
  // upsertAssign 补配到视图。view 内无消费方，非响应式 plain Map 即可。
  const pendingReceipts = new Map<string, ReceiptContent>()

  function upsertAssign(assign: AssignContent): void {
    if (!dispatches.value.some(d => d.assign.taskId === assign.taskId)) {
      const pending = pendingReceipts.get(assign.taskId) ?? null
      if (pending) pendingReceipts.delete(assign.taskId)
      dispatches.value = [...dispatches.value, { assign, receipt: pending }]
    }
  }

  function mergeReceipt(receipt: ReceiptContent): void {
    const view = dispatches.value.find(d => d.assign.taskId === receipt.taskId)
    if (!view) {
      // 先于 assign 到达：暂存待补配，不丢。
      pendingReceipts.set(receipt.taskId, receipt)
      return
    }
    if (view.receipt && view.receipt.reportedAt >= receipt.reportedAt) return
    dispatches.value = dispatches.value.map(d =>
      d.assign.taskId === receipt.taskId ? { ...d, receipt } : d)
  }

  async function sendReceipt(taskId: string, status: ReceiptStatus, extra?: { localTaskId?: string; reason?: string }): Promise<boolean> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    if (!client || !roomId) return false
    const selfId = userIdRef.value ?? ''
    try {
      await client.sendEvent(roomId, TASK_EVENT_TYPES.receipt, {
        taskId, status, localTaskId: extra?.localTaskId, reason: extra?.reason,
        reportedBy: selfId, reportedAt: Date.now(),
      } as ReceiptContent)
      return true
    } catch { return false }
  }

  async function receiveAssign(assign: AssignContent): Promise<void> {
    const index = loadDispatchIndex()
    if (index[assign.taskId]) return // kv 防重（spec §6.2）
    const profile = resolveTargetProfile(assign.target, accountsRef.value)
    if (!profile) {
      await sendReceipt(assign.taskId, 'failed', { reason: 'no-such-profile' })
      return
    }
    // priority 透传：协议层 AssignContent.priority 为 string，kanban 建卡要求 number——
    // 数值字符串有限强转，非数值（含 undefined）不携带（不硬编 0：0 是有效优先级，undefined 才是"未指定"）。
    const prio = assign.priority !== undefined && Number.isFinite(Number(assign.priority))
      ? Number(assign.priority) : undefined
    try {
      const task = await createTask({
        title: `[外派-${assign.taskId.slice(0, 6)}] ${assign.title}`,
        body: assign.body,
        assignee: profile,
        priority: prio,
      })
      const entry: DispatchIndexEntry = { localTaskId: task.id, lastStatus: 'created', lastSyncedAt: Date.now() }
      saveDispatchIndex({ ...index, [assign.taskId]: entry })
      await sendReceipt(assign.taskId, 'created', { localTaskId: task.id })
    } catch (err) {
      await sendReceipt(assign.taskId, 'failed', { reason: err instanceof Error ? err.message.slice(0, 200) : 'create-task-failed' })
    }
  }

  async function handleTimelineEvent(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string; isState?: () => boolean; getContent?: () => unknown }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !ev.isState || !ev.getContent || !r?.roomId) return
    if (r.roomId !== registryRoomIdRef.value) return
    const type = ev.getType()
    if (type === TASK_EVENT_TYPES.assign) {
      const assign = parseAssignContent(ev.getContent())
      if (!assign) return
      upsertAssign(assign)
      if (userIdRef.value && assign.target.account === userIdRef.value) {
        await receiveAssign(assign)
      }
    } else if (type === TASK_EVENT_TYPES.receipt) {
      const receipt = parseReceiptContent(ev.getContent())
      if (receipt) mergeReceipt(receipt)
    }
  }

  let listening = false
  function ensureListening(): void {
    if (listening) return
    listening = true
    watch(clientRef, (client, prev) => {
      if (prev) prev.off(RoomEvent.Timeline, onTimeline)
      if (!client) return
      client.on(RoomEvent.Timeline, onTimeline)
    }, { immediate: true })
  }

  // 终审修复（同 team-registry.ts:260 模式）：ensureListening 在 store setup 顶层调用，
  // watcher 落在 pinia 实例的 effect scope，不随组件卸载销毁。此前由 DispatchList
  // onMounted 调用时 watcher 绑组件作用域——tab 切换卸载后 listening 旗标仍 true
  // 但 watcher 已死，成员侧 assign 落地静默失效。组件侧不再调用（轮询 timer 仍属组件级）。
  ensureListening()

  // ── Important-2：历史回填（spec §10「Sync 全量补拉天然恢复」的落地）──
  // 成员重启/首次打开 tab 前到达的 assign 不会触发 timeline 监听（监听只消费挂载后
  // 的增量）。client 就绪且注册房间已知后，对房间做一次历史回放：取 live timeline
  // 中的 assign/receipt 逐个走与增量监听相同的 handleTimelineEvent 流程。kv 防重
  //（receiveAssign 已记录即跳过）+ 视图幂等（upsertAssign/mergeReceipt）保证重复
  // 回放不重复建卡。scrollback 尽力扩大历史窗口（v41 签名 scrollback(room, limit)），
  // 失败/不存在时以已同步的 live timeline 窗口为准。
  const BACKFILL_SCROLLBACK_LIMIT = 100
  // 已回填状态按 client 实例维度记录：登出重登（不刷新页面）后 client 是新实例，
  // 房间相同也必须重新回放——sticky「房间→布尔」会让两次会话间隙到达的 assign
  // 静默丢失（重登后 watch 触发但旗标命中直接 return）。
  let backfilledFor: { client: MatrixClient; roomId: string } | null = null

  async function backfillHistory(): Promise<void> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    if (!client || !roomId || (backfilledFor?.client === client && backfilledFor.roomId === roomId)) return
    const roomAwareClient = client as unknown as {
      getRoom?: (id: string) => unknown
      scrollback?: (room: unknown, limit?: number) => Promise<unknown>
    }
    let room: unknown
    try {
      room = roomAwareClient.getRoom?.(roomId) ?? null
    } catch { return }
    if (!room) return
    backfilledFor = { client, roomId } // 房间已定位即置位：scrollback 失败也不反复重试
    try {
      if (typeof roomAwareClient.scrollback === 'function') {
        room = await roomAwareClient.scrollback(room, BACKFILL_SCROLLBACK_LIMIT) ?? room
      }
    } catch { /* 历史分页失败：以已同步窗口为准 */ }
    const events = (room as { getLiveTimeline?: () => { getEvents?: () => unknown[] } })
      .getLiveTimeline?.()?.getEvents?.() ?? []
    for (const ev of events) {
      try {
        await handleTimelineEvent(ev, room)
      } catch { /* 单条回放失败跳过，不阻断其余历史 */ }
    }
  }

  // client 与注册房间任一就绪变化都可能解锁回填（典型时序：登录 → 初始 sync →
  // detectRegistry 写入 registryRoomId），watch immediate 覆盖实例化时已就绪的场景。
  watch([clientRef, registryRoomIdRef], () => { void backfillHistory() }, { immediate: true })

  async function onTimeline(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string }
    if (!ev.getType || !isSwarmStudioEventType(ev.getType())) return
    await handleTimelineEvent(event, room)
  }

  /** 轮询回执上报（成员侧）：遍历 kv 索引 → 拉本地卡状态 → 变化才回执并落 kv。
   *  单条失败静默跳过，下轮重试；发失败不回写 kv（下轮重发）。 */
  async function pollAndReport(): Promise<void> {
    const index = loadDispatchIndex()
    for (const [taskId, entry] of Object.entries(index)) {
      let status: string
      try {
        const task = await getTask(entry.localTaskId)
        status = task.status
      } catch { continue } // 单条失败静默，下轮重试
      const mapped = mapKanbanStatusToReceipt(status)
      if (mapped === entry.lastStatus) continue
      const ok = await sendReceipt(taskId, mapped, { localTaskId: entry.localTaskId })
      if (ok) {
        saveDispatchIndex({ ...loadDispatchIndex(), [taskId]: { ...entry, lastStatus: mapped, lastSyncedAt: Date.now() } })
      }
    }
  }

  return { dispatches, sendAssignment, handleTimelineEvent, receiveAssign, sendReceipt, ensureListening, backfillHistory, pollAndReport }
})
