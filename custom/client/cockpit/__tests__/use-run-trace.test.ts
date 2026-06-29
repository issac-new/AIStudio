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
}))

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
    expect(mocks.socket.off).toHaveBeenCalledTimes(events.length)
    expect(mocks.connectChatRun).toHaveBeenCalledTimes(2)
    expect(trace.state.value?.sessionId).toBe('s2')

    scope.stop()
    expect(mocks.socket.off).toHaveBeenCalledTimes(events.length * 2)
  })

  it('filters events from other sessions', () => {
    const scope = effectScope()
    let trace!: ReturnType<typeof useRunTrace>
    scope.run(() => {
      trace = useRunTrace(ref<string | null>('s1'))
    })

    const runStarted = mocks.socket.on.mock.calls.find(([event]) => event === 'run.started')![1]
    runStarted({ event: 'run.started', run_id: 'r2', session_id: 'other', timestamp: 1 })
    expect(trace.nodes.value).toEqual([])
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
