import { ref, watch, onScopeDispose, type Ref } from 'vue'
import { connectChatRun, type RunEvent } from '@/api/hermes/chat'
import {
  applyRunEvent,
  createTraceState,
  type TraceState,
} from '../adapters/run-trace-adapter'

type SocketLike = ReturnType<typeof connectChatRun>
type EventHandler = (event: RunEvent) => void

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
  let cleanup: (() => void) | null = null

  function sync(next: TraceState | null) {
    state.value = next
    nodes.value = next?.nodes ?? []
    edges.value = next?.edges ?? []
    focusedNodeId.value = next?.focusedNodeId ?? null
  }

  function route(event: RunEvent) {
    const sid = sessionId.value
    if (!sid || event.session_id !== sid || !state.value) return
    sync(applyRunEvent(state.value, event))
  }

  function detach() {
    cleanup?.()
    cleanup = null
  }

  function attach(sid: string) {
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
  }

  watch(sessionId, (sid) => {
    detach()
    if (sid) attach(sid)
    else sync(null)
  }, { immediate: true })

  onScopeDispose(detach)

  return { state, nodes, edges, focusedNodeId, route }
}
