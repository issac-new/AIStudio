import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { connectChatRun, resumeSession, type RunEvent, type ResumeSessionPayload } from '@/api/hermes/chat'
import {
  applyRunEvent,
  createTraceState,
  fetchLayer2Trace,
  mergeLayer2Data,
  type TraceState,
} from '../adapters/run-trace-adapter'

type SocketLike = ReturnType<typeof connectChatRun>
type EventHandler = (event: RunEvent) => void
type TraceMode = 'live' | 'replay'

const TRACE_EVENTS = [
  'message.delta',
  'reasoning.delta',
  'thinking.delta',
  'reasoning.available',
  'tool.started',
  'tool.completed',
  'subagent.start',
  'subagent.tool',
  'subagent.progress',
  'subagent.complete',
  'run.started',
  'run.completed',
  'run.failed',
  'usage.updated',
] as const

function removeSocketListener(socket: SocketLike, event: string, handler: EventHandler): void {
  const candidate = socket as SocketLike & {
    off?: (event: string, handler: EventHandler) => SocketLike
    removeListener?: (event: string, handler: EventHandler) => SocketLike
  }
  if (typeof candidate.off === 'function') {
    candidate.off(event, handler)
    return
  }
  candidate.removeListener?.(event, handler)
}

export function useRunTrace(sessionId: Ref<string | null>) {
  const state = ref<TraceState | null>(sessionId.value ? createTraceState(sessionId.value) : null)
  const nodes = ref<TraceState['nodes']>(state.value?.nodes ?? [])
  const edges = ref<TraceState['edges']>(state.value?.edges ?? [])
  const focusedNodeId = ref<string | null>(state.value?.focusedNodeId ?? null)
  const l2Available = ref(false)  // Whether L2 trace data was fetched successfully

  // Live/Replay mode state
  const mode = ref<TraceMode>('live')
  const scrubberTime = ref<number>(Date.now()) // scrubber 当前时间点 (ms)
  const replayProgress = ref<number>(0) // 回放进度 0-100%
  const sessionStartedAt = ref<number>(0) // session 开始时间，用于时间轴范围

  let cleanup: (() => void) | null = null
  let replayAbort: (() => void) | null = null

  function sync(next: TraceState | null) {
    state.value = next
    nodes.value = next?.nodes ?? []
    edges.value = next?.edges ?? []
    focusedNodeId.value = next?.focusedNodeId ?? null
  }

  function route(event: RunEvent) {
    const sid = sessionId.value
    if (!sid || event.session_id !== sid || !state.value) return
    const next = applyRunEvent(state.value, event)
    sync(next)
    // Update scrubber time to latest event timestamp
    const eventTs = event.timestamp ?? Date.now()
    if (eventTs > scrubberTime.value) scrubberTime.value = eventTs
    // When run completes, try to fetch L2 data
    if ((event.event === 'run.completed' || event.event === 'run.failed') && sid) {
      fetchL2Data(sid)
    }
  }

  /** Fetch Layer 2 trace data from backend API and merge into current state */
  async function fetchL2Data(sid: string) {
    const l2Data = await fetchLayer2Trace(sid)
    if (!l2Data || !state.value) return
    const merged = mergeLayer2Data(state.value, l2Data)
    sync(merged)
    l2Available.value = true
    // Update session startedAt from L2 meta if available
    if (l2Data.meta?.started_at) sessionStartedAt.value = l2Data.meta.started_at * 1000
  }

  function detach() {
    cleanup?.()
    cleanup = null
    replayAbort?.()
    replayAbort = null
  }

  /** Live mode: attach to real-time socket */
  function attachLive(sid: string) {
    mode.value = 'live'
    scrubberTime.value = Date.now()
    replayProgress.value = 0
    sync(createTraceState(sid))
    const socket = connectChatRun()
    const handlers = TRACE_EVENTS.map((eventName) => {
      const handler: EventHandler = (event) => route({ ...event, event: event.event || eventName })
      socket.on(eventName, handler)
      return { eventName, handler }
    })
    cleanup = () => {
      handlers.forEach(({ eventName, handler }) => removeSocketListener(socket, eventName, handler))
    }
    // Try to fetch L2 data immediately (for replay scenarios)
    fetchL2Data(sid)
  }

  /** Replay mode: call resumeSession to get historical events */
  async function startReplay(sid: string, fromTime: number) {
    mode.value = 'replay'
    scrubberTime.value = fromTime
    replayProgress.value = 0
    sync(createTraceState(sid))

    // Call resumeSession to get historical messages/events
    const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
      // Process resumed data - extract events from messages
      // ResumeSessionPayload contains messages, we need to synthesize RunEvents
      processResumeData(data, sid)
    })

    replayAbort = () => {
      removeSocketListener(socket, 'resumed', () => {})
      socket.disconnect()
    }
  }

  /** Process ResumeSessionPayload to synthesize RunEvents */
  function processResumeData(data: ResumeSessionPayload, sid: string) {
    // Extract session startedAt
    if (data.started_at) sessionStartedAt.value = data.started_at * 1000

    // If data has events array, process directly
    if (data.events && Array.isArray(data.events)) {
      let processed = 0
      const total = data.events.length
      for (const event of data.events) {
        const next = applyRunEvent(state.value!, event as RunEvent)
        sync(next)
        processed++
        replayProgress.value = Math.round((processed / total) * 100)
      }
      return
    }

    // Otherwise, synthesize events from messages
    if (data.messages && Array.isArray(data.messages)) {
      let processed = 0
      const total = data.messages.length
      for (const msg of data.messages) {
        // Synthesize tool events from tool messages
        if (msg.role === 'tool') {
          const toolEvent: RunEvent = {
            event: 'tool.completed',
            session_id: sid,
            tool: msg.name || 'unknown',
            name: msg.name,
            timestamp: msg.timestamp,
          }
          const next = applyRunEvent(state.value!, toolEvent)
          sync(next)
        }
        // Synthesize reasoning events from reasoning_content
        if (msg.reasoning_content || msg.reasoning) {
          const reasoningEvent: RunEvent = {
            event: 'reasoning.delta',
            session_id: sid,
            text: msg.reasoning_content || msg.reasoning || '',
            timestamp: msg.timestamp,
          }
          const next = applyRunEvent(state.value!, reasoningEvent)
          sync(next)
        }
        processed++
        replayProgress.value = Math.round((processed / total) * 100)
      }
    }

    // Fetch L2 data for accurate tool durations
    fetchL2Data(sid)
  }

  /** Switch to live mode */
  function switchToLive() {
    const sid = sessionId.value
    if (!sid) return
    detach()
    attachLive(sid)
  }

  /** Switch to replay mode at specific time */
  function switchToReplay(time: number) {
    const sid = sessionId.value
    if (!sid) return
    detach()
    startReplay(sid, time)
  }

  /** Update scrubber position (drag) — 自动从 Live 切换到 Replay */
  function scrubTo(time: number) {
    // 如果当前是 Live 模式且用户开始拖动，自动切换到 Replay
    if (mode.value === 'live') {
      scrubberTime.value = time
      // 不立即 startReplay（拖动中频繁触发开销大），等用户松开点击 Replay 按钮
      return
    }
    scrubberTime.value = time
  }

  watch(sessionId, (sid) => {
    detach()
    if (sid) attachLive(sid)
    else sync(null)
  }, { immediate: true })

  onScopeDispose(detach)

  return {
    state, nodes, edges, focusedNodeId, l2Available,
    mode, scrubberTime, replayProgress, sessionStartedAt,
    route, fetchL2Data, switchToLive, switchToReplay, scrubTo,
  }
}
