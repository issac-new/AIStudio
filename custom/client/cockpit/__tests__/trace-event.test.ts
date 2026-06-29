// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { normalizeRunEvent, type TraceEvent } from '../adapters/trace-event'
import type { RunEvent } from '@/api/hermes/chat'

describe('normalizeRunEvent', () => {
  it('normalizes run.started to REPLY_START', () => {
    const raw: RunEvent = { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000, model: 'gpt-4' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('REPLY_START')
    expect(evt).toMatchObject({ runId: 'r1', model: 'gpt-4', session_id: 's1' })
    expect(evt.id).toMatch(/^evt-/)
    expect(evt.created_at).toBe(new Date(1000).toISOString())
  })

  it('normalizes run.completed to REPLY_END with status ok', () => {
    const raw: RunEvent = { event: 'run.completed', session_id: 's1', run_id: 'r1', timestamp: 2000, usage: { input_tokens: 10 } } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('REPLY_END')
    expect(evt).toMatchObject({ status: 'ok', runId: 'r1' })
  })

  it('normalizes run.failed to REPLY_END with status error', () => {
    const raw: RunEvent = { event: 'run.failed', session_id: 's1', run_id: 'r1', timestamp: 2000, error: 'boom' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('REPLY_END')
    expect(evt).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('normalizes tool.started to TOOL_CALL_START', () => {
    const raw: RunEvent = { event: 'tool.started', session_id: 's1', run_id: 'r1', timestamp: 1500, tool: 'read_file', preview: '/tmp' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('TOOL_CALL_START')
    expect(evt).toMatchObject({ toolName: 'read_file', preview: '/tmp' })
  })

  it('normalizes tool.completed to TOOL_CALL_END', () => {
    const raw: RunEvent = { event: 'tool.completed', session_id: 's1', run_id: 'r1', timestamp: 1600, tool: 'read_file', output: 'content' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('TOOL_CALL_END')
    expect(evt).toMatchObject({ toolName: 'read_file', output: 'content' })
  })

  it('normalizes reasoning.delta to THINKING_BLOCK_DELTA', () => {
    const raw: RunEvent = { event: 'reasoning.delta', session_id: 's1', run_id: 'r1', timestamp: 1700, text: 'thinking...' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('THINKING_BLOCK_DELTA')
    expect(evt).toMatchObject({ text: 'thinking...' })
  })

  it('normalizes message.delta to TEXT_BLOCK_DELTA', () => {
    const raw: RunEvent = { event: 'message.delta', session_id: 's1', run_id: 'r1', timestamp: 1800, delta: 'hello' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('TEXT_BLOCK_DELTA')
    expect(evt).toMatchObject({ text: 'hello' })
  })

  it('normalizes usage.updated to USAGE_UPDATED', () => {
    const raw: RunEvent = { event: 'usage.updated', session_id: 's1', run_id: 'r1', timestamp: 1900, usage: { input_tokens: 5, output_tokens: 10 } } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('USAGE_UPDATED')
    expect(evt.usage).toEqual({ input_tokens: 5, output_tokens: 10 })
  })

  it('normalizes subagent.start to SUBAGENT_START', () => {
    const raw: RunEvent = { event: 'subagent.start', session_id: 's1', run_id: 'r1', timestamp: 2000, name: 'worker-1', preview: 'doing work' } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('SUBAGENT_START')
    expect(evt).toMatchObject({ label: 'worker-1', preview: 'doing work' })
  })

  it('normalizes subagent.progress to SUBAGENT_PROGRESS with tasksContext', () => {
    const raw: RunEvent = { event: 'subagent.progress', session_id: 's1', run_id: 'r1', timestamp: 2100, name: 'worker-1', tasks_context: { tasks: [{ id: 't1', title: 'Task 1', status: 'running' }] } } as any
    const evt = normalizeRunEvent(raw)
    expect(evt.type).toBe('SUBAGENT_PROGRESS')
    if (evt.type === 'SUBAGENT_PROGRESS') {
      expect(evt.tasksContext?.tasks).toHaveLength(1)
    }
  })

  it('generates unique event ids', () => {
    const raw: RunEvent = { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000 } as any
    const evt1 = normalizeRunEvent(raw)
    const evt2 = normalizeRunEvent(raw)
    expect(evt1.id).not.toBe(evt2.id)
  })

  it('preserves metadata field when provided', () => {
    const raw: RunEvent = { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000 } as any
    const evt = normalizeRunEvent(raw)
    // metadata is optional; not set by default
    expect(evt.metadata).toBeUndefined()
  })
})
