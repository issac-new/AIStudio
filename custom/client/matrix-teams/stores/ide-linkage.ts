// overlay/custom/client/matrix-teams/stores/ide-linkage.ts
// M-E IDE 接线：任务上下文绑定 + diff 确认=R3 代码评审门 + 提交回执回写（spec v1.2 §7 IDE 行）。
// 写路径纪律不变：R3 门 = gate 事件（人工通过即发，evidence=artifact 指 diff），
// 提交完成 = receipt done 事件；ACP 会话与 taskId 的绑定只在本 store 记忆，不进协议。
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
import { DELIVERY_EVENT_TYPES, DELIVERY_SCHEMA_VERSION, type GateContent } from '../delivery-protocol'
import { unwrapRef } from '../utils'

/** 任务上下文：关联文档指针（git 路径/URL）与聊天锚点（sourceEventId）。 */
export interface TaskBinding {
  taskId: string
  /** ACP 会话（IdeChatPane 的 agent 会话 id）。 */
  acpSessionId?: string
  /** 所属交付案例（R3 门事件的归属）。 */
  caseId?: string
  /** 案例房（gate 事件落点；缺省回落注册房）。 */
  roomId?: string
  /** 关联需求/设计文档指针。 */
  docRefs?: string[]
  /** 聊天锚点（消息转任务的来源事件）。 */
  chatAnchor?: string
}

export const useIdeLinkageStore = defineStore('matrix-ide-linkage', () => {
  const matrixClientStore = useMatrixClientStore()
  const registry = useTeamRegistryStore()
  const bindings = ref<Map<string, TaskBinding>>(new Map())
  const assigns = ref<AssignContent[]>([])
  const receipts = ref<ReceiptContent[]>([])

  const clientRef = computed<MatrixClient | null>(() => unwrapRef<MatrixClient>((matrixClientStore as unknown as { client?: unknown }).client))
  const userIdRef = computed<string | null>(() => unwrapRef<string>((matrixClientStore as unknown as { userId?: unknown }).userId))
  const registryRoomIdRef = computed<string | null>(() => unwrapRef<string>((registry as unknown as { registryRoomId?: unknown }).registryRoomId))

  function bindTask(taskId: string, meta: Partial<Omit<TaskBinding, 'taskId'>> = {}): void {
    const prev = bindings.value.get(taskId) ?? { taskId }
    bindings.value = new Map(bindings.value).set(taskId, { ...prev, ...meta, taskId })
  }

  function bindSession(taskId: string, acpSessionId: string): void {
    bindTask(taskId, { acpSessionId })
  }

  function bindingOf(taskId: string | null): TaskBinding | null {
    return taskId ? bindings.value.get(taskId) ?? null : null
  }

  /** 当前任务卡（assign 最新 + receipt 最新），供上下文条渲染。 */
  function cardOf(taskId: string | null): { assign: AssignContent; receipt: ReceiptContent | null } | null {
    if (!taskId) return null
    const latestAssign = assigns.value.filter(a => a.taskId === taskId).sort((x, y) => y.issuedAt - x.issuedAt)[0] ?? null
    if (!latestAssign) return null
    const receipt = receipts.value.filter(r => r.taskId === taskId).sort((x, y) => y.reportedAt - x.reportedAt)[0] ?? null
    return { assign: latestAssign, receipt }
  }

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

  /** diff 确认 = 人工通过 R3 代码评审门（gate 事件，evidence=artifact 指针）。 */
  async function confirmDiff(taskId: string, diffRef: string): Promise<{ ok: boolean; error?: 'no-client' | 'no-room' }> {
    const client = clientRef.value
    if (!client) return { ok: false, error: 'no-client' }
    const b = bindingOf(taskId)
    const roomId = b?.roomId ?? registryRoomIdRef.value
    if (!roomId) return { ok: false, error: 'no-room' }
    const selfId = userIdRef.value ?? ''
    const at = Date.now()
    const content: GateContent = {
      schemaVersion: DELIVERY_SCHEMA_VERSION,
      caseId: b?.caseId ?? `task:${taskId}`,
      gate: 'R3',
      verdict: 'pass',
      evidence: { kind: 'artifact', summary: diffRef.slice(0, 400) },
      signoff: { decidedBy: selfId, verdict: 'pass', at },
      decidedBy: selfId,
      at,
    }
    try {
      await client.sendEvent(roomId, DELIVERY_EVENT_TYPES.gate, content)
      return { ok: true }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ide-linkage] R3 send failed:', err)
      return { ok: false }
    }
  }

  /** 提交后回执回写看板：receipt done（执行轴终态）。 */
  async function markSubmitted(taskId: string, localTaskId?: string): Promise<boolean> {
    const client = clientRef.value
    const roomId = registryRoomIdRef.value
    if (!client || !roomId) return false
    const selfId = userIdRef.value ?? ''
    try {
      await client.sendEvent(roomId, TASK_EVENT_TYPES.receipt, {
        taskId, status: 'done', localTaskId,
        reportedBy: selfId, reportedAt: Date.now(),
      } as ReceiptContent)
      return true
    } catch {
      return false
    }
  }

  return { bindings, bindTask, bindSession, bindingOf, cardOf, handleTimelineEvent, confirmDiff, markSubmitted }
})
