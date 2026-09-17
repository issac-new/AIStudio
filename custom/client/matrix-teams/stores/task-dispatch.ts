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

export interface DispatchView {
  assign: AssignContent
  receipt: ReceiptContent | null
}

export const useTaskDispatchStore = defineStore('matrix-task-dispatch', () => {
  const matrixClientStore = useMatrixClientStore()
  const registry = useTeamRegistryStore()
  const dispatches = ref<DispatchView[]>([])

  // pinia 代理读取时已解包；测试 mock 的是 setup 原始返回（ref 形态 { value }）。
  // 'value' in raw 判定 ref 形态并取 .value（含 null）；真实 MatrixClient/字符串无 .value 属性。
  // 注意不能用 ?.value ?? raw：{ value: null } 会被 ?? 判空而回退成包装对象（真值），丢 null 语义。
  function unwrap<T>(raw: unknown): T | null {
    if (raw !== null && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
      return (raw as { value: unknown }).value as T | null
    }
    return (raw ?? null) as T | null
  }
  const clientRef = computed<MatrixClient | null>(() => unwrap<MatrixClient>((matrixClientStore as unknown as { client?: unknown }).client))
  const userIdRef = computed<string | null>(() => unwrap<string>((matrixClientStore as unknown as { userId?: unknown }).userId))
  const registryRoomIdRef = computed<string | null>(() => unwrap<string>((registry as unknown as { registryRoomId?: unknown }).registryRoomId))
  const accountsRef = computed<TeamAccountView[]>(() => unwrap<TeamAccountView[]>((registry as unknown as { accounts?: unknown }).accounts) ?? [])

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

  function upsertAssign(assign: AssignContent): void {
    if (!dispatches.value.some(d => d.assign.taskId === assign.taskId)) {
      dispatches.value = [...dispatches.value, { assign, receipt: null }]
    }
  }

  function mergeReceipt(receipt: ReceiptContent): void {
    const view = dispatches.value.find(d => d.assign.taskId === receipt.taskId)
    if (!view) return
    if (view.receipt && view.receipt.reportedAt >= receipt.reportedAt) return
    dispatches.value = dispatches.value.map(d =>
      d.assign.taskId === receipt.taskId ? { ...d, receipt } : d)
  }

  /** 成员侧接收：Task 9 实现（resolveProfile → kanban 建卡 → kv → created 回执）。 */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function receiveAssign(_assign: AssignContent): Promise<void> { /* Task 9 填充 */ }

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

  return { dispatches, sendAssignment, handleTimelineEvent, receiveAssign, ensureListening }
})
