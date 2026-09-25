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
  DELIVERY_EVENT_TYPES, DELIVERY_GATES, DELIVERY_INDEX_ACCOUNT_DATA_TYPE,
  DELIVERY_SCHEMA_VERSION, DELIVERY_STAGES,
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

  /** 网络读数（设计 §7 总览：在途案例数/阶段分布/待审 HumanGate=G1/G5 缺 pass 计数） */
  const networkReadings = computed(() => {
    const pendingHumanGates = cases.value.reduce((n, c) => {
      const need = ['G1', 'G5'].filter(g => !c.gates.some(x => x.gate === g && x.verdict === 'pass'))
      return n + need.length
    }, 0)
    return {
      inFlight: cases.value.length,
      byStage: byStage.value,
      pendingHumanGates,
    }
  })

  /** 发起向导（M2 工程场景）：建案例房 + case state + index 登记（镜像 mx-delivery-lib 语义） */
  async function createCase(input: { title: string; repoUrl: string; tier: string }): Promise<void> {
    const client = matrixStore.client as MatrixClient | null
    if (!client) throw new Error('matrix client 未就绪')
    const self = (client.getUserId() ?? '@unknown:local').split(':')[0].replace(/^@/, '')
    const caseId = `dlv-${Date.now()}`
    const result = await client.createRoom({
      name: `delivery-${caseId}-${input.title.slice(0, 24)}`,
      preset: 'private_chat' as never,
      is_direct: false,
    }) as unknown as { room_id: string }
    const now = Date.now()
    await client.sendStateEvent(result.room_id, DELIVERY_EVENT_TYPES.case, {
      schemaVersion: DELIVERY_SCHEMA_VERSION,
      caseId, title: input.title, repoUrl: input.repoUrl, tier: input.tier,
      stage: 'P1', ownerAccount: self,
      createdAt: now, updatedAt: now, updatedBy: self,
    }, '')
    // index 幂等并入（发现机制；读失败视为空表重建）
    let roomIds: string[] = []
    try {
      const idx = parseIndexContent(await client.getAccountDataFromServer(DELIVERY_INDEX_ACCOUNT_DATA_TYPE))
      if (idx) roomIds = idx.roomIds
    } catch { /* 首例无 index */ }
    await client.setAccountData(DELIVERY_INDEX_ACCOUNT_DATA_TYPE, {
      schemaVersion: DELIVERY_SCHEMA_VERSION,
      roomIds: [...new Set([...roomIds, result.room_id])],
      updatedBy: self, updatedAt: now,
    })
    await refresh()
  }

  return { cases, loaded, byStage, networkReadings, refresh, createCase, DELIVERY_STAGES, DELIVERY_GATES }
})
