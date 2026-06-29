import { describe, expect, it } from 'vitest'
import {
  createTraceState,
  applyRunEvent,
  getFocusedNode,
  activateSkill,
  mergeTraceStates,
  type TraceState,
} from '../adapters/run-trace-adapter'

const evt = (over: Record<string, any> = {}) => ({
  event: 'run.started',
  run_id: 'run-1',
  session_id: 's1',
  timestamp: 1000,
  ...over,
})

describe('run-trace-adapter', () => {
  it('creates an empty trace state', () => {
    const state = createTraceState('s1')
    expect(state.sessionId).toBe('s1')
    expect(state.nodes).toEqual([])
    expect(state.edges).toEqual([])
    expect(state.focusedNodeId).toBeNull()
  })

  it('creates ingress and run nodes on run.started', () => {
    let state: TraceState = createTraceState('s1')
    state = applyRunEvent(state, evt())

    expect(state.nodes.map(n => [n.kind, n.label, n.evidence])).toEqual([
      ['ingress', '外部消息', 'L1'],
      ['workflow', 'Run run-1', 'L1'],
    ])
    expect(state.edges).toEqual([
      expect.objectContaining({ from: 'ingress:s1', to: 'run:s1:run-1', kind: 'spawn', evidence: 'L1' }),
    ])
    expect(state.focusedNodeId).toBe('run:s1:run-1')
    expect(getFocusedNode(state)?.label).toBe('Run run-1')
  })

  it('tracks tool lifecycle with duration and error status', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({
      event: 'tool.started', run_id: 'run-1', timestamp: 1100,
      tool: 'read_file', name: 'read_file', preview: '{"path":"src/auth.ts"}',
    }))
    state = applyRunEvent(state, evt({
      event: 'tool.completed', run_id: 'run-1', timestamp: 1600,
      tool: 'read_file', name: 'read_file', output: 'ok',
    }))

    const tool = state.nodes.find(n => n.kind === 'tool')!
    expect(tool.label).toBe('read_file')
    expect(tool.status).toBe('ok')
    expect(tool.durationMs).toBe(500)
    expect(tool.evidence).toBe('L1')
    expect(state.edges.some(e => e.kind === 'call' && e.to === tool.id)).toBe(true)
  })

  it('marks failed tool with error status and keeps error text', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({
      event: 'tool.started', run_id: 'run-1', timestamp: 1100, tool: 'run_tests', name: 'run_tests',
    }))
    state = applyRunEvent(state, evt({
      event: 'tool.completed', run_id: 'run-1', timestamp: 1300, tool: 'run_tests', name: 'run_tests', error: '2 failed',
    }))

    const tool = state.nodes.find(n => n.kind === 'tool')!
    expect(tool.status).toBe('error')
    expect(tool.detail).toBe('2 failed')
    expect(tool.durationMs).toBe(200)
  })

  it('stores reasoning as a thinking timeline item on the run node', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'reasoning.delta', run_id: 'run-1', timestamp: 1200, text: '先读现有实现。' }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.children).toEqual([
      expect.objectContaining({ kind: 'thinking', text: '先读现有实现。', attribution: 'accurate' }),
    ])
  })

  it('does not mix message.delta into thinking items', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'message.delta', run_id: 'run-1', timestamp: 1200, delta: '最终回答' }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.children?.some(i => i.kind === 'thinking')).toBe(false)
    expect(state.outputText).toBe('最终回答')
  })

  it('marks run completed and stores usage', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({
      event: 'run.completed', run_id: 'run-1', timestamp: 3000,
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.status).toBe('ok')
    expect(run.durationMs).toBe(2000)
    expect(state.usage?.total_tokens).toBe(30)
  })

  it('marks run failed with error status', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'run.failed', run_id: 'run-1', timestamp: 2500, error: 'boom' }))

    const run = state.nodes.find(n => n.kind === 'workflow')!
    expect(run.status).toBe('error')
    expect(run.durationMs).toBe(1500)
  })

  it('creates subagent nodes with delegate edges', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'subagent.start', run_id: 'run-1', timestamp: 1200, name: 'subagent 1/2', preview: '调研鉴权方案' }))

    const sub = state.nodes.find(n => n.kind === 'agent' && n.label.includes('subagent'))!
    expect(sub.status).toBe('running')
    expect(sub.evidence).toBe('L1')
    expect(state.edges.some(e => e.kind === 'delegate' && e.to === sub.id)).toBe(true)
  })

  it('updates the same subagent node on completion', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'subagent.start', run_id: 'run-1', timestamp: 1200, name: 'subagent 1/2', preview: '调研鉴权方案' }))
    state = applyRunEvent(state, evt({ event: 'subagent.complete', run_id: 'run-1', timestamp: 2200, name: 'subagent 1/2' }))

    const subs = state.nodes.filter(n => n.kind === 'agent' && n.label.includes('subagent'))
    expect(subs).toHaveLength(1)
    expect(subs[0].status).toBe('ok')
    expect(subs[0].durationMs).toBe(1000)
  })

  it('activates a skill node and attributes thinking/tool items as inferred', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = activateSkill(state, { skillName: 'auth-refactor', ts: 1100, detail: 'SKILL.md v2' })
    state = applyRunEvent(state, evt({ event: 'reasoning.delta', run_id: 'run-1', timestamp: 1200, text: '先读现有实现。' }))
    state = applyRunEvent(state, evt({ event: 'tool.started', run_id: 'run-1', timestamp: 1300, tool: 'read_file' }))

    const skill = state.nodes.find(n => n.kind === 'skill')!
    expect(skill.label).toBe('auth-refactor')
    expect(skill.children?.map(i => [i.kind, i.attribution])).toEqual([
      ['thinking', 'inferred'],
      ['tool', 'inferred'],
    ])
  })

  it('clears active skill when a new run starts', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = activateSkill(state, { skillName: 'auth-refactor', ts: 1100, detail: 'SKILL.md v2' })
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-2', timestamp: 2000 }))
    state = applyRunEvent(state, evt({ event: 'reasoning.delta', run_id: 'run-2', timestamp: 2100, text: 'new run thinking' }))

    const oldSkill = state.nodes.find(n => n.kind === 'skill')!
    const newRun = state.nodes.find(n => n.id === 'run:s1:run-2')!
    expect(oldSkill.children).toEqual([])
    expect(newRun.children?.[0]).toEqual(expect.objectContaining({ kind: 'thinking', text: 'new run thinking' }))
  })

  it('ignores delayed events for a previous run_id', () => {
    let state = createTraceState('s1')
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-1', timestamp: 1000 }))
    state = applyRunEvent(state, evt({ event: 'run.started', run_id: 'run-2', timestamp: 2000 }))
    state = applyRunEvent(state, evt({ event: 'run.completed', run_id: 'run-1', timestamp: 3000 }))

    const run1 = state.nodes.find(n => n.id === 'run:s1:run-1')!
    const run2 = state.nodes.find(n => n.id === 'run:s1:run-2')!
    expect(run1.status).toBe('running')
    expect(run2.status).toBe('running')
  })
})

