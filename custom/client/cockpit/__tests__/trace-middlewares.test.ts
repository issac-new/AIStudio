// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { applyTraceEvent, defaultMiddlewares, runLifecycleMiddleware, toolTraceMiddleware, thinkingTraceMiddleware, usageMiddleware, stateChangeMiddleware, type TraceMiddleware } from '../adapters/trace-middlewares'
import { createTraceState } from '../adapters/run-trace-adapter'
import type { TraceEvent, ReplyStartEvent, ReplyEndEvent, ToolCallStartEvent, ToolCallEndEvent, ThinkingBlockDeltaEvent, TextBlockDeltaEvent, UsageUpdatedEvent, StateUpdatedEvent } from '../adapters/trace-event'

function makeEvent<T extends TraceEvent>(partial: Partial<T> & { type: T['type']; session_id?: string; timestamp?: number }): T {
  return {
    id: `evt-test-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date(partial.timestamp ?? 1000).toISOString(),
    session_id: partial.session_id ?? 's1',
    timestamp: partial.timestamp ?? 1000,
    ...partial,
  } as T
}

describe('runLifecycleMiddleware', () => {
  it('creates ingress + workflow nodes on REPLY_START', () => {
    const state = createTraceState('s1')
    const evt = makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', model: 'gpt-4', timestamp: 1000 })
    const next = applyTraceEvent(state, evt, [runLifecycleMiddleware])
    expect(next.nodes).toHaveLength(2)
    expect(next.nodes.find(n => n.kind === 'ingress')).toBeTruthy()
    expect(next.nodes.find(n => n.kind === 'workflow')?.label).toBe('Run r1')
    expect(next.runId).toBe('r1')
    expect(next.edges).toHaveLength(1)
  })

  it('closes workflow node on REPLY_END with usage', () => {
    const state0 = applyTraceEvent(createTraceState('s1'), makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [runLifecycleMiddleware])
    const evt = makeEvent<ReplyEndEvent>({ type: 'REPLY_END', runId: 'r1', status: 'ok', usage: { input_tokens: 10 } as any, timestamp: 2000 })
    const next = applyTraceEvent(state0, evt, [runLifecycleMiddleware])
    const runNode = next.nodes.find(n => n.kind === 'workflow')!
    expect(runNode.status).toBe('ok')
    expect(runNode.endedAt).toBe(2000)
    expect(runNode.durationMs).toBe(1000)
    expect(next.usage).toEqual({ input_tokens: 10 })
  })

  it('sets error status on failed REPLY_END', () => {
    const state0 = applyTraceEvent(createTraceState('s1'), makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [runLifecycleMiddleware])
    const evt = makeEvent<ReplyEndEvent>({ type: 'REPLY_END', runId: 'r1', status: 'error', error: 'boom', timestamp: 2000 })
    const next = applyTraceEvent(state0, evt, [runLifecycleMiddleware])
    expect(next.nodes.find(n => n.kind === 'workflow')?.status).toBe('error')
  })
})

describe('toolTraceMiddleware', () => {
  it('creates tool node and edge from workflow', () => {
    let state = applyTraceEvent(createTraceState('s1'), makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [runLifecycleMiddleware])
    const evt = makeEvent<ToolCallStartEvent>({ type: 'TOOL_CALL_START', toolName: 'read_file', preview: '/tmp', timestamp: 1100 })
    state = applyTraceEvent(state, evt, [toolTraceMiddleware])
    expect(state.nodes.find(n => n.kind === 'tool')?.label).toBe('read_file')
    expect(state.edges.some(e => e.kind === 'call')).toBe(true)
    expect(Object.keys(state.openToolNodeIds)).toHaveLength(1)
  })

  it('closes tool node on TOOL_CALL_END', () => {
    let state = applyTraceEvent(createTraceState('s1'), makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [runLifecycleMiddleware])
    state = applyTraceEvent(state, makeEvent<ToolCallStartEvent>({ type: 'TOOL_CALL_START', toolName: 'read_file', timestamp: 1100 }), [toolTraceMiddleware])
    state = applyTraceEvent(state, makeEvent<ToolCallEndEvent>({ type: 'TOOL_CALL_END', toolName: 'read_file', output: 'content', timestamp: 1200 }), [toolTraceMiddleware])
    const toolNode = state.nodes.find(n => n.kind === 'tool')!
    expect(toolNode.status).toBe('ok')
    expect(toolNode.durationMs).toBe(100)
    expect(Object.keys(state.openToolNodeIds)).toHaveLength(0)
  })
})

describe('thinkingTraceMiddleware', () => {
  it('appends thinking item to workflow node', () => {
    let state = applyTraceEvent(createTraceState('s1'), makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [runLifecycleMiddleware])
    state = applyTraceEvent(state, makeEvent<ThinkingBlockDeltaEvent>({ type: 'THINKING_BLOCK_DELTA', text: 'hmm', timestamp: 1100 }), [thinkingTraceMiddleware])
    const runNode = state.nodes.find(n => n.kind === 'workflow')!
    expect(runNode.children?.some(c => c.kind === 'thinking' && c.text === 'hmm')).toBe(true)
  })

  it('accumulates text on TEXT_BLOCK_DELTA', () => {
    let state = createTraceState('s1')
    state = applyTraceEvent(state, makeEvent<TextBlockDeltaEvent>({ type: 'TEXT_BLOCK_DELTA', text: 'hello', timestamp: 1000 }), [thinkingTraceMiddleware])
    state = applyTraceEvent(state, makeEvent<TextBlockDeltaEvent>({ type: 'TEXT_BLOCK_DELTA', text: ' world', timestamp: 1100 }), [thinkingTraceMiddleware])
    expect(state.outputText).toBe('hello world')
  })
})

describe('usageMiddleware', () => {
  it('updates usage on USAGE_UPDATED', () => {
    const state = createTraceState('s1')
    const evt = makeEvent<UsageUpdatedEvent>({ type: 'USAGE_UPDATED', usage: { input_tokens: 5, output_tokens: 10 } as any, timestamp: 1000 })
    const next = applyTraceEvent(state, evt, [usageMiddleware])
    expect(next.usage).toEqual({ input_tokens: 5, output_tokens: 10 })
  })
})

describe('stateChangeMiddleware', () => {
  it('creates state node on STATE_UPDATED with tasksContext', () => {
    let state = applyTraceEvent(createTraceState('s1'), makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [runLifecycleMiddleware])
    const evt = makeEvent<StateUpdatedEvent>({
      type: 'STATE_UPDATED',
      timestamp: 1100,
      tasksContext: { tasks: [{ id: 't1', title: 'Task 1', status: 'running' }, { id: 't2', title: 'Task 2', status: 'done' }] },
    })
    state = applyTraceEvent(state, evt, [stateChangeMiddleware])
    const stateNode = state.nodes.find(n => n.label === 'State Update')
    expect(stateNode).toBeTruthy()
    expect(stateNode?.detail).toBe('2 tasks')
    expect(stateNode?.children).toHaveLength(2)
  })

  it('does nothing without tasksContext or permissionContext', () => {
    const state = applyTraceEvent(createTraceState('s1'), makeEvent<StateUpdatedEvent>({ type: 'STATE_UPDATED', timestamp: 1000 }), [stateChangeMiddleware])
    expect(state.nodes).toHaveLength(0)
  })
})

describe('defaultMiddlewares (full chain)', () => {
  it('processes a complete run lifecycle through all middlewares', () => {
    let state = createTraceState('s1')
    state = applyTraceEvent(state, makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }))
    state = applyTraceEvent(state, makeEvent<ThinkingBlockDeltaEvent>({ type: 'THINKING_BLOCK_DELTA', text: 'planning', timestamp: 1100 }))
    state = applyTraceEvent(state, makeEvent<ToolCallStartEvent>({ type: 'TOOL_CALL_START', toolName: 'bash', timestamp: 1200 }))
    state = applyTraceEvent(state, makeEvent<ToolCallEndEvent>({ type: 'TOOL_CALL_END', toolName: 'bash', output: 'ok', timestamp: 1300 }))
    state = applyTraceEvent(state, makeEvent<UsageUpdatedEvent>({ type: 'USAGE_UPDATED', usage: { input_tokens: 100 } as any, timestamp: 1400 }))
    state = applyTraceEvent(state, makeEvent<ReplyEndEvent>({ type: 'REPLY_END', runId: 'r1', status: 'ok', timestamp: 1500 }))

    expect(state.nodes.filter(n => n.kind === 'workflow')).toHaveLength(1)
    expect(state.nodes.filter(n => n.kind === 'tool')).toHaveLength(1)
    expect(state.nodes.filter(n => n.kind === 'ingress')).toHaveLength(1)
    expect(state.usage).toEqual({ input_tokens: 100 })
    const runNode = state.nodes.find(n => n.kind === 'workflow')!
    expect(runNode.children?.some(c => c.kind === 'thinking')).toBe(true)
    expect(runNode.status).toBe('ok')
  })

  it('supports custom middleware injection', () => {
    const auditLog: string[] = []
    const auditMiddleware: TraceMiddleware = {
      onReplyStart(state, event) {
        auditLog.push(`REPLY_START ${event.runId}`)
        return state
      },
      onToolCallStart(state, event) {
        auditLog.push(`TOOL ${event.toolName}`)
        return state
      },
    }
    let state = createTraceState('s1')
    state = applyTraceEvent(state, makeEvent<ReplyStartEvent>({ type: 'REPLY_START', runId: 'r1', timestamp: 1000 }), [...defaultMiddlewares, auditMiddleware])
    state = applyTraceEvent(state, makeEvent<ToolCallStartEvent>({ type: 'TOOL_CALL_START', toolName: 'bash', timestamp: 1100 }), [...defaultMiddlewares, auditMiddleware])
    expect(auditLog).toEqual(['REPLY_START r1', 'TOOL bash'])
  })
})
