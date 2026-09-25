// overlay/custom/client/matrix-teams/stores/delivery-cases.ts
// 交付案例面板 store（M2，分布式设计 §7 协作场景）：读 delivery.* 协议事件投影
// 案例列表（index 发现 → case state → gate/stage 事件）。
// 数据面约定（协议 v2，单一事实源=客户端 delivery-protocol.ts）：
//   发现：account-data DELIVERY_INDEX_ACCOUNT_DATA_TYPE.roomIds（mx-delivery-lib 写入）
//   案例头：case 房 state = DELIVERY_EVENT_TYPES.case（key=caseId）
//   门禁：timeline 消息事件 = DELIVERY_EVENT_TYPES.gate（同 gate 取最新 at）
//   阶段：timeline 消息事件 = DELIVERY_EVENT_TYPES.stage（outcome=done 计数）
// 视图：../views/DeliveryCasesView.vue（/app/cases，ia2 routes）。
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { MatrixClient, Room } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import {
  DELIVERY_EVENT_TYPES, DELIVERY_GATES, DELIVERY_INDEX_ACCOUNT_DATA_TYPE, DELIVERY_STAGES,
  parseCaseContent, parseGateContent, parseIndexContent, parseStageContent,
} from '../delivery-protocol'

export interface GateLight { gate: string; verdict: 'pass' | 'conditional' | 'reject'; decidedBy: string; at: number; reason?: string; evidence?: string }
export interface DeliveryCaseView {
  roomId: string
  caseId: string
  title: string
  stage: string
  tier: string
  ownerAccount: string
  stagesDone: string[]
  gates: GateLight[]
}

function projectRoom(room: Room): DeliveryCaseView | null {
  // 真实 SDK 先例（v41/team-registry）：getStateEvents 必须带 eventType
  const caseEvents = (room.currentState.getStateEvents(DELIVERY_EVENT_TYPES.case) ?? []) as Array<Record<string, unknown>>
  const raw = caseEvents[0]?.getContent?.() ?? (caseEvents[0] as unknown as { content?: unknown })?.content
  const head = parseCaseContent(raw)
  if (!head) return null
  const stagesDone = new Set<string>()
  const gateByGate = new Map<string, GateLight>()
  for (const ev of room.getLiveTimeline().getEvents()) {
    const type = ev.getType?.()
    if (type === DELIVERY_EVENT_TYPES.stage) {
      const st = parseStageContent(ev.getContent?.())
      if (st && st.outcome === 'done') stagesDone.add(st.stage)
    } else if (type === DELIVERY_EVENT_TYPES.gate) {
      const g = parseGateContent(ev.getContent?.())
      if (!g) continue
      const prev = gateByGate.get(g.gate)
      if (!prev || g.at >= prev.at) {
        gateByGate.set(g.gate, {
          gate: g.gate, verdict: g.verdict, decidedBy: g.decidedBy, at: g.at,
          reason: g.reason, evidence: g.evidence.summary,
        })
      }
    }
  }
  return {
    roomId: room.roomId, caseId: head.caseId, title: head.title, stage: head.stage,
    tier: head.tier, ownerAccount: head.ownerAccount,
    stagesDone: [...stagesDone], gates: [...gateByGate.values()],
  }
}

export const useDeliveryCasesStore = defineStore('matrix-teams-delivery-cases', () => {
  const matrixStore = useMatrixClientStore()
  const cases = ref<DeliveryCaseView[]>([])
  const loaded = ref(false)

  async function refresh() {
    const client = matrixStore.client as MatrixClient | null
    if (!client) { cases.value = []; return }
    const rooms: Room[] = []
    // 发现机制：index account data（读失败回落=空，面板只显示可投影房间）
    try {
      const idxRaw = await client.getAccountDataFromServer(DELIVERY_INDEX_ACCOUNT_DATA_TYPE)
      const idx = parseIndexContent(idxRaw)
      if (idx) for (const rid of idx.roomIds) {
        const r = client.getRoom(rid)
        if (r) rooms.push(r)
      }
    } catch { /* 无 index 时回落全量扫描 */ }
    if (rooms.length === 0) {
      for (const r of client.getRooms()) rooms.push(r)
    }
    cases.value = rooms.map(projectRoom).filter((c): c is DeliveryCaseView => c !== null)
    loaded.value = true
  }

  const byStage = computed(() => {
    const out: Record<string, number> = {}
    for (const c of cases.value) out[c.stage] = (out[c.stage] ?? 0) + 1
    return out
  })

  return { cases, loaded, byStage, refresh, DELIVERY_STAGES, DELIVERY_GATES }
})
