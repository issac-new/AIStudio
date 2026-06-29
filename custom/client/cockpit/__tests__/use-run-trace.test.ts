import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick, effectScope } from 'vue'
import { useRunTrace } from '../composables/useRunTrace'

const mocks = vi.hoisted(() => {
  const socket = {
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
  }
  return {
    connectChatRun: vi.fn(() => socket),
    socket,
  }
})

vi.mock('@/api/hermes/chat', () => ({
  connectChatRun: mocks.connectChatRun,
  resumeSession: vi.fn((_sid: string, onResumed: (data: any) => void) => mocks.socket),
}))

vi.mock('@/api/hermes/sessions', () => ({
  fetchSessionMessagesPage: vi.fn(async () => ({ messages: [], total: 0, offset: 0, limit: 500, hasMore: false, session: {} })),
  // also mock SessionSummary type for re-export compatibility
}))

vi.mock('@/api/hermes/kanban', () => ({
  getTask: vi.fn(async () => ({ parents: [], children: [] })),
}))

/** flush all pending microtasks (await loadRelatedSessions etc.) */
function flush() { return new Promise(r => setTimeout(r, 0)) }

describe('useRunTrace', () => {
  beforeEach(() => {
    mocks.connectChatRun.mockClear()
    mocks.socket.on.mockClear()
    mocks.socket.off.mockClear()
    mocks.socket.removeListener.mockClear()
  })

  it('attaches socket listeners without touching singleton session handlers and cleans up on session change', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    const sessionId = ref<string | null>('s1')

    scope.run(() => {
      trace = useRunTrace(sessionId)
    })

    // attachLive is async (awaits loadRelatedSessions); flush before checking
    await flush()
    expect(mocks.connectChatRun).toHaveBeenCalledTimes(1)
    const events = mocks.socket.on.mock.calls.map(([event]) => event).sort()
    expect(events).toEqual([
      'message.delta', 'reasoning.available', 'reasoning.delta', 'run.completed', 'run.failed',
      'run.started', 'subagent.complete', 'subagent.progress', 'subagent.start', 'subagent.tool',
      'thinking.delta', 'tool.completed', 'tool.started', 'usage.updated',
    ].sort())

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    runStarted({ event: 'run.started', run_id: 'r1', session_id: 's1', timestamp: 1 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(true)

    sessionId.value = 's2'
    await nextTick()
    await flush()
    expect(mocks.socket.off).toHaveBeenCalledTimes(events.length)
    expect(mocks.connectChatRun).toHaveBeenCalledTimes(2)
    expect(trace.state.value?.sessionId).toBe('s2')

    scope.stop()
    expect(mocks.socket.off).toHaveBeenCalledTimes(events.length * 2)
  })

  it('filters events from other sessions', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>('s1'))
    })

    await flush()
    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    runStarted({ event: 'run.started', run_id: 'r2', session_id: 'other', timestamp: 1 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(false)
    scope.stop()
  })

  it('accepts events from related sessions when aggregate mode is on and session is in relatedSessionIds', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    const sessionId = ref<string | null>('s1')
    scope.run(() => {
      trace = useRunTrace(sessionId)
    })

    await flush()
    // 手动设置 relatedSessionIds
    trace.relatedSessionIds.value = new Set(['s1', 's2'])
    trace.aggregateMode.value = true

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    // s2 的 run.started 应被接受（因在 relatedSessionIds 中且 aggregateMode=true）
    runStarted({ event: 'run.started', run_id: 'r2', session_id: 's2', timestamp: 2 })
    expect(trace.nodes.value.some(n => n.kind === 'workflow')).toBe(true)

    scope.stop()
  })

  it('filters events from unrelated sessions even when aggregate mode is on', async () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>('s1'))
    })

    await flush()
    trace.relatedSessionIds.value = new Set(['s1', 's2'])
    trace.aggregateMode.value = true

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    // s3 不在 relatedSessionIds → 应被过滤
    runStarted({ event: 'run.started', run_id: 'r3', session_id: 's3', timestamp: 3 })
    expect(trace.nodes.value.some(n => n.id === 'run:s3:r3')).toBe(false)

    scope.stop()
  })

  it('does not connect when session id is null', () => {
    const scope = effectScope()
    scope.run(() => {
      useRunTrace(ref<string | null>(null))
    })
    expect(mocks.connectChatRun).not.toHaveBeenCalled()
    scope.stop()
  })
})
