// overlay/custom/client/matrix-teams/stores/qgate-bridge.ts
// QGate → Matrix delivery.gate 桥接（设计 D2 终态落地：机器执法层的判定进分布式交付网络）。
// 语义：QGate 判定（六态）按 align 表映射为 delivery gate 三态 pass/conditional/reject，
//   gate 编号按 quality domain 映射 G1-G6；evidence=artifact 指针（.qgate/ 运行路径），
//   判定来源统一 decidedBy=qgate-bridge（bot 侧机械判定，不冒人）。
// 房间路由：优先该 caseId 已知的案例房（caseRooms），否则注册房；绑定关系持久在
//   bridge-state.json（runs 索引下，本地，不入 git）。
// 读端：review-center 已监听 delivery.gate 事件并聚合（无需本文件对接）。
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import {
  DELIVERY_EVENT_TYPES, DELIVERY_SCHEMA_VERSION,
  parseCaseContent,
  type GateContent, type DeliveryGate,
} from '../delivery-protocol'
import { unwrapRef } from '../utils'
// 注：bridge-state 离线持久化助手在 ./qgate-bridge-state.node.ts（node:fs 依赖
// 不得进浏览器 bundle——本 store 被视图引用后曾把 node:path 顶层 import 带进
// 页面，vite externalize 在 import 绑定即抛错，2026-10-08 吸收轮走查逮住）。

/** 同步聚合的输入行（与 governance api QgateVerdictRow 同形；client 侧自持类型防跨域 import）。 */
export interface QgateVerdictRowLike {
  gateId: string
  domain: string
  verdict: QGateVerdictInput['verdict']
  deliveryVerdict: 'pass' | 'conditional' | 'reject'
  runId?: string
  failureSummary?: string
  conditions?: string[]
  sourceBucket?: 'verified' | 'declared' | 'degraded' | 'none'
}

/** QGate 六态 → delivery 三态（与 qgate align.ts 同一张表，client 侧自管一份防跨仓 import）。 */
export const QGATE_TO_DELIVERY: Record<string, 'pass' | 'conditional' | 'reject'> = {
  PASS: 'pass',
  CONDITIONAL: 'conditional',
  WAIVED: 'conditional',
  FAIL: 'reject',
  INCONCLUSIVE: 'conditional',
  NOT_APPLICABLE: 'conditional',
}

/** quality domain → delivery gate 编号（qgate align DOMAIN_TO_GATES 首门）。 */
const DOMAIN_TO_GATE: Record<string, DeliveryGate> = {
  L0: 'G1', L1: 'G3', L2: 'G4', L3: 'G4', L4: 'G5', L5: 'G5',
}

export interface QGateVerdictInput {
  caseId: string
  gateId: string
  domain?: string
  verdict: 'PASS' | 'FAIL' | 'CONDITIONAL' | 'INCONCLUSIVE' | 'WAIVED' | 'NOT_APPLICABLE'
  runId?: string
  summary?: string
  conditions?: string[]
}

/** 桥接换算（纯函数，可单测）：QGate 判定 → delivery.gate content。 */
export function toDeliveryGateContent(input: QGateVerdictInput, at = Date.now()): GateContent | null {
  const verdict = QGATE_TO_DELIVERY[input.verdict]
  if (!verdict) return null
  const gate = DOMAIN_TO_GATE[input.domain ?? ''] ?? 'G4' // 未知 domain 落 G4 验证门（保守中位）
  const summaryParts = [
    `qgate ${input.gateId}`,
    input.runId ? `run ${input.runId}` : undefined,
    input.summary,
  ].filter(Boolean)
  const content: GateContent = {
    schemaVersion: DELIVERY_SCHEMA_VERSION,
    caseId: input.caseId,
    gate,
    verdict,
    evidence: { kind: 'artifact', summary: summaryParts.join(' — ').slice(0, 400) },
    decidedBy: 'qgate-bridge',
    at,
  }
  // 打回必附方向（协议纪律：reject/conditional 必填 reason）
  if (verdict !== 'pass') {
    const conds = input.conditions?.slice(0, 3).join('；')
    content.reason = conds ? conds.slice(0, 1000) : `qgate verdict ${input.verdict} — see .qgate/ runs for details`
  }
  return content
}

