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

  return { dispatches, sendAssignment, handleTimelineEvent, receiveAssign, sendReceipt, ensureListening, pollAndReport }
})
