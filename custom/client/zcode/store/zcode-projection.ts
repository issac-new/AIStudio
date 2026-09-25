// overlay/custom/client/zcode/store/zcode-projection.ts
// zcode 会话投影的客户端状态面（R4-P2 验收闭环：服务端 /zcode 事件 → 状态条 chip）。
//
// 事件契约 = 服务端 session-projection.ts ProjectionEvent：
//   session.upserted {workspaceId, sessionId, session} / session.removed {sessionId}
//   conversation.frame {sessionId, fromSeq, toSeq, payloadKind, deltaCount}
//   projection.status {reason: DispatchReasonCode 词表字面值, detail}
// 以及 mention-dispatch.ts MentionOutcome（type='mention.outcome', reason 词表同源）。
// reason 字面值与服务端冻结词表一一对应（dispatch-reasons.ts），客户端只按字面值映射文案。
import { computed, reactive } from 'vue'

export interface ZcodeSocketEvent {
  type: string
  workspaceId: string
  sessionId?: string
  reason?: string
  detail?: string
  session?: { sessionId?: string; title?: string; phase?: string }
  /** conversation.frame 帧序号（服务端 session-projection.ts 契约），判重用 */
  fromSeq?: number
  toSeq?: number
  deltaCount?: number
  at: number
}

/** reason 字面值 → 状态条短文案（与服务端词表同步维护；缺省原样展示字面值）。 */
export const REASON_CHIP_TEXT: Record<string, string> = {
  queued: '已入队',
  coalesced: '已合并',
  deferred: '暂缓',
  runtime_offline: '运行时离线',
  engine_unreachable: '引擎不可达',
  handshake_failed: '握手失败',
  subscription_failed: '订阅失败',
  subscription_lapsed: '订阅断线',
  frame_fragment_skipped: '分片跳过',
  frame_malformed: '帧异常',
  command_rejected: '命令被拒',
  internal_error: '内部错误',
}

export interface ProjectionState {
  sessions: Record<string, { title?: string; phase?: string; lastActivityAt: number }>
  conversationDeltaTotal: number
  statusEvents: Array<{ reason: string; detail?: string; at: number }>
  lastReason: string | null
}

const state = reactive<ProjectionState>({
  sessions: {},
  conversationDeltaTotal: 0,
  statusEvents: [],
  lastReason: null,
})

const MAX_STATUS_EVENTS = 20

// 幂等守卫：同一事件可能重复投递——服务端 emitZcodeProjectionEvent 对带 sessionId
// 的事件经 workspace 级 + 会话级两个房间各投一次，客户端同时 join 两者即收到两份；
// 断线补发、监听器累积同理。有界指纹集判重：重复的 conversation.frame 不再重复
// 累加 delta，重复的 status/mention 不再重复入状态环。
// session.upserted/removed 处理本就幂等（覆盖/删除），且同刻两次 upsert 内容可能
// 不同，不走判重。
const MAX_SEEN_KEYS = 200
const seenEventKeys = new Set<string>()
function isFirstDelivery(e: ZcodeSocketEvent): boolean {
  const key = [
    e.type, e.workspaceId, e.sessionId ?? '', e.reason ?? '', e.detail ?? '',
    e.fromSeq ?? '', e.toSeq ?? '', e.at, e.deltaCount ?? '',
  ].join('|')
  if (seenEventKeys.has(key)) return false
  seenEventKeys.add(key)
  if (seenEventKeys.size > MAX_SEEN_KEYS) {
    const oldest = seenEventKeys.values().next().value
    if (oldest !== undefined) seenEventKeys.delete(oldest)
  }
  return true
}

export function handleZcodeEvent(e: ZcodeSocketEvent): void {
  if (e.type === 'session.upserted' && e.sessionId) {
    state.sessions[e.sessionId] = {
      title: e.session?.title,
      phase: e.session?.phase,
      lastActivityAt: e.at,
    }
    return
  }
  if (e.type === 'session.removed' && e.sessionId) {
    delete state.sessions[e.sessionId]
    return
  }
  if (e.type === 'conversation.frame') {
    if (!isFirstDelivery(e)) return
    state.conversationDeltaTotal += e.deltaCount ?? 0
    if (e.sessionId) {
      state.sessions[e.sessionId] = { ...state.sessions[e.sessionId], lastActivityAt: e.at }
    }
    return
  }
  if (e.type === 'projection.status' || e.type === 'mention.outcome') {
    if (!e.reason) return
    if (!isFirstDelivery(e)) return
    state.statusEvents.push({ reason: e.reason, detail: e.detail, at: e.at })
    if (state.statusEvents.length > MAX_STATUS_EVENTS) state.statusEvents.shift()
    state.lastReason = e.reason
  }
}

export function resetProjectionStateForTests(): void {
  state.sessions = {}
  state.conversationDeltaTotal = 0
  state.statusEvents = []
  state.lastReason = null
  seenEventKeys.clear()
}

export function useZcodeProjection() {
  const sessionCount = computed(() => Object.keys(state.sessions).length)
  const lastReasonText = computed(() =>
    state.lastReason ? (REASON_CHIP_TEXT[state.lastReason] ?? state.lastReason) : '')
  const lastReasonIsTrouble = computed(() =>
    state.lastReason !== null && !['queued', 'coalesced', 'deferred'].includes(state.lastReason))
  return { state, sessionCount, lastReasonText, lastReasonIsTrouble }
}