export const useQGateBridgeStore = defineStore('matrix-qgate-bridge', () => {
  const matrixClientStore = useMatrixClientStore()
  const clientRef = computed<MatrixClient | null>(() => unwrapRef<MatrixClient>((matrixClientStore as unknown as { client?: unknown }).client))
  const registryRoomIdRef = computed<string | null>(() => unwrapRef<string>((matrixClientStore as unknown as { registryRoomId?: unknown }).registryRoomId))

  /** caseId → 案例房（从房间 delivery.case 事件学习；本地镜像在 bridge-state）。 */
  const caseRooms = new Map<string, string>()

  function learnCaseRoom(caseId: string, roomId: string): void {
    if (!caseRooms.has(caseId)) caseRooms.set(caseId, roomId)
  }

  async function handleTimelineEvent(event: unknown, room: unknown): Promise<void> {
    const ev = event as { getType?: () => string; getContent?: () => unknown }
    const r = room as { roomId?: string } | undefined
    if (!ev.getType || !ev.getContent || !r?.roomId) return
    if (ev.getType() === DELIVERY_EVENT_TYPES.case) {
      const c = parseCaseContent(ev.getContent())
      if (c) learnCaseRoom(c.caseId, r.roomId)
    }
  }

  // 时间线接线（吸收轮根治断头桥）：此前 reportVerdict 无任何生产调用方、
  // caseRooms 学习也无人挂——判定流根本没进网络。挂法与 review-center 同款
  // （store 顶层 watch client → RoomEvent.Timeline）。
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

  /** 上报一条 QGate 判定到案例房（或注册房兜底）。 */
  async function reportVerdict(input: QGateVerdictInput): Promise<{ ok: boolean; error?: 'no-client' | 'no-room' }> {
    const client = clientRef.value
    if (!client) return { ok: false, error: 'no-client' }
    const roomId = caseRooms.get(input.caseId) ?? registryRoomIdRef.value
    if (!roomId) return { ok: false, error: 'no-room' }
    const content = toDeliveryGateContent(input)
    if (!content) return { ok: false, error: 'no-room' }
    try {
      await client.sendEvent(roomId, DELIVERY_EVENT_TYPES.gate, content)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  /** 批量同步：governance qgate-verdicts 全量行 → 逐门 delivery.gate 事件。
   *  供交付案例面板"同步 QGate 判定"动作调用（流程闭环：qgate run → 案例房门禁灯）。 */
  async function syncVerdictsToCase(caseId: string, rows: QgateVerdictRowLike[]): Promise<{ sent: number; failed: number; error?: 'no-client' | 'no-room' }> {
    if (rows.length === 0) return { sent: 0, failed: 0 }
    let sent = 0
    let failed = 0
    let lastError: 'no-client' | 'no-room' | undefined
    for (const row of rows) {
      const res = await reportVerdict({
        caseId,
        gateId: row.gateId,
        domain: row.domain,
        verdict: row.verdict,
        runId: row.runId,
        summary: [row.failureSummary, row.sourceBucket ? `source=${row.sourceBucket}` : undefined].filter(Boolean).join(' · ') || undefined,
        conditions: row.conditions,
      })
      if (res.ok) sent += 1
      else { failed += 1; lastError = res.error }
    }
    return { sent, failed, error: failed > 0 ? lastError : undefined }
  }

  return { handleTimelineEvent, reportVerdict, syncVerdictsToCase, learnCaseRoom }
})

// ── CLI/插件侧可复用的离线换算面（不依赖 Matrix）：判定 → GateContent JSON ──
export { DOMAIN_TO_GATE }