describe('mergeTraceStates', () => {
  it('merges nodes and edges from multiple states without collision', () => {
    let main = createTraceState('s1')
    main = applyRunEvent(main, { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000 })

    let other = createTraceState('s2')
    other = applyRunEvent(other, { event: 'run.started', session_id: 's2', run_id: 'r2', timestamp: 2000 })

    const merged = mergeTraceStates(main, [other])
    // 应有 s1 和 s2 的 ingress 节点
    expect(merged.nodes.some(n => n.id === 'ingress:s1')).toBe(true)
    expect(merged.nodes.some(n => n.id === 'ingress:s2')).toBe(true)
    // 应有 s1 和 s2 的 run 节点
    expect(merged.nodes.some(n => n.id === 'run:s1:r1')).toBe(true)
    expect(merged.nodes.some(n => n.id === 'run:s2:r2')).toBe(true)
    // 应有 delegate 边 s2.ingress → s1.ingress
    expect(merged.edges.some(e => e.from === 'ingress:s2' && e.to === 'ingress:s1' && e.kind === 'delegate')).toBe(true)
  })

  it('preserves main sessionId/runId/focusedNodeId', () => {
    let main = createTraceState('main-sid')
    main = applyRunEvent(main, { event: 'run.started', session_id: 'main-sid', run_id: 'main-run', timestamp: 1000 })
    const mainFocused = main.focusedNodeId

    let other = createTraceState('other-sid')
    other = applyRunEvent(other, { event: 'run.started', session_id: 'other-sid', run_id: 'other-run', timestamp: 2000 })

    const merged = mergeTraceStates(main, [other])
    expect(merged.sessionId).toBe('main-sid')
    expect(merged.focusedNodeId).toBe(mainFocused)
  })

  it('deduplicates nodes by id', () => {
    let main = createTraceState('s1')
    main = applyRunEvent(main, { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000 })
    const mainNodeCount = main.nodes.length

    const merged = mergeTraceStates(main, [])  // no others
    expect(merged.nodes.length).toBe(mainNodeCount)
  })
})

describe('relatedSessionIds', () => {
  it('createTraceState accepts optional relatedSessionIds', () => {
    const ids = new Set(['s1', 's2', 's3'])
    const state = createTraceState('s1', ids)
    expect(state.relatedSessionIds).toBe(ids)
  })

  it('applyRunEvent accepts events from related sessions', () => {
    const ids = new Set(['s1', 's2'])
    let state = createTraceState('s1', ids)
    // s1 的 run.started 设置 state.runId
    state = applyRunEvent(state, { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000 })
    // s2 的 run.started 应被接受（因 s2 在 relatedSessionIds 中）
    state = applyRunEvent(state, { event: 'run.started', session_id: 's2', run_id: 'r2', timestamp: 2000 })
    expect(state.nodes.some(n => n.id === 'run:s2:r2')).toBe(true)
  })

  it('applyRunEvent still filters events from unrelated sessions', () => {
    let state = createTraceState('s1', new Set(['s1', 's2']))
    state = applyRunEvent(state, { event: 'run.started', session_id: 's1', run_id: 'r1', timestamp: 1000 })
    // s3 不在 relatedSessionIds → 其事件应被过滤
    state = applyRunEvent(state, { event: 'run.started', session_id: 's3', run_id: 'r3', timestamp: 3000 })
    expect(state.nodes.some(n => n.id === 'run:s3:r3')).toBe(false)
  })
})
