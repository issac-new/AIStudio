// overlay/custom/client/matrix-teams/stores/review-center.ts
// M-C 评审中心：门禁事件的会签投影与签核动作（spec v1.2 §5.4）。
// 数据面：监听所有房间的 delivery.gate 事件（案例房为准），aggregateSignoffs 聚合出
// 待审清单；动作面：sendVerdict 按「每事件单 signoff」wire 形态发新 gate 事件，
// 驳回必附原因（协议纪律：reject/conditional 必带 reason）。
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import {
  DELIVERY_EVENT_TYPES, DELIVERY_SCHEMA_VERSION,
  parseGateContent, aggregateSignoffs, HUMAN_GATES,
  type GateContent, type GateAggregate, type DeliveryGate,
} from '../delivery-protocol'
import { unwrapRef } from '../utils'

export interface ReviewItem extends GateAggregate {
  /** 人工门（G1/G5/R1-R4）：签核动作仅对人类账号开放（UI 据此显隐操作）。 */
  isHumanGate: boolean
  /** 待审 = 聚合未到终态（非 pass 非 reject）。 */
  pending: boolean
  roomId: string
}

export const useReviewCenterStore = defineStore('matrix-review-center', () => {
  const matrixClientStore = useMatrixClientStore()
  const gates = ref<GateContent[]>([])
  // caseId → 案例房（签核动作落房间的事实源；来自该 case 首个 gate 事件所在房间）。
  const caseRooms = new Map<string, string>()

  const clientRef = computed<MatrixClient | null>(() => unwrapRef<MatrixClient>((matrixClientStore as unknown as { client?: unknown }).client))
  const userIdRef = computed<string | null>(() => unwrapRef<string>((matrixClientStore as unknown as { userId?: unknown }).userId))

  function ingestGate(content: GateContent, roomId: string): void {
    if (!caseRooms.has(content.caseId)) caseRooms.set(content.caseId, roomId)
    gates.value = [...gates.value.filter(g => g !== content), content]
  }

  /** 全量清单（含已终态，供分区列表）；按最新 at 排序。 */
  const reviewItems = computed<ReviewItem[]>(() => {
    const agg = aggregateSignoffs(gates.value)
    const items: ReviewItem[] = []
    for (const [key, a] of agg) {
      const roomId = caseRooms.get(a.caseId) ?? ''
      const isHumanGate = (HUMAN_GATES as readonly string[]).includes(a.gate)
      const pending = a.verdict !== 'pass' && a.verdict !== 'reject'
      items.push({ ...a, isHumanGate, pending, roomId })
      void key
    }
    return items.sort((x, y) => Math.max(...y.signoffs.map(s => s.at), 0) - Math.max(...x.signoffs.map(s => s.at), 0))
  })

  /** 待审清单（管理台分区主数据）。 */
  const pendingReviews = computed<ReviewItem[]>(() => reviewItems.value.filter(i => i.pending))

  async function handleTimelineEvent(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string; getContent?: () => unknown }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !ev.getContent || !r?.roomId) return
    if (ev.getType() !== DELIVERY_EVENT_TYPES.gate) return
    const gate = parseGateContent(ev.getContent())
    if (gate) ingestGate(gate, r.roomId)
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
  ensureListening() // store 顶层挂载（同 task-dispatch.ts 终审修复模式）

  async function onTimeline(event: unknown, room: unknown): Promise<void> {
    await handleTimelineEvent(event, room)
  }

  /** 签核动作：发一条带本人 signoff 的新 gate 事件（每事件单 signoff，投影聚合）。 */
  async function sendVerdict(input: {
    caseId: string
    gate: DeliveryGate
    verdict: 'pass' | 'reject'
    /** 驳回必附原因（协议纪律 + spec：打回必附方向）。 */
    reason?: string
    evidenceSummary?: string
  }): Promise<{ ok: boolean; error?: 'no-client' | 'no-room' | 'reason-required' }> {
    if (input.verdict === 'reject' && !input.reason?.trim()) return { ok: false, error: 'reason-required' }
    const client = clientRef.value
    const roomId = caseRooms.get(input.caseId)
    if (!client) return { ok: false, error: 'no-client' }
    if (!roomId) return { ok: false, error: 'no-room' }
    const selfId = userIdRef.value ?? ''
    const at = Date.now()
    try {
      await client.sendEvent(roomId, DELIVERY_EVENT_TYPES.gate, {
        schemaVersion: DELIVERY_SCHEMA_VERSION,
        caseId: input.caseId,
        gate: input.gate,
        verdict: input.verdict,
        evidence: { kind: 'human', summary: input.evidenceSummary ?? `signoff by ${selfId}` },
        ...(input.verdict === 'reject' ? { reason: input.reason } : {}),
        signoff: { decidedBy: selfId, verdict: input.verdict, at },
        decidedBy: selfId,
        at,
      } as GateContent)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  return { reviewItems, pendingReviews, handleTimelineEvent, sendVerdict }
})
