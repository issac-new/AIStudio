import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { connectChatRun, resumeSession, type RunEvent, type ResumeSessionPayload } from '@/api/hermes/chat'
import { fetchSessionMessagesPage } from '@/api/hermes/sessions'
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

  /** Live mode: attach to real-time socket. If session is ended, fallback to replay. */
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
    // Try to fetch L2 data + historical messages for context
    fetchL2Data(sid)
    // Also fetch historical messages as fallback (in case session is ended)
    fetchSessionMessagesPage(sid, 0, 500).then(page => {
      if (page && page.messages && page.messages.length > 0 && state.value && state.value.nodes.length === 0) {
        // No live events received; rebuild from history
        processMessages(page.messages, sid)
      }
    }).catch(() => {})
  }

  /** Replay mode: fetch historical messages via REST API and rebuild trace */
  async function startReplay(sid: string, fromTime: number) {
    mode.value = 'replay'
    scrubberTime.value = fromTime
    replayProgress.value = 0

    // Initialize state with a synthetic run.started so tool/thinking events are accepted
    let s = createTraceState(sid)
    const startedEvent: RunEvent = {
      event: 'run.started',
      session_id: sid,
      run_id: `replay-${sid}`,
      timestamp: fromTime,
    } as any
    s = applyRunEvent(s, startedEvent)
    sync(s)

    try {
      // Fetch messages via REST API (reliable for ended sessions)
      const page = await fetchSessionMessagesPage(sid, 0, 500)
      if (page && page.messages && page.messages.length > 0) {
        // Set session start time from first message
        const firstMsg = page.messages[0]
        if (firstMsg?.timestamp) {
          sessionStartedAt.value = firstMsg.timestamp * 1000
        }
        await processMessages(page.messages, sid)
      }
      // Also try resumeSession for live events (if session is still active)
      try {
        const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
          processResumeData(data, sid)
        })
        replayAbort = () => {
          removeSocketListener(socket, 'resumed', () => {})
          socket.disconnect()
        }
      } catch {
        // Session may be ended; REST messages are sufficient
      }
      // Fetch L2 data for accurate tool durations
      await fetchL2Data(sid)
    } catch {
      // Fallback: try resumeSession only
      const socket = resumeSession(sid, (data: ResumeSessionPayload) => {
        processResumeData(data, sid)
      })
      replayAbort = () => {
        removeSocketListener(socket, 'resumed', () => {})
        socket.disconnect()
      }
    }
  }

  /** Process historical messages to rebuild trace */
  async function processMessages(messages: any[], sid: string) {
    const total = messages.length
    let processed = 0

    for (const msg of messages) {
      const ts = msg.timestamp * 1000 // messages use seconds
      const role = msg.role || msg.display_role

      // Synthesize run.started for the first user message
      if (role === 'user' && processed === 0) {
        const startEvent: RunEvent = {
          event: 'run.started',
          session_id: sid,
          run_id: `replay-${sid}`,
          timestamp: ts,
        } as any
        sync(applyRunEvent(state.value!, startEvent))
      }

      // Tool messages → tool.completed events
      if (role === 'tool' || msg.tool_name) {
        const toolEvent: RunEvent = {
          event: 'tool.completed',
          session_id: sid,
          run_id: `replay-${sid}`,
          tool: msg.tool_name || 'tool',
          name: msg.tool_name,
          output: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '',
          timestamp: ts,
        } as any
        // First emit tool.started for node creation
        const startEvent: RunEvent = {
          event: 'tool.started',
          session_id: sid,
          run_id: `replay-${sid}`,
          tool: msg.tool_name || 'tool',
          name: msg.tool_name,
          preview: '',
          timestamp: ts - 1,
        } as any
        sync(applyRunEvent(state.value!, startEvent))
        sync(applyRunEvent(state.value!, toolEvent))
      }

      // Reasoning content → reasoning.delta events
      const reasoning = msg.reasoning || msg.reasoning_content
      if (reasoning && typeof reasoning === 'string' && reasoning.trim()) {
        const reasoningEvent: RunEvent = {
          event: 'reasoning.delta',
          session_id: sid,
          run_id: `replay-${sid}`,
          text: reasoning,
          timestamp: ts,
        } as any
        sync(applyRunEvent(state.value!, reasoningEvent))
      }

      // Assistant text → message.delta
      if (role === 'assistant' && msg.content) {
        const msgEvent: RunEvent = {
          event: 'message.delta',
          session_id: sid,
          run_id: `replay-${sid}`,
          delta: msg.content,
          timestamp: ts,
        } as any
        sync(applyRunEvent(state.value!, msgEvent))
      }

      processed++
      replayProgress.value = Math.round((processed / total) * 100)
      // Yield to UI every 20 messages
      if (processed % 20 === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
    }

    // Emit run.completed to close the workflow node
    const endEvent: RunEvent = {
      event: 'run.completed',
      session_id: sid,
      run_id: `replay-${sid}`,
      timestamp: messages.length > 0 ? messages[messages.length - 1].timestamp * 1000 : Date.now(),
    } as any
    sync(applyRunEvent(state.value!, endEvent))
  }

  /** Process ResumeSessionPayload events (if session is still active) */
  function processResumeData(data: ResumeSessionPayload, sid: string) {
    // If data has events array (live RunEvent stream), process directly
    if (data.events && Array.isArray(data.events) && data.events.length > 0) {
      const total = data.events.length
      let processed = 0
      for (const { event, data: eventData } of data.events) {
        const runEvent = { ...eventData, event, session_id: sid } as RunEvent
        sync(applyRunEvent(state.value!, runEvent))
        processed++
        replayProgress.value = Math.round((processed / total) * 100)
      }
    }
    // Process messages if events not available
    else if (data.messages && Array.isArray(data.messages) && data.messages.length > 0 && state.value!.nodes.length <= 1) {
      processMessages(data.messages, sid)
    }
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
