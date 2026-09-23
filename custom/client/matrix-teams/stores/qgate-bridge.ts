// overlay/custom/client/matrix-teams/stores/qgate-bridge.ts
// QGate → Matrix delivery.gate 桥接（设计 D2 终态落地：机器执法层的判定进分布式交付网络）。
// 语义：QGate 判定（六态）按 align 表映射为 delivery gate 三态 pass/conditional/reject，
//   gate 编号按 quality domain 映射 G1-G6；evidence=artifact 指针（.qgate/ 运行路径），
//   判定来源统一 decidedBy=qgate-bridge（bot 侧机械判定，不冒人）。
// 房间路由：优先该 caseId 已知的案例房（caseRooms），否则注册房；绑定关系持久在
//   bridge-state.json（runs 索引下，本地，不入 git）。
// 读端：review-center 已监听 delivery.gate 事件并聚合（无需本文件对接）。
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { RoomEvent, type MatrixClient } from 'matrix-js-sdk'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import {
  DELIVERY_EVENT_TYPES, DELIVERY_SCHEMA_VERSION,
  parseCaseContent,
  type GateContent, type DeliveryGate,
} from '../delivery-protocol'
import { unwrapRef } from '../utils'

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

  return { handleTimelineEvent, reportVerdict, learnCaseRoom }
})

// ── CLI/插件侧可复用的离线换算面（不依赖 Matrix）：判定 → GateContent JSON ──
export { DOMAIN_TO_GATE }

/** bridge-state 持久化（.qgate/bridge-state.json）：caseId→roomId 镜像。 */
export function loadBridgeState(qgateDir: string): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(join(qgateDir, 'bridge-state.json'), 'utf8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

export function saveBridgeState(qgateDir: string, state: Record<string, string>): void {
  try {
    mkdirSync(qgateDir, { recursive: true })
    writeFileSync(join(qgateDir, 'bridge-state.json'), JSON.stringify(state, null, 2) + '\n', 'utf8')
  } catch { /* 镜像写失败不阻断上报 */ }
}

export function bridgeStateExists(qgateDir: string): boolean {
  return existsSync(join(qgateDir, 'bridge-state.json'))
}
