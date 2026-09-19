// overlay/custom/client/matrix-teams/stores/task-linkage.ts
// M-D 消息任务联动：消息转任务与卡片操作的写路径（一切 = 发事件，UI 只投影）。
// 消费既有事件流（task-dispatch 的 assign/receipt 监听与回填），本 store 只补
// 「从消息创建」与「卡片操作」两个动作面；回环验收见 __tests__/md-task-linkage.test.ts。
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useTeamRegistryStore } from './team-registry'
import {
  TASK_EVENT_TYPES,
  parseAssignContent, parseReceiptContent,
  type AssignContent, type ReceiptContent,
} from '../protocol'
import { buildTaskFromMessage, buildOpReceipt, buildReassign, type CardOp } from '../task-card'
import { unwrapRef } from '../utils'

export const useTaskLinkageStore = defineStore('matrix-task-linkage', () => {
  const matrixClientStore = useMatrixClientStore()
  const registry = useTeamRegistryStore()
  const assigns = ref<AssignContent[]>([])
  const receipts = ref<ReceiptContent[]>([])

  const clientRef = computed<MatrixClient | null>(() => unwrapRef<MatrixClient>((matrixClientStore as unknown as { client?: unknown }).client))
  const userIdRef = computed<string | null>(() => unwrapRef<string>((matrixClientStore as unknown as { userId?: unknown }).userId))
  const registryRoomIdRef = computed<string | null>(() => unwrapRef<string>((registry as unknown as { registryRoomId?: unknown }).registryRoomId))

  /** 投影：assign 按 taskId 取最新，挂最新 receipt（卡片视图的数据面）。 */
  const cards = computed<{ assign: AssignContent; receipt: ReceiptContent | null }[]>(() => {
    const latestAssign = new Map<string, AssignContent>()
    for (const a of assigns.value) {
      const prev = latestAssign.get(a.taskId)
      if (!prev || a.issuedAt >= prev.issuedAt) latestAssign.set(a.taskId, a)
    }
    const latestReceipt = new Map<string, ReceiptContent>()
    for (const r of receipts.value) {
      const prev = latestReceipt.get(r.taskId)
      if (!prev || r.reportedAt >= prev.reportedAt) latestReceipt.set(r.taskId, r)
    }
    return [...latestAssign.values()].map(assign => ({ assign, receipt: latestReceipt.get(assign.taskId) ?? null }))
  })

  async function handleTimelineEvent(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string; getContent?: () => unknown }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !ev.getContent || !r?.roomId) return
    if (r.roomId !== registryRoomIdRef.value) return
    const type = ev.getType()
    if (type === TASK_EVENT_TYPES.assign) {
      const a = parseAssignContent(ev.getContent())
      if (a) assigns.value = [...assigns.value, a]
    } else if (type === TASK_EVENT_TYPES.receipt) {
      const rc = parseReceiptContent(ev.getContent())
      if (rc) receipts.value = [...receipts.value, rc]
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
  ensureListening()

  async function onTimeline(event: unknown, room: unknown): Promise<void> {
    await handleTimelineEvent(event, room)
  }

  /** 消息转任务：发 assign 事件（标题=首行，正文带原文与来源锚点）。 */
  async function createTaskFromMessage(input: {
    text: string
    sourceEventId?: string
    target: { account: string; agentTeam?: string; profile?: string }
    capability?: string[]
    phase?: string
    dueAt?: number
    parentId?: string
  }): Promise<{ ok: boolean; taskId?: string }> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    if (!client || !roomId) return { ok: false }
    const selfId = userIdRef.value ?? ''
    const content = buildTaskFromMessage({ ...input, issuedBy: selfId })
    try {
      await client.sendEvent(roomId, TASK_EVENT_TYPES.assign, content)
      return { ok: true, taskId: content.taskId }
    } catch {
      return { ok: false }
    }
  }

  /** 卡片操作：完成/阻塞/重开 → 回执事件。 */
  async function applyCardOp(op: CardOp, taskId: string): Promise<boolean> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    if (!client || !roomId) return false
    const selfId = userIdRef.value ?? ''
    const local = cards.value.find(c => c.assign.taskId === taskId)?.receipt?.localTaskId
    try {
      await client.sendEvent(roomId, TASK_EVENT_TYPES.receipt, buildOpReceipt(op, taskId, local, selfId))
      return true
    } catch {
      return false
    }
  }

  /** 转派：同 taskId 重发 assign（新 target）。 */
  async function reassignTask(taskId: string, newTarget: { account: string; agentTeam?: string; profile?: string }): Promise<boolean> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    const current = cards.value.find(c => c.assign.taskId === taskId)?.assign
    if (!client || !roomId || !current) return false
    const selfId = userIdRef.value ?? ''
    try {
      await client.sendEvent(roomId, TASK_EVENT_TYPES.assign, buildReassign(taskId, current, newTarget, selfId))
      return true
    } catch {
      return false
    }
  }

  return { cards, handleTimelineEvent, createTaskFromMessage, applyCardOp, reassignTask }
})
